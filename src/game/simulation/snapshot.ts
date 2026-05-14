import { ACTIVE_ITEM_IDS, ITEM_CATALOG, type ItemId } from "../data/game-config";
import type { CooldownSnapshot, GameResult, GameSnapshot, MatchSummarySnapshot, ScoreboardRowSnapshot, SkillKey, SkillSnapshot } from "../types";
import { createLaneSnapshot } from "./lane-state";
import { lanePathProgress } from "./lane-path";
import { lastHitHintForUnit, lastHitWindowForUnit } from "./last-hit";
import { buildingState } from "./objectives";
import { maxSkillLevel } from "./rules";
import { towerDangerForUnit } from "./towers";
import type { Building, Point, TowerAggroState, Unit } from "./types";

const coordinateSystem = "world pixels, origin top-left, x right, y down; lane runs from azure lower-left to crimson upper-right";

interface PlayerInputState {
  result: GameResult;
  player: Unit;
  shopOpen: boolean;
  scoreboardOpen: boolean;
  settingsOpen: boolean;
  playerCastingLocked: boolean;
}

export interface CreateGameSnapshotInput extends PlayerInputState {
  elapsed: number;
  azureKills: number;
  crimsonKills: number;
  playerHeroKills: number;
  enemyHeroKills: number;
  playerLastHits: number;
  playerCsStreak: number;
  playerMissedCs: number;
  enemyLastHits: number;
  playerDeaths: number;
  enemyDeaths: number;
  enemyGold: number;
  enemyXp: number;
  enemySkillCooldown: number;
  enemyAiState: GameSnapshot["enemyAi"]["state"];
  enemyAiTrace: GameSnapshot["enemyAi"]["trace"];
  playerCooldowns: CooldownSnapshot;
  itemCooldowns: Record<ItemId, number>;
  purchasedItems: ReadonlySet<string>;
  enemyPurchasedItems: ReadonlySet<string>;
  waveNumber: number;
  waveTimer: number;
  shopAvailable: boolean;
  quickCast: boolean;
  showRangeIndicators: boolean;
  queuedSkill: SkillKey | null;
  queuedSkillTimer: number;
  pendingSkill: SkillKey | null;
  activeCastSkill: SkillKey | null;
  activeAimSkill: SkillKey | null;
  aimPreviewVisible: boolean;
  pointerWorld: Point;
  buildings: Building[];
  units: Unit[];
  towerHeroAggro: TowerAggroState;
  activeVfx: number;
  message: string;
  canAttemptSkill: (skill: SkillKey) => boolean;
}

interface UnitEffectLabelContext {
  player?: Unit;
  buildings?: Building[];
}

export const unitEffectLabels = (unit: Unit, context: UnitEffectLabelContext = {}) => {
  const effects: string[] = [];
  if (unit.markTimer > 0) effects.push("marked");
  if (unit.rootTimer > 0) effects.push("rooted");
  if (unit.slowTimer > 0) effects.push("slowed");
  if (unit.shield > 0) effects.push("shielded");
  if (unit.hasteTimer > 0) effects.push("hasted");
  if (unit.aggroTimer > 0 && unit.aggroTargetId) effects.push("aggro");
  if (context.player && context.buildings) {
    const lastHitWindow = lastHitWindowForUnit({ unit, player: context.player, buildings: context.buildings });
    if (lastHitWindow === "last_hit") effects.push("last-hit");
    if (lastHitWindow === "tower_setup") effects.push("tower-setup");
  }
  return effects;
};

export const playerInputBlockedReason = ({ result, player, settingsOpen, shopOpen, scoreboardOpen, playerCastingLocked }: PlayerInputState) => {
  if (result !== "playing") return "Match ended";
  if (!player.alive) return "Respawning";
  if (settingsOpen) return "Settings open";
  if (shopOpen) return "Shop open";
  if (scoreboardOpen) return "Scoreboard open";
  if (playerCastingLocked) return "Casting";
  return "";
};

const canUseItem = (itemId: ItemId, input: CreateGameSnapshotInput) => {
  const item = ITEM_CATALOG[itemId];
  return (
    input.result === "playing" &&
    input.player.alive &&
    !isModalOpen(input) &&
    !input.playerCastingLocked &&
    input.purchasedItems.has(itemId) &&
    item.activeKind !== "none" &&
    input.itemCooldowns[itemId] <= 0
  );
};

const isModalOpen = ({ shopOpen, scoreboardOpen, settingsOpen }: Pick<CreateGameSnapshotInput, "shopOpen" | "scoreboardOpen" | "settingsOpen">) =>
  shopOpen || scoreboardOpen || settingsOpen;

