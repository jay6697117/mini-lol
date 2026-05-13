import type { EnemyAiState } from "../types";
import { CRIMSON_BASE, LANE_END, LANE_START } from "../data/game-config";
import { distance } from "./rules";
import type { Point, Unit } from "./types";

export type EnemyHeroDecision =
  | { kind: "recalling"; state: Extract<EnemyAiState, "Recall"> }
  | { kind: "startRecall"; state: Extract<EnemyAiState, "Recall"> }
  | { kind: "move"; state: EnemyAiState; target: Point; speedMultiplier: number }
  | { kind: "attackUnit"; state: EnemyAiState; target: Unit }
  | { kind: "harass"; state: Extract<EnemyAiState, "Harass"> };

interface EnemyHeroDecisionInput {
  enemy: Unit;
  player: Unit;
  enemySkillCooldown: number;
  canSafelyRecall: boolean;
  lastHitTarget?: Unit;
}

export const findLastHitCandidate = (source: Unit, units: Unit[]) =>
  units
    .filter((unit) => unit.alive && unit.team !== source.team && unit.kind !== "hero")
    .map((unit) => ({ unit, gap: distance(source, unit) - source.radius - unit.radius }))
    .filter(({ unit, gap }) => gap <= source.attackRange + 110 && unit.hp <= source.attackDamage + 20)
    .sort((a, b) => a.unit.hp - b.unit.hp || a.gap - b.gap)[0]?.unit;

export const decideEnemyHeroAction = ({
  enemy,
  player,
  enemySkillCooldown,
  canSafelyRecall,
  lastHitTarget,
}: EnemyHeroDecisionInput): EnemyHeroDecision => {
  const gap = distance(enemy, player);

  if (enemy.recallTimer > 0) {
    return { kind: "recalling", state: "Recall" };
  }

  if (enemy.hp / enemy.maxHp < 0.25 && gap > 460 && canSafelyRecall) {
    return { kind: "startRecall", state: "Recall" };
  }

  if (enemy.hp / enemy.maxHp < 0.35) {
    return {
      kind: "move",
      state: "Retreat",
      target: distance(enemy, CRIMSON_BASE) < 160 ? CRIMSON_BASE : { x: 1210, y: 315 },
      speedMultiplier: 0.85,
    };
  }

  if (player.alive && player.hp / player.maxHp < 0.25 && enemy.hp / enemy.maxHp > 0.48) {
    if (gap < enemy.attackRange + player.radius) {
      return { kind: "attackUnit", state: "All In", target: player };
    }
    return { kind: "move", state: "All In", target: player, speedMultiplier: 0.9 };
  }

  if (player.alive && gap < 310 && enemySkillCooldown <= 0 && enemy.hp / enemy.maxHp > 0.42) {
    return { kind: "harass", state: "Harass" };
  }

  if (lastHitTarget) {
    const targetGap = distance(enemy, lastHitTarget) - enemy.radius - lastHitTarget.radius;
    if (targetGap <= enemy.attackRange + 18) {
      return { kind: "attackUnit", state: "Laning", target: lastHitTarget };
    }
    return { kind: "move", state: "Laning", target: lastHitTarget, speedMultiplier: 0.65 };
  }

  if (gap < enemy.attackRange + player.radius && player.alive) {
    return { kind: "attackUnit", state: "Laning", target: player };
  }

  return {
    kind: "move",
    state: "Laning",
    target: gap < 360 ? player : enemy.team === "azure" ? LANE_END : LANE_START,
    speedMultiplier: 0.72,
  };
};
