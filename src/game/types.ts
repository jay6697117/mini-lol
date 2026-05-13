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
  canUpgrade: boolean;
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
}

export interface GameSnapshot {
  coordinateSystem: string;
  mode: GameResult;
  time: number;
  score: {
    azureKills: number;
    crimsonKills: number;
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
    skillPoints: number;
    recallProgress: number;
    recalling: boolean;
    items: string[];
    shopAvailable: boolean;
    x: number;
    y: number;
    alive: boolean;
  };
  cooldowns: CooldownSnapshot;
  skills: Record<SkillKey, SkillSnapshot>;
  lane: {
    waveNumber: number;
    nextSiegeWave: number;
  };
  enemyAi: {
    state: EnemyAiState;
    skillCooldown: number;
    gold: number;
    xp: number;
    lastHits: number;
  };
  aimPreview: {
    active: boolean;
    x: number;
    y: number;
  };
  buildings: BuildingSnapshot[];
  units: UnitSnapshot[];
  activeVfx: number;
  nextWaveIn: number;
  message: string;
}