const createSkillSnapshot = (input: CreateGameSnapshotInput, skill: SkillKey): SkillSnapshot => {
  const level = input.player.skillLevels[skill] ?? 0;
  const canAttempt = input.canAttemptSkill(skill);
  const modalOpen = isModalOpen(input);
  return {
    level,
    canCast: input.result === "playing" && input.player.alive && !modalOpen && !input.playerCastingLocked && canAttempt,
    canQueue: input.result === "playing" && input.player.alive && !modalOpen && input.playerCastingLocked && canAttempt,
    queued: input.queuedSkill === skill,
    canUpgrade: input.player.skillPoints > 0 && level < maxSkillLevel(skill) && (skill !== "r" || input.player.level >= 6),
  };
};

const shopItemSnapshots = (input: CreateGameSnapshotInput) =>
  Object.entries(ITEM_CATALOG).map(([id, item]) => ({
    id,
    name: item.name,
    cost: item.cost,
    stats: item.stats,
    activeLabel: item.activeLabel,
    slot: item.slot,
    cooldown: Number(input.itemCooldowns[id as ItemId].toFixed(1)),
    canUse: canUseItem(id as ItemId, input),
    owned: input.purchasedItems.has(id),
    affordable: input.player.gold >= item.cost,
    available: input.shopAvailable,
  }));

const itemSlotSnapshots = (input: CreateGameSnapshotInput) =>
  ACTIVE_ITEM_IDS.map((id) => {
    const item = ITEM_CATALOG[id];
    return {
      id,
      name: item.name,
      activeLabel: item.activeLabel,
      slot: item.slot,
      cooldown: Number(input.itemCooldowns[id].toFixed(1)),
      canUse: canUseItem(id, input),
      owned: input.purchasedItems.has(id),
    };
  });

const scoreboardRows = (input: CreateGameSnapshotInput): ScoreboardRowSnapshot[] => {
  const enemy = input.units.find((unit) => unit.id === "enemy_hero");
  return [
    {
      id: input.player.id,
      team: input.player.team,
      name: "Astra Vanguard",
      level: input.player.level,
      kills: input.playerHeroKills,
      deaths: input.playerDeaths,
      gold: input.player.gold,
      lastHits: input.playerLastHits,
      items: [...input.purchasedItems],
      alive: input.player.alive,
      respawnTimer: input.player.alive ? 0 : Math.max(0, Math.ceil(input.player.respawnTimer)),
    },
    {
      id: enemy?.id ?? "enemy_hero",
      team: "crimson",
      name: "Crimson Duelist",
      level: enemy?.level ?? 1,
      kills: input.enemyHeroKills,
      deaths: input.enemyDeaths,
      gold: input.enemyGold,
      lastHits: input.enemyLastHits,
      items: [...input.enemyPurchasedItems],
      alive: enemy?.alive ?? false,
      respawnTimer: enemy?.alive ? 0 : Math.max(0, Math.ceil(enemy?.respawnTimer ?? 0)),
    },
  ];
};

const requiredBuilding = (input: CreateGameSnapshotInput, id: string) => {
  const building = input.buildings.find((candidate) => candidate.id === id);
  if (!building) throw new Error(`Building ${id} is missing`);
  return building;
};

const matchSummary = (input: CreateGameSnapshotInput): MatchSummarySnapshot | null => {
  if (input.result === "playing") return null;
  const enemy = input.units.find((unit) => unit.id === "enemy_hero");
  const azureTower = requiredBuilding(input, "azure_outer_tower");
  const crimsonTower = requiredBuilding(input, "crimson_outer_tower");
  const azureCore = requiredBuilding(input, "azure_core");
  const crimsonCore = requiredBuilding(input, "crimson_core");
  return {
    duration: Math.round(input.elapsed),
    result: input.result,
    player: {
      kills: input.playerHeroKills,
      deaths: input.playerDeaths,
      level: input.player.level,
      lastHits: input.playerLastHits,
      gold: input.player.gold,
      items: [...input.purchasedItems],
    },
    enemy: {
      kills: input.enemyHeroKills,
      deaths: input.enemyDeaths,
      level: enemy?.level ?? 1,
      lastHits: input.enemyLastHits,
      gold: input.enemyGold,
    },
    objectives: {
      azureTowerDestroyed: azureTower.hp <= 0,
      crimsonTowerDestroyed: crimsonTower.hp <= 0,
      azureCoreHp: Math.round(azureCore.hp),
      crimsonCoreHp: Math.round(crimsonCore.hp),
    },
  };
};

