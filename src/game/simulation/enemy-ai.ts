import type { EnemyAiState, LanePressure, LaneTacticalPointId } from "../types";
import { BRUSH_REVEAL_RADIUS, CRIMSON_BASE, type ItemId } from "../data/game-config";
import { findNearestEnemyUnit } from "./combat";
import { lanePathProgress, laneTacticalPointTarget, nextLaneTacticalPointForTeam } from "./lane-path";
import { createLaneSnapshot } from "./lane-state";
import { isPointInBrush } from "./map-zones";
import { findNearestAttackableBuilding, structureDamageMultiplier } from "./objectives";
import { distance } from "./rules";
import type { Building, Point, Unit } from "./types";

export type EnemyHeroDecision =
  | { kind: "recalling"; state: Extract<EnemyAiState, "Recall">; reason?: string }
  | { kind: "startRecall"; state: Extract<EnemyAiState, "Recall">; reason?: string }
  | { kind: "move"; state: EnemyAiState; target: Point; speedMultiplier: number; reason?: string }
  | { kind: "attackUnit"; state: EnemyAiState; target: Unit; reason?: string }
  | { kind: "useItem"; state: EnemyAiState; itemId: ItemId; targetBuilding?: Building; reason?: string }
  | { kind: "harass"; state: Extract<EnemyAiState, "Harass">; reason?: string };

export interface EnemyHeroDecisionTrace {
  intent: string;
  targetId: string | null;
  targetX: number | null;
  targetY: number | null;
  speedMultiplier: number | null;
  reason: string | null;
}

const MARKED_COMBO_CHASE_RANGE = 430;
const READY_ITEM_COOLDOWN = 0;
const THREAT_RETREAT_SCORE = 58;
const MINION_PRESSURE_RADIUS = 360;
const SAFE_RECALL_RADIUS = 260;
const SIEGE_ACTIVE_RANGE = 250;
const TOWER_THREAT_RANGE = 360;

export interface EnemyMinionPressure {
  nearbyHostileMinions: number;
  nearbyFriendlyMinions: number;
}

const EMPTY_MINION_PRESSURE: EnemyMinionPressure = {
  nearbyHostileMinions: 0,
  nearbyFriendlyMinions: 0,
};

export interface EnemyHeroDecisionInput {
  enemy: Unit;
  player: Unit;
  enemySkillCooldown: number;
  canSafelyRecall: boolean;
  lanePressure?: LanePressure;
  enemyGold?: number;
  itemBreakpointGold?: number | null;
  enemyItems?: ReadonlySet<string>;
  enemyItemCooldowns?: Partial<Record<ItemId, number>>;
  underEnemyTowerThreat?: boolean;
  minionPressure?: EnemyMinionPressure;
  siegeTarget?: Building;
  lastHitTarget?: Unit;
  playerHiddenInBrush?: boolean;
}

interface EnemyHeroDecisionContextInput {
  enemy: Unit;
  player: Unit;
  units: Unit[];
  buildings: Building[];
  waveNumber: number;
  enemySkillCooldown: number;
  enemyGold: number;
  itemBreakpointGold: number | null;
  enemyItems: ReadonlySet<string>;
  enemyItemCooldowns: Partial<Record<ItemId, number>>;
}

interface EnemyThreatProfileInput {
  enemy: Unit;
  player: Unit;
  lanePressure: LanePressure;
  underEnemyTowerThreat?: boolean;
  minionPressure?: EnemyMinionPressure;
}

export interface EnemyThreatProfile {
  score: number;
  primaryReason: "low_health" | "enemy_tower" | "bad_wave" | "minion_pressure" | "player_close" | null;
}

export const findLastHitCandidate = (source: Unit, units: Unit[]) =>
  units
    .filter((unit) => unit.alive && unit.team !== source.team && unit.kind !== "hero")
    .map((unit) => ({ unit, gap: distance(source, unit) - source.radius - unit.radius }))
    .filter(({ unit, gap }) => gap <= source.attackRange + 110 && unit.hp <= source.attackDamage + 20)
    .sort((a, b) => a.unit.hp - b.unit.hp || a.gap - b.gap)[0]?.unit;

