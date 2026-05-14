import type { Team } from "../assets";
import { TOWER_ATTACK_WINDUP, TOWER_HERO_AGGRO_SECONDS } from "../data/game-config";
import { hasAlliedMinionNearBuilding } from "./objectives";
import { distance } from "./rules";
import type { Building, PendingDamageEvent, TowerAggroEntry, TowerAggroState, Unit } from "./types";

const TOWER_ATTACK_FLASH_SECONDS = 0.32;
const TOWER_HERO_AGGRO_DAMAGE_STEP = 0.22;
const TOWER_HERO_AGGRO_MAX_STACKS = 3;
const TEAMS: Team[] = ["azure", "crimson"];

interface TowerTargetResult {
  target?: Unit;
  clearAggro: boolean;
  heroAggro?: TowerAggroEntry;
}

export interface TowerAttackIntent {
  towerId: string;
  sourceTeam: Team;
  targetId: string;
  damage: number;
  vfx: NonNullable<PendingDamageEvent["vfx"]>;
  message: string;
}

interface ResolveTowerAttacksInput {
  buildings: Building[];
  units: Unit[];
  towerHeroAggro: TowerAggroState;
  dt: number;
}

interface RegisterTowerHeroAggroInput {
  target: Unit;
  sourceId?: string;
  units: Unit[];
  buildings: Building[];
  towerHeroAggro: TowerAggroState;
}

interface TowerDangerInput {
  unit: Unit;
  buildings: Building[];
  units: Unit[];
  towerHeroAggro: TowerAggroState;
}

export interface TowerDangerState {
  active: boolean;
  towerId: string | null;
  unsupported: boolean;
  distance: number | null;
  shots: number;
  nextDamage: number;
}

const INACTIVE_TOWER_DANGER: TowerDangerState = {
  active: false,
  towerId: null,
  unsupported: false,
  distance: null,
  shots: 0,
  nextDamage: 0,
};

export const tickTowerAggro = (towerHeroAggro: TowerAggroState, units: Unit[], dt: number) => {
  for (const team of TEAMS) {
    const aggro = towerHeroAggro[team];
    if (!aggro) continue;
    aggro.ttl -= dt;
    const target = units.find((unit) => unit.id === aggro.targetId);
    if (aggro.ttl <= 0 || !target?.alive) delete towerHeroAggro[team];
  }
};

export const registerTowerHeroAggro = ({ target, sourceId, units, buildings, towerHeroAggro }: RegisterTowerHeroAggroInput) => {
  if (target.kind !== "hero" || !sourceId) return false;
  const source = units.find((unit) => unit.id === sourceId);
  if (!source || source.kind !== "hero" || source.team === target.team || !source.alive) return false;
  const alliedTower = buildings.find((building) => building.id === towerIdForTeam(target.team));
  if (!alliedTower || alliedTower.hp <= 0 || distance(source, alliedTower) > alliedTower.attackRange) return false;
  const previousAggro = towerHeroAggro[target.team];
  towerHeroAggro[target.team] = {
    targetId: source.id,
    ttl: TOWER_HERO_AGGRO_SECONDS,
    shots: previousAggro?.targetId === source.id ? previousAggro.shots ?? 0 : 0,
  };
  return true;
};

