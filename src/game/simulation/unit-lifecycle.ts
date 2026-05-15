import {
  BASE_HEALTH_REGEN_PER_SECOND,
  BASE_MANA_REGEN_PER_SECOND,
  FOUNTAIN_LAYOUT,
  FOUNTAIN_REGEN_RADIUS,
} from "../data/game-config";
import type { UnitAction } from "../assets";
import { clearUnitCommands } from "./commands";
import { distance } from "./rules";
import type { Point, Unit } from "./types";

export interface UnitStatusTickResult {
  actionReady: boolean;
}

export interface RecallChannelTickResult {
  active: boolean;
  completed: boolean;
}

export const clearUnitCrowdControlEffects = (unit: Unit) => {
  unit.slowTimer = 0;
  unit.slowMultiplier = 1;
  unit.rootTimer = 0;
  unit.markTimer = 0;
  unit.hasteTimer = 0;
  unit.hasteMultiplier = 1;
};

export const clearUnitDefensiveEffects = (unit: Unit) => {
  unit.shield = 0;
  unit.shieldTimer = 0;
};

export const prepareHeroDeathState = (unit: Unit) => {
  clearUnitCommands(unit);
  unit.attackTimer = 0;
  clearUnitDefensiveEffects(unit);
  clearUnitCrowdControlEffects(unit);
};

export const respawnHeroAt = (unit: Unit, start: Point) => {
  unit.x = start.x;
  unit.y = start.y;
  unit.hp = unit.maxHp;
  unit.mana = unit.maxMana;
  clearUnitDefensiveEffects(unit);
  clearUnitCrowdControlEffects(unit);
  unit.alive = true;
  unit.action = "idle";
  unit.actionTimer = 0;
  unit.attackTimer = 0;
  clearUnitCommands(unit);
  unit.respawnTimer = 0;
};

export const tickUnitStatusEffects = (unit: Unit, dt: number): UnitStatusTickResult => {
  unit.attackTimer = Math.max(0, unit.attackTimer - dt);
  unit.actionTimer = Math.max(0, unit.actionTimer - dt);
  unit.slowTimer = Math.max(0, unit.slowTimer - dt);
  unit.rootTimer = Math.max(0, unit.rootTimer - dt);
  unit.markTimer = Math.max(0, unit.markTimer - dt);
  unit.hasteTimer = Math.max(0, unit.hasteTimer - dt);
  unit.shieldTimer = Math.max(0, unit.shieldTimer - dt);
  if (unit.slowTimer <= 0) unit.slowMultiplier = 1;
  if (unit.hasteTimer <= 0) unit.hasteMultiplier = 1;
  if (unit.shieldTimer <= 0) unit.shield = 0;
  return {
    actionReady: unit.actionTimer <= 0,
  };
};

export const applyBaseRecovery = (unit: Unit, dt: number) => {
  if (!unit.alive || unit.kind !== "hero") return false;
  const fountain = FOUNTAIN_LAYOUT[unit.team];
  if (distance(unit, fountain) > FOUNTAIN_REGEN_RADIUS) return false;
  const previousHp = unit.hp;
  const previousMana = unit.mana;
  unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * BASE_HEALTH_REGEN_PER_SECOND * dt);
  unit.mana = Math.min(unit.maxMana, unit.mana + unit.maxMana * BASE_MANA_REGEN_PER_SECOND * dt);
  return unit.hp !== previousHp || unit.mana !== previousMana;
};

export const beginRecallChannel = (unit: Unit) => {
  if (!unit.alive || unit.kind !== "hero" || unit.recallTimer > 0) return false;
  clearUnitCommands(unit);
  unit.recallTimer = unit.recallDuration;
  unit.action = "cast";
  unit.actionTimer = 0.4;
  return true;
};

export const tickRecallChannel = (unit: Unit, dt: number, start: Point): RecallChannelTickResult => {
  if (!unit.alive || unit.recallTimer <= 0) {
    return { active: false, completed: false };
  }

  unit.recallTimer = Math.max(0, unit.recallTimer - dt);
  unit.action = "cast";
  unit.actionTimer = Math.max(unit.actionTimer, 0.08);
  if (unit.recallTimer > 0) {
    return { active: true, completed: false };
  }

  unit.x = start.x;
  unit.y = start.y;
  unit.hp = unit.maxHp;
  unit.mana = unit.maxMana;
  unit.shield = 0;
  unit.shieldTimer = 0;
  unit.slowTimer = 0;
  unit.slowMultiplier = 1;
  unit.rootTimer = 0;
  unit.markTimer = 0;
  clearUnitCommands(unit);
  return { active: true, completed: true };
};

export const visibleUnitAction = (unit: Unit): UnitAction => {
  if (!unit.alive) return "death";
  if (unit.actionTimer > 0) return unit.action;
  return unit.action === "move" ? "move" : "idle";
};
