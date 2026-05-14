import type { Team } from "../assets";
import { isBuildingVulnerable } from "./objectives";
import { distance, normalize } from "./rules";
import type { Building, DamageHitEffects, PendingDamageEvent, Point, Unit } from "./types";

interface DamageEventDrain {
  due: PendingDamageEvent[];
  pending: PendingDamageEvent[];
}

interface UnitDamageResolution {
  applied: boolean;
  died: boolean;
}

interface BuildingDamageResolution {
  applied: boolean;
  destroyed: boolean;
}

export interface BuildingDamageApplication extends BuildingDamageResolution {
  damageNumberTeam?: Team;
  message?: string;
  outcome?: "victory" | "defeat";
}

export type PendingDamageEventDispatch =
  | {
      vfx?: PendingDamageEvent["vfx"];
      effects: DamageHitEffects;
      action: { kind: "none" };
    }
  | {
      vfx?: PendingDamageEvent["vfx"];
      effects: DamageHitEffects;
      action: { kind: "unit"; target: Unit; damage: number; sourceTeam: Team; sourceId?: string };
    }
  | {
      vfx?: PendingDamageEvent["vfx"];
      effects: DamageHitEffects;
      action: { kind: "building"; building: Building; amount: number };
    }
  | {
      vfx?: PendingDamageEvent["vfx"];
      effects: DamageHitEffects;
      action: { kind: "circle"; center: Point; damage: number; radius: number; sourceTeam: Team; sourceId?: string; buildingDamageMultiplier: number };
    }
  | {
      vfx?: PendingDamageEvent["vfx"];
      effects: DamageHitEffects;
      action: { kind: "cone"; origin: Point; direction: Point; range: number; halfAngleDeg: number; damage: number; sourceTeam: Team; sourceId?: string; buildingDamageMultiplier: number };
    };

export type AreaDamageShape =
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "cone"; origin: Point; direction: Point; range: number; halfAngleDeg: number };

export interface AreaDamageApplication {
  units: Unit[];
  buildings: Building[];
  unitDamage: number;
  buildingDamage: number;
  sourceTeam: Team;
  sourceId?: string;
  effects: DamageHitEffects;
  knockback?: {
    origin: Point;
    distance: number;
  };
}

export interface AbilityDamagePlan {
  damage: number;
  consumedMark: boolean;
}

export interface AbilityPostDamageApplication {
  clearMark: boolean;
  cooldownRefund?: DamageHitEffects["cooldownRefund"];
  vfx?: {
    key: string;
    scale: number;
    yOffset: number;
  };
  message?: string;
  mark?: number;
  slow?: DamageHitEffects["slow"];
  root?: number;
  knockback?: number;
}

interface UnitAttackDamageEventInput {
  id: string;
  triggerAt: number;
  attacker: Unit;
  target: Unit;
}

interface BuildingAttackDamageEventInput {
  id: string;
  triggerAt: number;
  attacker: Unit;
  building: Building;
  structureDamageMultiplier?: number;
}

export const createUnitAttackDamageEvent = ({ id, triggerAt, attacker, target }: UnitAttackDamageEventInput): PendingDamageEvent => ({
  id,
  triggerAt,
  sourceTeam: attacker.team,
  sourceId: attacker.id,
  kind: "unit",
  targetId: target.id,
  damage: attacker.attackDamage,
  buildingDamageMultiplier: 0,
  cancelIfSourceDead: true,
  vfx:
    attacker.team === "crimson"
      ? { key: "vfx-crimson-basic_attack_arc", x: target.x, y: target.y - 8, scale: 0.8 }
      : { key: "vfx-astra-q_slash_arc", x: target.x, y: target.y - 8, scale: 0.72 },
});

export const createBuildingAttackDamageEvent = ({ id, triggerAt, attacker, building, structureDamageMultiplier = 1 }: BuildingAttackDamageEventInput): PendingDamageEvent => ({
  id,
  triggerAt,
  sourceTeam: attacker.team,
  sourceId: attacker.id,
  kind: "building",
  buildingId: building.id,
  damage: attacker.attackDamage * attacker.buildingDamageMultiplier * structureDamageMultiplier,
  buildingDamageMultiplier: 1,
  cancelIfSourceDead: true,
  vfx: {
    key: attacker.team === "azure" ? "vfx-astra-q_slash_arc" : "vfx-crimson-basic_attack_arc",
    x: building.x,
    y: building.y - 40,
    scale: 0.9,
  },
});

export const drainDueDamageEvents = (events: PendingDamageEvent[], elapsed: number): DamageEventDrain => ({
  due: events.filter((event) => event.triggerAt <= elapsed),
  pending: events.filter((event) => event.triggerAt > elapsed),
});

