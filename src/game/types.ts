import type { Team } from "./assets";

export type GameResult = "playing" | "victory" | "defeat";
export type UnitKind = "hero" | "melee" | "caster" | "siege";
export type EnemyAiState = "Laning" | "Harass" | "Retreat" | "All In" | "Recall";

export interface CooldownSnapshot {
  q: number;
  w: number;
  e: number;
  r: number;
}

export type SkillKey = keyof CooldownSnapshot;

export interface SkillSnapshot {
  level: number;
  canCast: boolean;
  canQueue: boolean;
  queued: boolean;
  canUpgrade: boolean;
}

export interface ShopItemSnapshot {
  id: string;
  name: string;
  cost: number;
  stats: string;
  activeLabel: string | null;
  slot: number | null;
  cooldown: number;
  canUse: boolean;
  owned: boolean;
  affordable: boolean;
  available: boolean;
}

export interface ItemSlotSnapshot {
  id: string;
  name: string;
  activeLabel: string | null;
  slot: number | null;
  cooldown: number;
  canUse: boolean;
  owned: boolean;
}

export interface ScoreboardRowSnapshot {
  id: string;
  team: Team;
  name: string;
  level: number;
  kills: number;
  deaths: number;
  gold: number;
  lastHits: number;
  items: string[];
  alive: boolean;
  respawnTimer: number;
}

export interface MatchSummarySnapshot {
  duration: number;
  result: GameResult;
  player: {
    kills: number;
    deaths: number;
    level: number;
    lastHits: number;
    gold: number;
    items: string[];
  };
  enemy: {
    kills: number;
    deaths: number;
    level: number;
    lastHits: number;
    gold: number;
  };
  objectives: {
    azureTowerDestroyed: boolean;
    crimsonTowerDestroyed: boolean;
    azureCoreHp: number;
    crimsonCoreHp: number;
  };
}

export interface BuildingSnapshot {
  id: string;
  team: Team;
  type: "tower" | "core";
  hp: number;
  maxHp: number;
  state: "idle" | "attack" | "damaged" | "destroyed";
}

export interface UnitSnapshot {
  id: string;
  team: Team;
  kind: UnitKind;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  effects: string[];
}

export interface GameSnapshot {
  coordinateSystem: string;
  mode: GameResult;
  time: number;
  score: {
    azureKills: number;
    crimsonKills: number;
    azureHeroKills: number;
    crimsonHeroKills: number;
  };
  player: {
    hp: number;
    maxHp: number;
    shield: number;
    mana: number;
    maxMana: number;
    attackDamage: number;
    cooldownReduction: number;
    level: number;
    xp: number;
    gold: number;
    lastHits: number;
    deaths: number;
    skillPoints: number;
    recallProgress: number;
    recalling: boolean;
    deathTimer: number;
    respawnProgress: number;
    items: string[];
    shopAvailable: boolean;
    x: number;
    y: number;
    alive: boolean;
  };
  cooldowns: CooldownSnapshot;
  skills: Record<SkillKey, SkillSnapshot>;
  casting: {
    locked: boolean;
    activeSkill: SkillKey | null;
    lockout: number;
    queuedSkill: SkillKey | null;
    queuedExpiresIn: number;
  };
  lane: {
    waveNumber: number;
    nextSiegeWave: number;
  };
  shop: {
    open: boolean;
    available: boolean;
    items: ShopItemSnapshot[];
  };
  itemSlots: ItemSlotSnapshot[];
  settings: {
    open: boolean;
    quickCast: boolean;
    showRangeIndicators: boolean;
  };
  controls: {
    blocked: boolean;
    reason: string;
  };
  scoreboard: {
    open: boolean;
    rows: ScoreboardRowSnapshot[];
  };
  enemyAi: {
    state: EnemyAiState;
    skillCooldown: number;
    gold: number;
    xp: number;
    lastHits: number;
    deaths: number;
  };
  aimPreview: {
    active: boolean;
    skill: SkillKey | null;
    mode: "quick" | "normal" | "hold" | "off";
    x: number;
    y: number;
  };
  buildings: BuildingSnapshot[];
  units: UnitSnapshot[];
  activeVfx: number;
  nextWaveIn: number;
  message: string;
  matchSummary: MatchSummarySnapshot | null;
}