export const createGameSnapshot = (input: CreateGameSnapshotInput): GameSnapshot => {
  const controlReason = playerInputBlockedReason(input);
  return {
    coordinateSystem,
    mode: input.result,
    time: Number(input.elapsed.toFixed(2)),
    score: {
      azureKills: input.azureKills,
      crimsonKills: input.crimsonKills,
      azureHeroKills: input.playerHeroKills,
      crimsonHeroKills: input.enemyHeroKills,
    },
    player: {
      hp: Math.round(input.player.hp),
      maxHp: input.player.maxHp,
      shield: Math.round(input.player.shield),
      mana: Math.round(input.player.mana),
      maxMana: input.player.maxMana,
      attackDamage: Math.round(input.player.attackDamage),
      cooldownReduction: Number(input.player.cooldownReduction.toFixed(2)),
      level: input.player.level,
      xp: Math.round(input.player.xp),
      gold: input.player.gold,
      lastHits: input.playerLastHits,
      csStreak: input.playerCsStreak,
      missedCs: input.playerMissedCs,
      deaths: input.playerDeaths,
      skillPoints: input.player.skillPoints,
      recallProgress: input.player.recallTimer > 0 && input.player.recallDuration > 0 ? Number(((input.player.recallDuration - input.player.recallTimer) / input.player.recallDuration).toFixed(2)) : 0,
      recalling: input.player.recallTimer > 0,
      deathTimer: input.player.alive ? 0 : Math.max(0, Number(input.player.respawnTimer.toFixed(1))),
      respawnProgress: input.player.alive || input.player.respawnDuration <= 0 ? 0 : Number(((input.player.respawnDuration - input.player.respawnTimer) / input.player.respawnDuration).toFixed(2)),
      items: [...input.purchasedItems],
      shopAvailable: input.shopAvailable,
      x: Math.round(input.player.x),
      y: Math.round(input.player.y),
      alive: input.player.alive,
    },
    cooldowns: {
      q: Number(input.playerCooldowns.q.toFixed(1)),
      w: Number(input.playerCooldowns.w.toFixed(1)),
      e: Number(input.playerCooldowns.e.toFixed(1)),
      r: Number(input.playerCooldowns.r.toFixed(1)),
    },
    skills: {
      q: createSkillSnapshot(input, "q"),
      w: createSkillSnapshot(input, "w"),
      e: createSkillSnapshot(input, "e"),
      r: createSkillSnapshot(input, "r"),
    },
    casting: {
      locked: input.playerCastingLocked,
      activeSkill: input.playerCastingLocked ? input.activeCastSkill : null,
      lockout: input.playerCastingLocked ? Number(input.player.actionTimer.toFixed(2)) : 0,
      queuedSkill: input.queuedSkill,
      queuedExpiresIn: input.queuedSkill ? Number(input.queuedSkillTimer.toFixed(2)) : 0,
    },
    lane: createLaneSnapshot({ units: input.units, waveNumber: input.waveNumber }),
    shop: {
      open: input.shopOpen,
      available: input.shopAvailable,
      items: shopItemSnapshots(input),
    },
    itemSlots: itemSlotSnapshots(input),
    settings: {
      open: input.settingsOpen,
      quickCast: input.quickCast,
      showRangeIndicators: input.showRangeIndicators,
    },
    controls: {
      blocked: Boolean(controlReason),
      reason: controlReason,
    },
    scoreboard: {
      open: input.scoreboardOpen,
      rows: scoreboardRows(input),
    },
    enemyAi: {
      state: input.enemyAiState,
      skillCooldown: Number(input.enemySkillCooldown.toFixed(1)),
      gold: input.enemyGold,
      xp: input.enemyXp,
      lastHits: input.enemyLastHits,
      deaths: input.enemyDeaths,
      trace: input.enemyAiTrace,
    },
    aimPreview: {
      active: input.aimPreviewVisible,
      skill: input.activeAimSkill,
      mode: input.pendingSkill ? "normal" : input.activeAimSkill ? (input.quickCast ? "hold" : "normal") : "off",
      x: Math.round(input.pointerWorld.x),
      y: Math.round(input.pointerWorld.y),
    },
    towerDanger: towerDangerForUnit({
      unit: input.player,
      buildings: input.buildings,
      units: input.units,
      towerHeroAggro: input.towerHeroAggro,
    }),
    buildings: input.buildings.map((building) => ({
      id: building.id,
      team: building.team,
      type: building.type,
      hp: Math.round(building.hp),
      maxHp: building.maxHp,
      state: buildingState(building),
    })),
    units: input.units
      .filter((unit) => unit.alive)
      .map((unit) => ({
        id: unit.id,
        team: unit.team,
        kind: unit.kind,
        hp: Math.round(unit.hp),
        maxHp: unit.maxHp,
        x: Math.round(unit.x),
        y: Math.round(unit.y),
        laneProgress: Number(lanePathProgress(unit).toFixed(2)),
        effects: unitEffectLabels(unit, { player: input.player, buildings: input.buildings }),
        lastHitHint: lastHitHintForUnit({ unit, player: input.player, buildings: input.buildings }),
      })),
    activeVfx: input.activeVfx,
    nextWaveIn: Number(Math.max(0, input.waveTimer).toFixed(1)),
    message: input.message,
    matchSummary: matchSummary(input),
  };
};