export const isDamageSourceValid = (event: PendingDamageEvent, units: Unit[], buildings: Building[]) => {
  if (!event.cancelIfSourceDead || !event.sourceId) return true;
  const sourceUnit = units.find((unit) => unit.id === event.sourceId);
  if (sourceUnit) return sourceUnit.alive;
  const sourceBuilding = buildings.find((building) => building.id === event.sourceId);
  if (sourceBuilding) return sourceBuilding.hp > 0;
  return true;
};

export const hitEffectsFromDamageEvent = (event: PendingDamageEvent): DamageHitEffects => ({
  slow: event.slow,
  root: event.root,
  mark: event.mark,
  knockback: event.knockback,
  consumeMarkBonus: event.consumeMarkBonus,
  cooldownRefund: event.cooldownRefund,
});

export const resolvePendingDamageEventDispatch = (event: PendingDamageEvent, units: Unit[], buildings: Building[]): PendingDamageEventDispatch | null => {
  if (!isDamageSourceValid(event, units, buildings)) return null;
  const effects = hitEffectsFromDamageEvent(event);
  const base = { vfx: event.vfx, effects };

  if (event.kind === "unit" && event.targetId) {
    const target = units.find((unit) => unit.id === event.targetId);
    return target?.alive
      ? { ...base, action: { kind: "unit", target, damage: event.damage, sourceTeam: event.sourceTeam, sourceId: event.sourceId } }
      : { ...base, action: { kind: "none" } };
  }

  if (event.kind === "building" && event.buildingId) {
    const building = buildings.find((candidate) => candidate.id === event.buildingId);
    return building
      ? { ...base, action: { kind: "building", building, amount: event.damage * event.buildingDamageMultiplier } }
      : { ...base, action: { kind: "none" } };
  }

  if (event.kind === "circle" && event.center && event.radius) {
    return { ...base, action: { kind: "circle", center: event.center, damage: event.damage, radius: event.radius, sourceTeam: event.sourceTeam, sourceId: event.sourceId, buildingDamageMultiplier: event.buildingDamageMultiplier } };
  }

  if (event.kind === "cone" && event.origin && event.direction && event.range && event.halfAngleDeg) {
    return { ...base, action: { kind: "cone", origin: event.origin, direction: event.direction, range: event.range, halfAngleDeg: event.halfAngleDeg, damage: event.damage, sourceTeam: event.sourceTeam, sourceId: event.sourceId, buildingDamageMultiplier: event.buildingDamageMultiplier } };
  }

  return { ...base, action: { kind: "none" } };
};

export const findEnemyUnitsInCircle = (units: Unit[], center: Point, radius: number, sourceTeam: Team) =>
  units.filter((unit) => unit.alive && unit.team !== sourceTeam && distance(unit, center) <= radius + unit.radius);

export const findNearestEnemyUnit = (units: Unit[], source: Unit, range: number) =>
  units
    .filter((unit) => unit.alive && unit.team !== source.team)
    .map((unit) => ({ unit, gap: distance(source, unit) - unit.radius - source.radius }))
    .filter(({ gap }) => gap <= range)
    .sort((a, b) => a.gap - b.gap)[0]?.unit;

export const findEnemyBuildingsInCircle = (buildings: Building[], center: Point, radius: number, sourceTeam: Team) =>
  buildings.filter((building) => building.team !== sourceTeam && building.hp > 0 && isBuildingVulnerable(building, buildings) && distance(building, center) <= radius + building.radius);

export const findEnemyUnitsInCone = (units: Unit[], origin: Point, direction: Point, range: number, halfAngleDeg: number, sourceTeam: Team) => {
  const cone = coneGeometry(direction, range, halfAngleDeg, 42);
  return units.filter((unit) => {
    if (!unit.alive || unit.team === sourceTeam) return false;
    return isPointInCone(unit, origin, cone.dir, range, unit.radius, cone.maxWidthAtEdge, cone.minWidth);
  });
};

export const findEnemyBuildingsInCone = (buildings: Building[], origin: Point, direction: Point, range: number, halfAngleDeg: number, sourceTeam: Team) => {
  const cone = coneGeometry(direction, range, halfAngleDeg, 56);
  return buildings.filter((building) => {
    if (building.team === sourceTeam || building.hp <= 0 || !isBuildingVulnerable(building, buildings)) return false;
    return isPointInCone(building, origin, cone.dir, range, building.radius, cone.maxWidthAtEdge, cone.minWidth);
  });
};

