import type { Team } from "../assets";
import { TOWER_ATTACK_WINDUP, TOWER_HERO_AGGRO_SECONDS, TOWER_HERO_PROTECTION_RANGE } from "../data/game-config";
import { hasAlliedMinionNearBuilding } from "./objectives";
import { distance } from "./rules";
import type { Building, PendingDamageEvent, TowerAggroEntry, TowerAggroState, Unit } from "./types";

const TOWER_ATTACK_FLASH_SECONDS = 0.32;
const TOWER_HERO_AGGRO_DAMAGE_STEP = 0.4;
const TOWER_HERO_AGGRO_MAX_STACKS = 3;
const TEAMS: Team[] = ["azure", "crimson"];

interface TowerTargetResult {
  target?: Unit;
  clearAggro: boolean;
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
  if (!alliedTower || alliedTower.hp <= 0) return false;
  if (!isUnitInTowerAttackRange(source, alliedTower)) return false;
  if (towerRangeGap(target, alliedTower) > TOWER_HERO_PROTECTION_RANGE) return false;
  const currentTarget = currentTowerTarget(alliedTower, units);
  if (currentTarget?.kind === "hero") return false;
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
    building.targetUnitId = target.id;
    const damage = towerDamageForTarget(building, target);
    commitTowerHeat(building, target);
    const aggro = towerHeroAggro[building.team];
    if (target.kind === "hero" && aggro?.targetId === target.id) {
      aggro.shots = building.championShotStacks;
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
    .filter((building) => building.type === "tower" && building.hp > 0 && building.team !== unit.team && isUnitInTowerAttackRange(unit, building))
    .sort((a, b) => towerRangeGap(unit, a) - towerRangeGap(unit, b))[0];
  if (!tower) return INACTIVE_TOWER_DANGER;

  const aggro = towerHeroAggro[tower.team]?.targetId === unit.id ? towerHeroAggro[tower.team] : undefined;
  const shots = tower.championTargetId === unit.id ? tower.championShotStacks : aggro?.shots ?? 0;
  return {
    active: true,
    towerId: tower.id,
    unsupported: !hasAlliedMinionNearBuilding(unit.team, tower, units),
    distance: Math.round(Math.max(0, towerRangeGap(unit, tower))),
    shots,
    nextDamage: unit.kind === "hero" ? towerDamageForHeroStacks(tower, shots) : towerDamageForTarget(tower, unit),
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

export const towerRangeGap = (unit: Unit, tower: Building) => distance(unit, tower) - unit.radius - tower.radius;

export const isUnitInTowerAttackRange = (unit: Unit, tower: Building) => towerRangeGap(unit, tower) <= tower.attackRange;

export const towerAttackDisplayRadius = (tower: Building) => tower.attackRange + tower.radius;

const selectTowerTarget = (tower: Building, units: Unit[], aggro?: TowerAggroEntry): TowerTargetResult => {
  const current = currentTowerTarget(tower, units);
  if (current?.kind === "hero") return { target: current, clearAggro: false };

  let clearAggro = false;
  if (aggro) {
    const heroTarget = units.find((unit) => unit.id === aggro.targetId && unit.alive && isUnitInTowerAttackRange(unit, tower));
    if (heroTarget) return { target: heroTarget, clearAggro: false };
    clearAggro = true;
  }

  if (current) return { target: current, clearAggro };

  const enemies = units.filter((unit) => unit.alive && unit.team !== tower.team && isUnitInTowerAttackRange(unit, tower));
  return {
    target: enemies.sort((a, b) => towerTargetPriority(a) - towerTargetPriority(b) || towerRangeGap(a, tower) - towerRangeGap(b, tower))[0],
    clearAggro,
  };
};

const currentTowerTarget = (tower: Building, units: Unit[]) => {
  const target = units.find((unit) => unit.id === tower.targetUnitId && unit.alive && unit.team !== tower.team && isUnitInTowerAttackRange(unit, tower));
  if (target) return target;
  tower.targetUnitId = undefined;
  tower.championTargetId = undefined;
  tower.championShotStacks = 0;
  return undefined;
};

export const towerDamageForTarget = (tower: Building, target: Unit) => {
  if (target.kind !== "hero") return tower.attackDamage;
  const stacks = tower.championTargetId === target.id ? Math.min(tower.championShotStacks, TOWER_HERO_AGGRO_MAX_STACKS) : 0;
  return towerDamageForHeroStacks(tower, stacks);
};

const towerDamageForHeroStacks = (tower: Building, stacks: number) =>
  Math.round(tower.attackDamage * (1 + Math.min(stacks, TOWER_HERO_AGGRO_MAX_STACKS) * TOWER_HERO_AGGRO_DAMAGE_STEP));

const commitTowerHeat = (tower: Building, target: Unit) => {
  if (target.kind !== "hero") {
    tower.championTargetId = undefined;
    tower.championShotStacks = 0;
    return;
  }
  if (tower.championTargetId !== target.id) {
    tower.championTargetId = target.id;
    tower.championShotStacks = 1;
    return;
  }
  tower.championShotStacks = Math.min(TOWER_HERO_AGGRO_MAX_STACKS, tower.championShotStacks + 1);
};

const towerTargetPriority = (unit: Unit) => {
  if (unit.kind === "super") return 0;
  if (unit.kind === "siege") return 1;
  if (unit.kind === "melee") return 2;
  if (unit.kind === "caster") return 3;
  return 4;
};

const towerIdForTeam = (team: Team) => (team === "azure" ? "azure_outer_tower" : "crimson_outer_tower");
