import { CAST_QUEUE_WINDOW, SKILL_CONFIG, WORLD_HEIGHT, WORLD_WIDTH } from "../data/game-config";
import type { SkillKey } from "../types";
import { clamp, directionFromVector } from "./rules";
import type { PendingDamageEvent, Point, Unit } from "./types";

type VfxDraft = NonNullable<PendingDamageEvent["vfx"]>;
type PendingDamageEventDraft = Omit<PendingDamageEvent, "id">;

interface PlayerSkillCastDraftInput {
  player: Unit;
  skill: SkillKey;
  level: number;
  direction: Point;
  elapsed: number;
}

interface PlayerSkillAttemptInput {
  player: Unit;
  skill: SkillKey;
  cooldown: number;
}

export interface PlayerSkillCastDraft {
  actionTimer: number;
  immediateVfx: VfxDraft[];
  damageEvents: PendingDamageEventDraft[];
  shield?: {
    amount: number;
    duration: number;
  };
  moveTo?: Point;
  message: string;
}

export interface PlayerSkillCastStateApplication {
  activeCastSkill: SkillKey;
  immediateVfx: VfxDraft[];
  damageEvents: PendingDamageEventDraft[];
  message: string;
}

export interface QueuedPlayerSkillStateApplication {
  pendingSkill: null;
  queuedSkill: SkillKey;
  queuedSkillAim: Point;
  queuedSkillTimer: number;
  message: string;
}

export interface AimSkillKeyState {
  q: boolean;
  w: boolean;
  e: boolean;
  r: boolean;
}

export type AimPreviewShape =
  | { kind: "circle"; radius: number }
  | { kind: "dash"; end: Point; radius: number }
  | { kind: "cone"; center: Point; left: Point; right: Point };

export const playerSkillLevel = (player: Unit, skill: SkillKey) => player.skillLevels[skill] ?? 0;

export const resolveActiveAimSkill = (input: {
  pendingSkill: SkillKey | null;
  showRangeIndicators: boolean;
  keysAvailable: boolean;
  modalOpen: boolean;
  keys: AimSkillKeyState;
}): SkillKey | null => {
  if (input.pendingSkill) return input.pendingSkill;
  if (!input.showRangeIndicators || !input.keysAvailable || input.modalOpen) return null;
  if (input.keys.r) return "r";
  if (input.keys.e) return "e";
  if (input.keys.w) return "w";
  if (input.keys.q) return "q";
  return null;
};

export const createAimPreviewShape = (player: Unit, skill: SkillKey, direction: Point): AimPreviewShape => {
  if (skill === "w") return { kind: "circle", radius: SKILL_CONFIG.w.radius };
  if (skill === "e") {
    const level = Math.max(1, playerSkillLevel(player, "e"));
    return {
      kind: "dash",
      end: {
        x: player.x + direction.x * SKILL_CONFIG.e.dashX[level],
        y: player.y + direction.y * SKILL_CONFIG.e.dashY[level],
      },
      radius: SKILL_CONFIG.e.radius,
    };
  }

  const config = skill === "r" ? SKILL_CONFIG.r : SKILL_CONFIG.q;
  const range = config.range;
  const halfAngle = config.halfAngleDeg * (Math.PI / 180);
  const leftAngle = Math.atan2(direction.y, direction.x) - halfAngle;
  const rightAngle = Math.atan2(direction.y, direction.x) + halfAngle;
  return {
    kind: "cone",
    center: { x: player.x + direction.x * range, y: player.y + direction.y * range },
    left: { x: player.x + Math.cos(leftAngle) * range, y: player.y + Math.sin(leftAngle) * range },
    right: { x: player.x + Math.cos(rightAngle) * range, y: player.y + Math.sin(rightAngle) * range },
  };
};

export const playerSkillAttemptFailure = ({ player, skill, cooldown }: PlayerSkillAttemptInput) => {
  if (cooldown > 0) return "Skill cooling down";
  if (skill === "r" && player.level < 6) return "Ultimate locked";
  if (playerSkillLevel(player, skill) <= 0) return "Skill not learned";
  if (player.mana < SKILL_CONFIG[skill].mana) return "Not enough mana";
  if (skill === "e" && player.rootTimer > 0) return "Rooted";
  return "";
};

