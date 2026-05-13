import type { SkillKey, UnitKind } from "../types";
import type { Point } from "../simulation/types";

export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 900;

export const WAVE_INTERVAL = 25;
export const RECALL_DURATION = 4;
export const BASE_RESPAWN_SECONDS = 8;
export const RESPAWN_TIME_PER_DEATH = 2;
export const MAX_RESPAWN_SECONDS = 22;
export const BASE_REGEN_RADIUS = 390;
export const BASE_HEALTH_REGEN_PER_SECOND = 0.16;
export const BASE_MANA_REGEN_PER_SECOND = 0.2;

export const LANE_START: Point = { x: 205, y: 690 };
export const LANE_END: Point = { x: 1395, y: 220 };
export const PLAYER_START: Point = { x: 485, y: 565 };
export const ENEMY_START: Point = { x: 1085, y: 355 };
export const AZURE_BASE: Point = { x: 175, y: 705 };
export const CRIMSON_BASE: Point = { x: 1420, y: 205 };

export const PLAYER_COOLDOWNS: Record<SkillKey, number> = { q: 3.6, w: 8, e: 6, r: 24 };
export const LEVEL_XP_REQUIREMENTS = [0, 280, 660, 1140, 1720, 2400] as const;
export const PLAYER_XP_SHARE_RANGE = 560;
export const BASIC_ATTACK_WINDUP = 0.28;
export const MINION_ATTACK_WINDUP = 0.34;
export const TOWER_ATTACK_WINDUP = 0.2;
export const TOWER_HERO_AGGRO_SECONDS = 3.2;
export const CAST_QUEUE_WINDOW = 0.75;
export const DEFAULT_SKILL_LEVELS: Record<SkillKey, number> = { q: 1, w: 1, e: 1, r: 0 };

export const SKILL_CONFIG = {
  q: {
    mana: 45,
    cooldown: [0, 4.4, 4.0, 3.6, 3.2],
    damage: [0, 92, 128, 164, 200],
    range: 205,
    halfAngleDeg: 36,
    hitDelay: 0.18,
    markDuration: 3.2,
  },
  w: {
    mana: 55,
    cooldown: [0, 9.2, 8.4, 7.6, 6.8],
    shield: [0, 115, 155, 195, 235],
    pulseDamage: [0, 28, 42, 56, 70],
    radius: 136,
    hitDelay: 0.14,
    slowMultiplier: 0.68,
    slowDuration: 1.6,
    markDuration: 2.2,
  },
  e: {
    mana: 50,
    cooldown: [0, 7.0, 6.4, 5.8, 5.2],
    damage: [0, 74, 104, 134, 164],
    markBonus: [0, 40, 52, 64, 76],
    dashX: [0, 165, 182, 199, 216],
    dashY: [0, 112, 124, 136, 148],
    radius: 96,
    markRefund: { q: 1.1, e: 0.75 },
  },
  r: {
    mana: 100,
    cooldown: [0, 28, 24],
    damage: [0, 235, 315],
    markBonus: [0, 72, 104],
    range: 340,
    halfAngleDeg: 44,
    hitDelay: 0.24,
    knockback: 70,
    rootDuration: 0.75,
    markRefund: { q: 1.45, w: 0.8 },
  },
} as const;

export const ITEM_CATALOG = {
  bronze_sword: { name: "Bronze Sword", cost: 350, stats: "+18 Attack Damage", activeLabel: null, slot: null, activeKind: "none", activeCooldown: 0, attackDamage: 18, moveSpeed: 0, maxHp: 0, maxMana: 0, cooldownReduction: 0 },
  plated_boots: { name: "Plated Boots", cost: 300, stats: "+35 Move Speed", activeLabel: null, slot: null, activeKind: "none", activeCooldown: 0, attackDamage: 0, moveSpeed: 35, maxHp: 0, maxMana: 0, cooldownReduction: 0 },
  focus_crystal: { name: "Focus Crystal", cost: 400, stats: "+180 Mana", activeLabel: "Clarity", slot: 1, activeKind: "mana", activeCooldown: 32, attackDamage: 0, moveSpeed: 0, maxHp: 0, maxMana: 180, cooldownReduction: 0 },
  guard_shield: { name: "Guard Shield", cost: 450, stats: "+140 Health", activeLabel: "Barrier", slot: 2, activeKind: "shield", activeCooldown: 42, attackDamage: 0, moveSpeed: 0, maxHp: 140, maxMana: 0, cooldownReduction: 0 },
  haste_talisman: { name: "Haste Talisman", cost: 700, stats: "+12 Attack, +12 Move, +8% Haste", activeLabel: "Tempo", slot: 3, activeKind: "haste", activeCooldown: 38, attackDamage: 12, moveSpeed: 12, maxHp: 0, maxMana: 0, cooldownReduction: 0.08 },
  siege_hammer: { name: "Siege Hammer", cost: 900, stats: "+28 Attack Damage", activeLabel: "Demolish", slot: 4, activeKind: "demolish", activeCooldown: 48, attackDamage: 28, moveSpeed: 0, maxHp: 0, maxMana: 0, cooldownReduction: 0 },
} as const;

export type ItemId = keyof typeof ITEM_CATALOG;
export type ActiveItemKind = (typeof ITEM_CATALOG)[ItemId]["activeKind"];

export const ACTIVE_ITEM_IDS = Object.entries(ITEM_CATALOG)
  .filter(([, item]) => item.activeKind !== "none")
  .sort(([, a], [, b]) => (a.slot ?? 0) - (b.slot ?? 0))
  .map(([id]) => id as ItemId);

export const GOLD_REWARDS: Record<UnitKind, number> = { melee: 21, caster: 14, siege: 60, hero: 300 };
export const XP_REWARDS: Record<UnitKind, number> = { melee: 58, caster: 29, siege: 92, hero: 220 };
