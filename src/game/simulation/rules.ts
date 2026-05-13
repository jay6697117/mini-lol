import type { Direction } from "../assets";
import type { SkillKey } from "../types";
import { BASE_RESPAWN_SECONDS, MAX_RESPAWN_SECONDS, PLAYER_COOLDOWNS, RESPAWN_TIME_PER_DEATH, SKILL_CONFIG } from "../data/game-config";
import type { Point, Unit } from "./types";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const normalize = (x: number, y: number): Point => {
  const length = Math.hypot(x, y);
  return length > 0.0001 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
};

export const directionFromVector = (dx: number, dy: number): Direction => {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return "south";
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle >= 67.5 && angle < 112.5) return "south";
  if (angle >= 22.5 && angle < 67.5) return "south-east";
  if (angle >= -22.5 && angle < 22.5) return "east";
  if (angle >= -67.5 && angle < -22.5) return "north-east";
  if (angle >= -112.5 && angle < -67.5) return "north";
  if (angle >= -157.5 && angle < -112.5) return "north-west";
  if (angle >= 157.5 || angle < -157.5) return "west";
  return "south-west";
};

export const maxSkillLevel = (skill: SkillKey) => (skill === "r" ? 2 : 4);

export const skillCooldown = (player: Unit, skill: SkillKey) => {
  const level = player.skillLevels[skill] ?? 0;
  const cooldowns = SKILL_CONFIG[skill].cooldown as readonly number[];
  const base = cooldowns[level] ?? PLAYER_COOLDOWNS[skill];
  return Number((base * (1 - player.cooldownReduction)).toFixed(2));
};

export const respawnDurationFor = (deaths: number, elapsed: number) => {
  const timeScaling = Math.floor(elapsed / 180);
  return clamp(BASE_RESPAWN_SECONDS + Math.max(0, deaths - 1) * RESPAWN_TIME_PER_DEATH + timeScaling, BASE_RESPAWN_SECONDS, MAX_RESPAWN_SECONDS);
};