export const createPlayerSkillCastDraft = ({ player, skill, level, direction, elapsed }: PlayerSkillCastDraftInput): PlayerSkillCastDraft => {
  const origin = { x: player.x, y: player.y };

  if (skill === "q") {
    return {
      actionTimer: 0.42,
      immediateVfx: [],
      damageEvents: [
        {
          triggerAt: elapsed + SKILL_CONFIG.q.hitDelay,
          sourceTeam: "azure",
          sourceId: player.id,
          kind: "cone",
          origin,
          direction,
          range: SKILL_CONFIG.q.range,
          halfAngleDeg: SKILL_CONFIG.q.halfAngleDeg,
          damage: SKILL_CONFIG.q.damage[level],
          buildingDamageMultiplier: 0.45,
          cancelIfSourceDead: true,
          mark: SKILL_CONFIG.q.markDuration,
          vfx: {
            key: "vfx-astra-q_slash_arc",
            x: origin.x + direction.x * 78,
            y: origin.y + direction.y * 46,
            scale: 1.05,
          },
        },
      ],
      message: "雪饮刀气已释放",
    };
  }

  if (skill === "w") {
    return {
      actionTimer: 0.42,
      immediateVfx: [],
      shield: {
        amount: SKILL_CONFIG.w.shield[level],
        duration: 2.8,
      },
      damageEvents: [
        {
          triggerAt: elapsed + SKILL_CONFIG.w.hitDelay,
          sourceTeam: "azure",
          sourceId: player.id,
          kind: "circle",
          center: origin,
          radius: SKILL_CONFIG.w.radius,
          damage: SKILL_CONFIG.w.pulseDamage[level],
          buildingDamageMultiplier: 0,
          cancelIfSourceDead: true,
          slow: {
            multiplier: SKILL_CONFIG.w.slowMultiplier,
            duration: SKILL_CONFIG.w.slowDuration,
          },
          mark: SKILL_CONFIG.w.markDuration,
          vfx: {
            key: "vfx-astra-w_shield_pulse",
            x: origin.x,
            y: origin.y,
            scale: 1.15,
          },
        },
      ],
      message: "冰风护体已展开",
    };
  }

  if (skill === "e") {
    const moveTo = {
      x: clamp(origin.x + direction.x * SKILL_CONFIG.e.dashX[level], 80, WORLD_WIDTH - 80),
      y: clamp(origin.y + direction.y * SKILL_CONFIG.e.dashY[level], 90, WORLD_HEIGHT - 90),
    };
    return {
      actionTimer: 0.24,
      immediateVfx: [
        {
          key: "vfx-astra-e_dash_trail",
          x: origin.x + direction.x * 42,
          y: origin.y + direction.y * 24,
          scale: 1.05,
        },
      ],
      moveTo,
      damageEvents: [
        {
          triggerAt: elapsed,
          sourceTeam: "azure",
          sourceId: player.id,
          kind: "circle",
          center: moveTo,
          radius: SKILL_CONFIG.e.radius,
          damage: SKILL_CONFIG.e.damage[level],
          buildingDamageMultiplier: 0,
          cancelIfSourceDead: true,
          consumeMarkBonus: SKILL_CONFIG.e.markBonus[level],
          cooldownRefund: SKILL_CONFIG.e.markRefund,
        },
      ],
      message: "风神腿突进",
    };
  }

  return {
    actionTimer: 0.42,
    immediateVfx: [],
    damageEvents: [
      {
        triggerAt: elapsed + SKILL_CONFIG.r.hitDelay,
        sourceTeam: "azure",
        sourceId: player.id,
        kind: "cone",
        origin,
        direction,
        range: SKILL_CONFIG.r.range,
        halfAngleDeg: SKILL_CONFIG.r.halfAngleDeg,
        damage: SKILL_CONFIG.r.damage[level],
        buildingDamageMultiplier: 0.35,
        cancelIfSourceDead: true,
        knockback: SKILL_CONFIG.r.knockback,
        root: SKILL_CONFIG.r.rootDuration,
        consumeMarkBonus: SKILL_CONFIG.r.markBonus[level],
        cooldownRefund: SKILL_CONFIG.r.markRefund,
        vfx: {
          key: "vfx-astra-r_shockwave",
          x: origin.x + direction.x * 104,
          y: origin.y + direction.y * 58,
          scale: 1.45,
        },
      },
    ],
    message: "傲寒狂刀已斩出",
  };
};

export const applyPlayerSkillCastState = (input: {
  player: Unit;
  skill: SkillKey;
  direction: Point;
  cooldown: number;
  cooldowns: Record<SkillKey, number>;
  draft: PlayerSkillCastDraft;
}): PlayerSkillCastStateApplication => {
  const { player, skill, direction, cooldown, cooldowns, draft } = input;
  player.lastDirection = directionFromVector(direction.x, direction.y);
  player.mana -= SKILL_CONFIG[skill].mana;
  cooldowns[skill] = cooldown;
  player.action = "cast";
  player.actionTimer = draft.actionTimer;
  player.targetUnitId = undefined;
  player.targetBuildingId = undefined;
  player.targetPoint = undefined;
  player.attackMovePoint = undefined;

  if (draft.shield) {
    player.shield = Math.max(player.shield, draft.shield.amount);
    player.shieldTimer = draft.shield.duration;
  }
  if (draft.moveTo) {
    player.x = draft.moveTo.x;
    player.y = draft.moveTo.y;
  }

  return {
    activeCastSkill: skill,
    immediateVfx: draft.immediateVfx,
    damageEvents: draft.damageEvents,
    message: draft.message,
  };
};

export const applyQueuedPlayerSkillState = (player: Unit, skill: SkillKey, aimPoint: Point): QueuedPlayerSkillStateApplication => {
  player.targetUnitId = undefined;
  player.targetBuildingId = undefined;
  player.targetPoint = undefined;
  player.attackMovePoint = undefined;

  return {
    pendingSkill: null,
    queuedSkill: skill,
    queuedSkillAim: { ...aimPoint },
    queuedSkillTimer: CAST_QUEUE_WINDOW,
    message: `${skill.toUpperCase()} buffered`,
  };
};