export const resolveTowerAttacks = ({ buildings, units, towerHeroAggro, dt }: ResolveTowerAttacksInput) => {
  const intents: TowerAttackIntent[] = [];
  for (const building of buildings) {
    building.attackTimer = Math.max(0, building.attackTimer - dt);
    building.attackFlash = Math.max(0, building.attackFlash - dt);
    if (building.type !== "tower" || building.hp <= 0 || building.attackTimer > 0) continue;

    const targetResult = selectTowerTarget(building, units, towerHeroAggro[building.team]);
    if (targetResult.clearAggro) delete towerHeroAggro[building.team];
    const target = targetResult.target;
    if (!target) continue;

    building.attackTimer = building.attackCooldown;
    building.attackFlash = TOWER_ATTACK_FLASH_SECONDS;
    const damage = towerDamageForTarget(building, target, targetResult.heroAggro);
    if (targetResult.heroAggro) {
      targetResult.heroAggro.shots = Math.min(TOWER_HERO_AGGRO_MAX_STACKS, (targetResult.heroAggro.shots ?? 0) + 1);
    }
    intents.push({
      towerId: building.id,
      sourceTeam: building.team,
      targetId: target.id,
      damage,
      vfx: {
        key: building.team === "azure" ? "vfx-astra-r_shockwave" : "vfx-crimson-q_spear_thrust",
        x: target.x,
        y: target.y - 12,
        scale: 0.95,
      },
      message: `${building.team === "azure" ? "Azure" : "Crimson"} tower fired`,
    });
  }
  return intents;
};

export const towerDangerForUnit = ({ unit, buildings, units, towerHeroAggro }: TowerDangerInput): TowerDangerState => {
  if (!unit.alive) return INACTIVE_TOWER_DANGER;
  const tower = buildings
    .filter((building) => building.type === "tower" && building.hp > 0 && building.team !== unit.team && distance(unit, building) <= building.attackRange)
    .sort((a, b) => distance(unit, a) - distance(unit, b))[0];
  if (!tower) return INACTIVE_TOWER_DANGER;

  const aggro = towerHeroAggro[tower.team]?.targetId === unit.id ? towerHeroAggro[tower.team] : undefined;
  return {
    active: true,
    towerId: tower.id,
    unsupported: !hasAlliedMinionNearBuilding(unit.team, tower, units),
    distance: Math.round(distance(unit, tower)),
    shots: aggro?.shots ?? 0,
    nextDamage: towerDamageForTarget(tower, unit, aggro),
  };
};

export const createTowerDamageEvent = (intent: TowerAttackIntent, id: string, elapsed: number): PendingDamageEvent => ({
  id,
  triggerAt: elapsed + TOWER_ATTACK_WINDUP,
  sourceTeam: intent.sourceTeam,
  sourceId: intent.towerId,
  kind: "unit",
  targetId: intent.targetId,
  damage: intent.damage,
  buildingDamageMultiplier: 0,
  cancelIfSourceDead: true,
  vfx: intent.vfx,
});

const selectTowerTarget = (tower: Building, units: Unit[], aggro?: TowerAggroEntry): TowerTargetResult => {
  if (aggro) {
    const heroTarget = units.find((unit) => unit.id === aggro.targetId && unit.alive && distance(unit, tower) <= tower.attackRange);
    if (heroTarget) return { target: heroTarget, clearAggro: false, heroAggro: aggro };
    return { target: undefined, clearAggro: true };
  }

  const enemies = units.filter((unit) => unit.alive && unit.team !== tower.team && distance(unit, tower) <= tower.attackRange);
  return {
    target: enemies.sort((a, b) => towerTargetPriority(a) - towerTargetPriority(b) || distance(a, tower) - distance(b, tower))[0],
    clearAggro: false,
  };
};

export const towerDamageForTarget = (tower: Building, target: Unit, aggro?: TowerAggroEntry) => {
  if (!aggro || target.kind !== "hero") return tower.attackDamage;
  const stacks = Math.min(aggro.shots ?? 0, TOWER_HERO_AGGRO_MAX_STACKS);
  return Math.round(tower.attackDamage * (1 + stacks * TOWER_HERO_AGGRO_DAMAGE_STEP));
};

const towerTargetPriority = (unit: Unit) => {
  if (unit.kind === "super") return 0;
  if (unit.kind === "siege") return 1;
  if (unit.kind === "melee") return 2;
  if (unit.kind === "caster") return 3;
  return 4;
};

const towerIdForTeam = (team: Team) => (team === "azure" ? "azure_outer_tower" : "crimson_outer_tower");