export const enemyMinionPressureAround = (enemy: Unit, units: Unit[], radius = MINION_PRESSURE_RADIUS): EnemyMinionPressure => {
  let nearbyHostileMinions = 0;
  let nearbyFriendlyMinions = 0;

  for (const unit of units) {
    if (!unit.alive || unit.kind === "hero") continue;
    const gap = distance(enemy, unit) - enemy.radius - unit.radius;
    if (gap > radius) continue;
    if (unit.team === enemy.team) {
      nearbyFriendlyMinions += 1;
    } else {
      nearbyHostileMinions += 1;
    }
  }

  return { nearbyHostileMinions, nearbyFriendlyMinions };
};

export const createEnemyHeroDecisionInput = ({
  enemy,
  player,
  units,
  buildings,
  waveNumber,
  enemySkillCooldown,
  enemyGold,
  itemBreakpointGold,
  enemyItems,
  enemyItemCooldowns,
}: EnemyHeroDecisionContextInput): EnemyHeroDecisionInput => {
  const siegeCandidate = findNearestAttackableBuilding(enemy, buildings, SIEGE_ACTIVE_RANGE);
  const siegeTarget = siegeCandidate && structureDamageMultiplier(enemy.team, siegeCandidate, units) >= 1 ? siegeCandidate : undefined;

  return {
    enemy,
    player,
    enemySkillCooldown,
    canSafelyRecall: !findNearestEnemyUnit(units, enemy, SAFE_RECALL_RADIUS),
    lanePressure: createLaneSnapshot({ units, waveNumber }).pressure,
    enemyGold,
    itemBreakpointGold,
    enemyItems,
    enemyItemCooldowns,
    underEnemyTowerThreat: Boolean(findNearestAttackableBuilding(enemy, buildings, TOWER_THREAT_RANGE)),
    minionPressure: enemyMinionPressureAround(enemy, units),
    siegeTarget,
    lastHitTarget: findLastHitCandidate(enemy, units),
    playerHiddenInBrush: isPointInBrush(player) && distance(enemy, player) > BRUSH_REVEAL_RADIUS,
  };
};

export const traceEnemyHeroDecision = (decision: EnemyHeroDecision): EnemyHeroDecisionTrace => {
  const reason = decision.reason ?? null;
  if (decision.kind === "move") {
    const target = decision.target;
    return {
      intent: `${decision.state}:move`,
      targetId: "id" in target ? String(target.id) : null,
      targetX: Math.round(target.x),
      targetY: Math.round(target.y),
      speedMultiplier: Number(decision.speedMultiplier.toFixed(2)),
      reason,
    };
  }

  if (decision.kind === "attackUnit") {
    return {
      intent: `${decision.state}:attackUnit`,
      targetId: decision.target.id,
      targetX: Math.round(decision.target.x),
      targetY: Math.round(decision.target.y),
      speedMultiplier: null,
      reason,
    };
  }

  if (decision.kind === "useItem") {
    const target = decision.targetBuilding;
    return {
      intent: `${decision.state}:useItem`,
      targetId: target?.id ?? decision.itemId,
      targetX: target ? Math.round(target.x) : null,
      targetY: target ? Math.round(target.y) : null,
      speedMultiplier: null,
      reason,
    };
  }

  return {
    intent: `${decision.state}:${decision.kind}`,
    targetId: null,
    targetX: null,
    targetY: null,
    speedMultiplier: null,
    reason,
  };
};

