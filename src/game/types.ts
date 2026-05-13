import type { Team } from "./assets";

export type GameResult = "playing" | "victory" | "defeat";

export interface CooldownSnapshot {
  q: number;
  w: number;
  e: number;
  r: number;
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
  kind: "hero" | "melee" | "caster";
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
    mana: number;
    maxMana: number;
    level: number;
    xp: number;
    gold: number;
    items: string[];
    shopAvailable: boolean;
    x: number;
    y: number;
    alive: boolean;
  };
  cooldowns: CooldownSnapshot;
  buildings: BuildingSnapshot[];
  units: UnitSnapshot[];
  activeVfx: number;
  nextWaveIn: number;
  message: string;
}
