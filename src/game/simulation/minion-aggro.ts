import { distance } from "./rules";
import type { Unit } from "./types";

const MINION_AGGRO_MEMORY_SECONDS = 2.4;
const MINION_CALL_FOR_HELP_RADIUS = 330;
const MINION_AGGRO_SOFT_LEASH_RADIUS = 460;
const MINION_AGGRO_LEASH_RADIUS = 620;
const MINION_AGGRO_DISTANCE_DECAY_MULTIPLIER = 2.5;
const MINION_AGGRO_BASE_THREAT = 100;
const MINION_AGGRO_TARGET_PROXIMITY_THREAT = 0.18;
const MINION_AGGRO_SOURCE_PROXIMITY_THREAT = 0.12;
const MINION_AGGRO_THREAT_SWITCH_MARGIN = 20;
const MINION_AGGRO_THREAT_DECAY_PER_SECOND = 70;

interface CallMinionAggroInput {
  target: Unit;
  sourceId?: string;
  units: Unit[];
  damage?: number;
}

export const tickMinionAggro = (units: Unit[], dt: number) => {
  for (const unit of units) {
    if (unit.kind === "hero" || !unit.aggroTargetId) continue;
    const target = units.find((candidate) => candidate.id === unit.aggroTargetId);
    if (!target?.alive) {
      clearMinionAggro(unit);
      continue;
    }
    const targetDistance = distance(unit, target);
    if (targetDistance > MINION_AGGRO_LEASH_RADIUS) {
      clearMinionAggro(unit);
      continue;
    }
    const decay = targetDistance > MINION_AGGRO_SOFT_LEASH_RADIUS ? dt * MINION_AGGRO_DISTANCE_DECAY_MULTIPLIER : dt;
    unit.aggroTimer = Math.max(0, unit.aggroTimer - decay);
    unit.aggroThreat = Math.max(0, (unit.aggroThreat ?? 0) - decay * MINION_AGGRO_THREAT_DECAY_PER_SECOND);
    if (unit.aggroTimer <= 0) {
      clearMinionAggro(unit);
    }
  }
};

export const callMinionAggroOnHeroDamage = ({ target, sourceId, units, damage = 0 }: CallMinionAggroInput) => {
  if (target.kind !== "hero" || !sourceId) return 0;
  const source = units.find((unit) => unit.id === sourceId);
  if (!source || source.kind !== "hero" || source.team === target.team || !source.alive) return 0;
  let called = 0;
  for (const minion of units) {
    if (!minion.alive || minion.kind === "hero" || minion.team !== target.team) continue;
    const nearTarget = distance(minion, target) <= MINION_CALL_FOR_HELP_RADIUS + minion.radius;
    const nearSource = distance(minion, source) <= MINION_CALL_FOR_HELP_RADIUS + minion.radius;
    if (!nearTarget && !nearSource) continue;
    const threat = minionAggroThreat({ minion, target, source, damage });
    if (!shouldAcceptAggroThreat(minion, source.id, threat)) continue;
    minion.aggroTargetId = source.id;
    minion.aggroTimer = MINION_AGGRO_MEMORY_SECONDS;
    minion.aggroThreat = Math.max(minion.aggroThreat ?? 0, threat);
    called += 1;
  }
  return called;
};

export const minionAggroTarget = (minion: Unit, units: Unit[]) => {
  if (minion.kind === "hero" || !minion.aggroTargetId || minion.aggroTimer <= 0) return undefined;
  const target = units.find((unit) => unit.id === minion.aggroTargetId && unit.alive);
  if (!target || distance(minion, target) > MINION_AGGRO_LEASH_RADIUS) {
    clearMinionAggro(minion);
    return undefined;
  }
  return target;
};

export const activeMinionAggroCount = (units: Unit[], team?: Unit["team"]) =>
  units.filter((unit) => unit.alive && unit.kind !== "hero" && unit.aggroTimer > 0 && unit.aggroTargetId && (!team || unit.team === team)).length;

const clearMinionAggro = (unit: Unit) => {
  unit.aggroTargetId = undefined;
  unit.aggroTimer = 0;
  unit.aggroThreat = 0;
};

const minionAggroThreat = ({ minion, target, source, damage }: { minion: Unit; target: Unit; source: Unit; damage: number }) => {
  const targetProximity = Math.max(0, MINION_CALL_FOR_HELP_RADIUS + minion.radius - distance(minion, target)) * MINION_AGGRO_TARGET_PROXIMITY_THREAT;
  const sourceProximity = Math.max(0, MINION_CALL_FOR_HELP_RADIUS + minion.radius - distance(minion, source)) * MINION_AGGRO_SOURCE_PROXIMITY_THREAT;
  return MINION_AGGRO_BASE_THREAT + damage + targetProximity + sourceProximity;
};

const shouldAcceptAggroThreat = (minion: Unit, sourceId: string, threat: number) => {
  if (!minion.aggroTargetId || minion.aggroTimer <= 0) return true;
  if (minion.aggroTargetId === sourceId) return true;
  return threat >= (minion.aggroThreat ?? 0) + MINION_AGGRO_THREAT_SWITCH_MARGIN;
};
