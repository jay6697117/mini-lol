import type { Team } from "../assets";
import { TOWER_ATTACK_WINDUP, TOWER_HERO_AGGRO_SECONDS } from "../data/game-config";
import { distance } from "./rules";
import type { Building, PendingDamageEvent, TowerAggroState, Unit } from "./types";

const TOWER_ATTACK_FLASH_SECONDS = 0.32;
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
  towerHeroAggro[target.team] = { targetId: source.id, ttl: TOWER_HERO_AGGRO_SECONDS };
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
    intents.push({
      towerId: building.id,
      sourceTeam: building.team,
      targetId: target.id,
      damage: building.attackDamage,
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

const selectTowerTarget = (tower: Building, units: Unit[], aggro?: TowerAggroState[keyof TowerAggroState]): TowerTargetResult => {
  if (aggro) {
    const heroTarget = units.find((unit) => unit.id === aggro.targetId && unit.alive && distance(unit, tower) <= tower.attackRange);
    if (heroTarget) return { target: heroTarget, clearAggro: false };
    return { target: undefined, clearAggro: true };
  }

  const enemies = units.filter((unit) => unit.alive && unit.team !== tower.team && distance(unit, tower) <= tower.attackRange);
  const minion = enemies.find((unit) => unit.kind !== "hero");
  return { target: minion ?? enemies[0], clearAggro: false };
};

const towerIdForTeam = (team: Team) => (team === "azure" ? "azure_outer_tower" : "crimson_outer_tower");