export const decideEnemyHeroAction = ({
  enemy,
  player,
  enemySkillCooldown,
  canSafelyRecall,
  lanePressure = "neutral",
  enemyGold = 0,
  itemBreakpointGold = null,
  enemyItems = new Set(),
  enemyItemCooldowns = {},
  underEnemyTowerThreat = false,
  minionPressure = EMPTY_MINION_PRESSURE,
  siegeTarget,
  lastHitTarget,
  playerHiddenInBrush = false,
}: EnemyHeroDecisionInput): EnemyHeroDecision => {
  const gap = distance(enemy, player);
  const healthRatio = enemy.hp / enemy.maxHp;
  const wavePlan = enemyWavePlan(enemy.team, lanePressure);
  const threatProfile = enemyThreatProfile({ enemy, player, lanePressure, underEnemyTowerThreat, minionPressure });

  if (enemy.recallTimer > 0) {
    return { kind: "recalling", state: "Recall", reason: "recall_channel" };
  }

  if (healthRatio < 0.25 && gap > 460 && canSafelyRecall) {
    return { kind: "startRecall", state: "Recall", reason: "critical_health_recall" };
  }

  if (itemBreakpointGold !== null && enemyGold >= itemBreakpointGold && gap > 460 && canSafelyRecall && wavePlan.safeForRecall) {
    return { kind: "startRecall", state: "Recall", reason: "item_breakpoint_recall" };
  }

  if (healthRatio < 0.4 && gap > 460 && canSafelyRecall && wavePlan.safeForRecall) {
    return { kind: "startRecall", state: "Recall", reason: "safe_wave_recall" };
  }

  if (healthRatio < 0.35) {
    return {
      kind: "move",
      state: "Retreat",
      target: distance(enemy, CRIMSON_BASE) < 160 ? CRIMSON_BASE : { x: 1210, y: 315 },
      speedMultiplier: 0.85,
      reason: "low_health_retreat",
    };
  }

  if (playerHiddenInBrush && player.alive) {
    return {
      kind: "move",
      state: "Laning",
      target: wavePlan.holdDefensiveAnchor ? wavePlan.defensiveAnchor : enemyLaningAnchor(enemy),
      speedMultiplier: 0.66,
      reason: "player_hidden_in_brush",
    };
  }

  if (wavePlan.unsafeForTrading && player.alive && gap < 340) {
    return {
      kind: "move",
      state: "Retreat",
      target: wavePlan.defensiveAnchor,
      speedMultiplier: 0.82,
      reason: "unsafe_wave_disengage",
    };
  }

  const activeItemDecision = enemyActiveItemDecision({ enemy, player, gap, healthRatio, wavePlan, enemyItems, enemyItemCooldowns, siegeTarget });
  if (activeItemDecision) return activeItemDecision;

  if (threatProfile.score >= THREAT_RETREAT_SCORE && player.alive && gap < MARKED_COMBO_CHASE_RANGE) {
    return {
      kind: "move",
      state: "Retreat",
      target: wavePlan.defensiveAnchor,
      speedMultiplier: 0.84,
      reason: `threat_score_retreat:${threatProfile.primaryReason ?? "mixed"}`,
    };
  }

  if (player.alive && player.markTimer > 0 && healthRatio > 0.48 && !wavePlan.unsafeForTrading) {
    if (gap < enemy.attackRange + player.radius) {
      return { kind: "attackUnit", state: "All In", target: player, reason: "marked_combo_attack" };
    }
    if (gap < MARKED_COMBO_CHASE_RANGE) {
      return { kind: "move", state: "All In", target: player, speedMultiplier: 0.92, reason: "marked_combo_chase" };
    }
  }

  if (player.alive && player.hp / player.maxHp < 0.25 && healthRatio > 0.48 && !wavePlan.unsafeForTrading) {
    if (gap < enemy.attackRange + player.radius) {
      return { kind: "attackUnit", state: "All In", target: player, reason: "player_low_all_in" };
    }
    return { kind: "move", state: "All In", target: player, speedMultiplier: 0.9, reason: "player_low_all_in" };
  }

  if (player.alive && gap < 310 && enemySkillCooldown <= 0 && healthRatio > 0.42 && !wavePlan.unsafeForTrading) {
    return { kind: "harass", state: "Harass", reason: "harass_window" };
  }

  if (lastHitTarget) {
    const targetGap = distance(enemy, lastHitTarget) - enemy.radius - lastHitTarget.radius;
    if (targetGap <= enemy.attackRange + 18) {
      return { kind: "attackUnit", state: "Laning", target: lastHitTarget, reason: "last_hit" };
    }
    return { kind: "move", state: "Laning", target: lastHitTarget, speedMultiplier: 0.65, reason: "last_hit" };
  }

  if (gap < enemy.attackRange + player.radius && player.alive) {
    return { kind: "attackUnit", state: "Laning", target: player, reason: "basic_trade" };
  }

  return {
    kind: "move",
    state: "Laning",
    target: wavePlan.holdDefensiveAnchor ? wavePlan.defensiveAnchor : gap < 360 ? player : enemyLaningAnchor(enemy),
    speedMultiplier: wavePlan.holdDefensiveAnchor ? 0.64 : 0.72,
    reason: wavePlan.holdDefensiveAnchor ? "unsafe_wave_anchor" : "laning_anchor",
  };
};