export const resolveAreaDamageApplication = (input: {
  shape: AreaDamageShape;
  units: Unit[];
  buildings: Building[];
  damage: number;
  sourceTeam: Team;
  sourceId?: string;
  effects?: DamageHitEffects;
  buildingDamageMultiplier?: number;
}): AreaDamageApplication => {
  const effects = input.effects ?? {};
  const { knockback, ...damageEffects } = effects;
  const units =
    input.shape.kind === "circle"
      ? findEnemyUnitsInCircle(input.units, input.shape.center, input.shape.radius, input.sourceTeam)
      : findEnemyUnitsInCone(input.units, input.shape.origin, input.shape.direction, input.shape.range, input.shape.halfAngleDeg, input.sourceTeam);
  const buildings =
    input.shape.kind === "circle"
      ? findEnemyBuildingsInCircle(input.buildings, input.shape.center, input.shape.radius, input.sourceTeam)
      : findEnemyBuildingsInCone(input.buildings, input.shape.origin, input.shape.direction, input.shape.range, input.shape.halfAngleDeg, input.sourceTeam);
  return {
    units,
    buildings,
    unitDamage: input.damage,
    buildingDamage: input.damage * (input.buildingDamageMultiplier ?? 0.45),
    sourceTeam: input.sourceTeam,
    sourceId: input.sourceId,
    effects: damageEffects,
    knockback: knockback ? { origin: input.shape.kind === "circle" ? input.shape.center : input.shape.origin, distance: knockback } : undefined,
  };
};

export const resolveAbilityDamagePlan = (target: Unit, baseDamage: number, effects: DamageHitEffects = {}): AbilityDamagePlan => {
  const consumedMark = target.markTimer > 0 && (effects.consumeMarkBonus ?? 0) > 0;
  return {
    damage: baseDamage + (consumedMark ? effects.consumeMarkBonus ?? 0 : 0),
    consumedMark,
  };
};

export const resolveAbilityPostDamageApplication = (input: {
  targetAlive: boolean;
  consumedMark: boolean;
  sourceId?: string;
  effects?: DamageHitEffects;
}): AbilityPostDamageApplication | null => {
  if (!input.targetAlive) return null;
  const effects = input.effects ?? {};
  return {
    clearMark: input.consumedMark,
    cooldownRefund: input.consumedMark && input.sourceId === "player" ? effects.cooldownRefund : undefined,
    vfx: input.consumedMark && input.sourceId === "player" ? { key: "vfx-astra-w_shield_pulse", scale: 0.68, yOffset: -6 } : undefined,
    message: input.consumedMark && input.sourceId === "player" ? "Mark consumed" : undefined,
    mark: effects.mark,
    slow: effects.slow,
    root: effects.root,
    knockback: effects.knockback && effects.knockback > 0 ? effects.knockback : undefined,
  };
};

export const applyUnitDamageResolution = (target: Unit, amount: number): UnitDamageResolution => {
  if (!target.alive) return { applied: false, died: false };
  const shieldDamage = Math.min(target.shield, amount);
  target.shield -= shieldDamage;
  target.hp -= amount - shieldDamage;
  target.action = target.hp <= 0 ? "death" : "hit";
  target.actionTimer = target.hp <= 0 ? 1.2 : 0.24;
  if (target.hp > 0) return { applied: true, died: false };
  target.hp = 0;
  target.alive = false;
  return { applied: true, died: true };
};

export const applyBuildingDamageResolution = (building: Building, buildings: Building[], amount: number): BuildingDamageResolution => {
  if (building.hp <= 0 || !isBuildingVulnerable(building, buildings)) return { applied: false, destroyed: false };
  building.hp = Math.max(0, building.hp - amount);
  return { applied: true, destroyed: building.hp <= 0 };
};

export const applyBuildingDamageApplication = (building: Building, buildings: Building[], amount: number): BuildingDamageApplication => {
  const result = applyBuildingDamageResolution(building, buildings, amount);
  if (!result.applied) return result;
  return {
    ...result,
    damageNumberTeam: building.team === "azure" ? "crimson" : "azure",
    message: result.destroyed ? `${building.id} destroyed` : undefined,
    outcome: result.destroyed && building.id === "crimson_core" ? "victory" : result.destroyed && building.id === "azure_core" ? "defeat" : undefined,
  };
};

const coneGeometry = (direction: Point, range: number, halfAngleDeg: number, minWidth: number) => ({
  dir: normalize(direction.x, direction.y),
  maxWidthAtEdge: Math.tan((halfAngleDeg * Math.PI) / 180) * range,
  minWidth,
});

const isPointInCone = (point: Point, origin: Point, direction: Point, range: number, radius: number, maxWidthAtEdge: number, minWidth: number) => {
  const rel = { x: point.x - origin.x, y: point.y - origin.y };
  const forward = rel.x * direction.x + rel.y * direction.y;
  if (forward < -radius || forward > range + radius) return false;
  const perpendicular = Math.abs(rel.x * direction.y - rel.y * direction.x);
  const allowedWidth = Math.max(minWidth, (forward / range) * maxWidthAtEdge) + radius;
  return perpendicular <= allowedWidth;
};
