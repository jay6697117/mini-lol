import type { Building, Point, Unit } from "./types";
import { minionAggroTarget } from "./minion-aggro";
import { findNearestAttackableBuilding } from "./objectives";
import { distance } from "./rules";

export type MinionDecision =
  | { kind: "attackUnit"; target: Unit }
  | { kind: "chaseUnit"; target: Unit }
  | { kind: "attackBuilding"; building: Building }
  | { kind: "moveToLane"; target: Point };

const MINION_ENGAGE_RANGE = 260;
const MINION_SEPARATION_RADIUS = 46;
const MINION_SEPARATION_STRENGTH = 38;

interface DecideMinionActionInput {
  minion: Unit;
  units: Unit[];
  buildings: Building[];
  laneGoal: Point;
}

export const decideMinionAction = ({ minion, units, buildings, laneGoal }: DecideMinionActionInput): MinionDecision => {
  const aggroTarget = minionAggroTarget(minion, units);
  if (aggroTarget) {
    return unitInAttackRange(minion, aggroTarget) ? { kind: "attackUnit", target: aggroTarget } : { kind: "chaseUnit", target: aggroTarget };
  }

  const minionTarget = nearestEnemyMinionInEngageRange(minion, units);
  if (minionTarget) return unitInAttackRange(minion, minionTarget) ? { kind: "attackUnit", target: minionTarget } : { kind: "chaseUnit", target: minionTarget };

  const heroTarget = nearestEnemyHeroInEngageRange(minion, units);
  if (heroTarget) return unitInAttackRange(minion, heroTarget) ? { kind: "attackUnit", target: heroTarget } : { kind: "chaseUnit", target: heroTarget };

  const building = findNearestAttackableBuilding(minion, buildings, minion.attackRange + 38);
  if (building) return { kind: "attackBuilding", building };

  return { kind: "moveToLane", target: laneSeparationTarget(minion, units, laneGoal) };
};

const nearestEnemyMinionInEngageRange = (minion: Unit, units: Unit[]) =>
  enemyUnitsInEngageRange(minion, units)
    .filter((unit) => unit.kind !== "hero")
    .sort((a, b) => minionTargetPriority(a) - minionTargetPriority(b) || distance(minion, a) - distance(minion, b))[0];

const nearestEnemyHeroInEngageRange = (minion: Unit, units: Unit[]) => enemyUnitsInEngageRange(minion, units).filter((unit) => unit.kind === "hero").sort((a, b) => distance(minion, a) - distance(minion, b))[0];

const enemyUnitsInEngageRange = (minion: Unit, units: Unit[]) =>
  units.filter((unit) => unit.alive && unit.team !== minion.team && distance(minion, unit) - minion.radius - unit.radius <= MINION_ENGAGE_RANGE);

const unitInAttackRange = (minion: Unit, target: Unit) => distance(minion, target) - minion.radius - target.radius <= minion.attackRange + 24;

const laneSeparationTarget = (minion: Unit, units: Unit[], target: Point) => {
  const separation = minionSeparationVector(minion, units);
  return {
    x: target.x + separation.x,
    y: target.y + separation.y,
  };
};

const minionSeparationVector = (minion: Unit, units: Unit[]) => {
  let pushX = 0;
  let pushY = 0;
  for (const unit of units) {
    if (!unit.alive || unit.id === minion.id || unit.team !== minion.team || unit.kind === "hero") continue;
    const gap = distance(minion, unit);
    if (gap >= MINION_SEPARATION_RADIUS) continue;
    const direction = gap > 0.001 ? { x: (minion.x - unit.x) / gap, y: (minion.y - unit.y) / gap } : stableSeparationDirection(minion.id, unit.id);
    const pressure = (MINION_SEPARATION_RADIUS - gap) / MINION_SEPARATION_RADIUS;
    pushX += direction.x * pressure * MINION_SEPARATION_STRENGTH;
    pushY += direction.y * pressure * MINION_SEPARATION_STRENGTH;
  }
  return { x: pushX, y: pushY };
};

const stableSeparationDirection = (sourceId: string, otherId: string) => {
  const angle = ((stableHash(`${sourceId}:${otherId}`) % 360) * Math.PI) / 180;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

const stableHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const minionTargetPriority = (unit: Unit) => {
  if (unit.kind === "siege") return 0;
  if (unit.kind === "melee") return 1;
  if (unit.kind === "caster") return 2;
  return 3;
};