const enemyLaningAnchor = (enemy: Unit) => {
  const nextPoint = nextLaneTacticalPointForTeam(enemy.team, lanePathProgress(enemy));
  return laneTacticalPointTarget(nextPoint);
};

const enemyWavePlan = (team: Unit["team"], pressure: LanePressure) => {
  const owner = pressureOwner(pressure);
  const ownPressure = owner === team;
  const opponentPressure = owner !== null && owner !== team;
  return {
    safeForRecall: ownPressure || pressure === "resetting" || pressure === "empty",
    unsafeForTrading: opponentPressure,
    holdDefensiveAnchor: opponentPressure,
    defensiveAnchor: laneTacticalPointTarget(defensivePointForTeam(team)),
  };
};

const pressureOwner = (pressure: LanePressure): Unit["team"] | null => {
  if (pressure.startsWith("azure_")) return "azure";
  if (pressure.startsWith("crimson_")) return "crimson";
  return null;
};

const defensivePointForTeam = (team: Unit["team"]): LaneTacticalPointId => (team === "azure" ? "azure_outer" : "crimson_outer");

export const enemyThreatProfile = ({
  enemy,
  player,
  lanePressure,
  underEnemyTowerThreat = false,
  minionPressure = EMPTY_MINION_PRESSURE,
}: EnemyThreatProfileInput): EnemyThreatProfile => {
  const healthRatio = enemy.hp / enemy.maxHp;
  const gap = distance(enemy, player);
  const owner = pressureOwner(lanePressure);
  const minionPressureDelta = Math.max(0, minionPressure.nearbyHostileMinions - minionPressure.nearbyFriendlyMinions);
  const minionPressureScore = Math.min(36, minionPressureDelta * 9);
  const components = [
    { reason: "low_health" as const, score: healthRatio < 0.4 ? 35 : healthRatio < 0.55 ? 18 : 0 },
    { reason: "enemy_tower" as const, score: underEnemyTowerThreat ? 30 : 0 },
    { reason: "bad_wave" as const, score: owner !== null && owner !== enemy.team ? 24 : 0 },
    { reason: "minion_pressure" as const, score: minionPressureScore },
    { reason: "player_close" as const, score: player.alive && gap < 285 && player.hp / player.maxHp > 0.45 ? 15 : 0 },
  ];
  const score = components.reduce((sum, component) => sum + component.score, 0);
  const primary = components.slice().sort((a, b) => b.score - a.score)[0];
  return {
    score,
    primaryReason: primary && primary.score > 0 ? primary.reason : null,
  };
};

interface EnemyActiveItemDecisionInput {
  enemy: Unit;
  player: Unit;
  gap: number;
  healthRatio: number;
  wavePlan: ReturnType<typeof enemyWavePlan>;
  enemyItems: ReadonlySet<string>;
  enemyItemCooldowns: Partial<Record<ItemId, number>>;
  siegeTarget?: Building;
}

const enemyActiveItemDecision = ({ player, gap, healthRatio, wavePlan, enemyItems, enemyItemCooldowns, siegeTarget }: EnemyActiveItemDecisionInput): EnemyHeroDecision | null => {
  const itemReady = (itemId: ItemId) => enemyItems.has(itemId) && (enemyItemCooldowns[itemId] ?? READY_ITEM_COOLDOWN) <= READY_ITEM_COOLDOWN;

  if (player.alive && player.markTimer > 0 && gap < MARKED_COMBO_CHASE_RANGE && !wavePlan.unsafeForTrading && itemReady("haste_talisman")) {
    return { kind: "useItem", state: "All In", itemId: "haste_talisman", reason: "combo_haste_active" };
  }

  if (player.alive && gap < 360 && healthRatio < 0.52 && itemReady("guard_shield")) {
    return { kind: "useItem", state: "Retreat", itemId: "guard_shield", reason: "low_health_barrier" };
  }

  if (siegeTarget && healthRatio > 0.55 && (!player.alive || gap > 300) && !wavePlan.unsafeForTrading && itemReady("siege_hammer")) {
    return { kind: "useItem", state: "Laning", itemId: "siege_hammer", targetBuilding: siegeTarget, reason: "siege_demolish_active" };
  }

  return null;
};
