import type { BuildingAssetId, Direction, Team, UnitAction } from "../assets";
import type { SkillKey, UnitKind } from "../types";

export interface Point {
  x: number;
  y: number;
}

export interface Unit {
  id: string;
  assetId: string;
  team: Team;
  kind: UnitKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shield: number;
  level: number;
  xp: number;
  gold: number;
  speed: number;
  radius: number;
  attackRange: number;
  attackDamage: number;
  buildingDamageMultiplier: number;
  attackCooldown: number;
  cooldownReduction: number;
  attackTimer: number;
  action: UnitAction;
  actionTimer: number;
  lastDirection: Direction;
  slowTimer: number;
  slowMultiplier: number;
  rootTimer: number;
  markTimer: number;
  hasteTimer: number;
  hasteMultiplier: number;
  shieldTimer: number;
  recallTimer: number;
  recallDuration: number;
  skillLevels: Record<SkillKey, number>;
  skillPoints: number;
  targetUnitId?: string;
  targetBuildingId?: string;
  targetPoint?: Point;
  attackMovePoint?: Point;
  aggroTargetId?: string;
  aggroTimer: number;
  aggroThreat: number;
  alive: boolean;
  respawnTimer: number;
  respawnDuration: number;
}

export interface Building {
  id: string;
  assetId: BuildingAssetId;
  team: Team;
  type: "tower" | "inhibitor" | "core";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  attackTimer: number;
  attackFlash: number;
  radius: number;
  targetUnitId?: string;
  championTargetId?: string;
  championShotStacks: number;
}

export type BuildingState = "idle" | "attack" | "damaged" | "destroyed";

export interface TowerAggroEntry {
  targetId: string;
  ttl: number;
  shots?: number;
}

export type TowerAggroState = Partial<Record<Team, TowerAggroEntry>>;

export interface SlowEffect {
  multiplier: number;
  duration: number;
}

export interface DamageHitEffects {
  slow?: SlowEffect;
  knockback?: number;
  root?: number;
  mark?: number;
  consumeMarkBonus?: number;
  cooldownRefund?: Partial<Record<SkillKey, number>>;
}

export interface PendingDamageEvent {
  id: string;
  triggerAt: number;
  sourceTeam: Team;
  sourceId?: string;
  kind: "unit" | "building" | "circle" | "cone";
  targetId?: string;
  buildingId?: string;
  center?: Point;
  origin?: Point;
  direction?: Point;
  radius?: number;
  range?: number;
  halfAngleDeg?: number;
  damage: number;
  buildingDamageMultiplier: number;
  cancelIfSourceDead: boolean;
  slow?: SlowEffect;
  knockback?: number;
  root?: number;
  mark?: number;
  consumeMarkBonus?: number;
  cooldownRefund?: Partial<Record<SkillKey, number>>;
  vfx?: {
    key: string;
    x: number;
    y: number;
    scale: number;
  };
}
