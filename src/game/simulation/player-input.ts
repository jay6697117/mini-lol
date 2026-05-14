import type { SkillKey } from "../types";
import { normalize } from "./rules";
import type { Building, Point, Unit } from "./types";

export type KeyboardDownAction =
  | { kind: "none"; preventDefault: false; syncViews: false }
  | { kind: "openScoreboard"; preventDefault: true; syncViews: true }
  | { kind: "escape"; preventDefault: true; syncViews: true }
  | { kind: "toggleShop"; preventDefault: true; syncViews: true }
  | { kind: "settingsBlockedShop"; preventDefault: true; syncViews: true }
  | { kind: "upgradeSkill"; preventDefault: true; syncViews: false; skill: SkillKey };

export type KeyboardUpAction =
  | { kind: "none"; preventDefault: false; syncViews: false }
  | { kind: "closeScoreboard"; preventDefault: true; syncViews: true };

export type PointerDownAction =
  | { kind: "confirmPendingSkill" }
  | { kind: "cancelPendingSkill" }
  | { kind: "blocked" }
  | { kind: "attackUnit"; target: Unit }
  | { kind: "attackBuilding"; building: Building }
  | { kind: "move"; attackMove: boolean };

export type PlayerInputTickAction =
  | { kind: "activateSkill"; skill: SkillKey }
  | { kind: "useItemSlot"; slot: 1 | 2 | 3 | 4 }
  | { kind: "startRecall" }
  | { kind: "manualAttack" }
  | { kind: "toggleFullscreen" };

export interface AxisMovementDecision {
  cancelRecall: boolean;
  cancelPendingSkill: boolean;
  action:
    | { kind: "none" }
    | { kind: "castingLocked" }
    | { kind: "move"; direction: Point };
}

export type TargetPointMovementDecision =
  | { kind: "none" }
  | { kind: "idle" }
  | { kind: "clearTargetPoint" }
  | { kind: "clearAttackMovePoint" }
  | { kind: "move"; direction: Point };

export type PlayerInputBlockDecision =
  | { kind: "active" }
  | { kind: "dead"; cancelPendingSkill: true; clearQueuedSkill: true }
  | { kind: "modal"; action: Unit["action"] };

export interface PlayerActionStartDecision {
  allowed: boolean;
  message?: string;
}

const idleKeyboardAction: KeyboardDownAction = { kind: "none", preventDefault: false, syncViews: false };
const idleKeyboardUpAction: KeyboardUpAction = { kind: "none", preventDefault: false, syncViews: false };

const skillFromKey = (key: string): SkillKey | null => {
  const normalized = key.toLowerCase();
  if (normalized === "q" || normalized === "w" || normalized === "e" || normalized === "r") return normalized;
  return null;
};

export const resolveKeyboardDownAction = (input: {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  settingsOpen: boolean;
}): KeyboardDownAction => {
  if (input.key === "Tab") return { kind: "openScoreboard", preventDefault: true, syncViews: true };
  if (input.key === "Escape") return { kind: "escape", preventDefault: true, syncViews: true };

  if (input.key.toLowerCase() === "p" && !input.repeat) {
    return input.settingsOpen
      ? { kind: "settingsBlockedShop", preventDefault: true, syncViews: true }
      : { kind: "toggleShop", preventDefault: true, syncViews: true };
  }

  if (!input.ctrlKey) return idleKeyboardAction;
  const skill = skillFromKey(input.key);
  return skill ? { kind: "upgradeSkill", preventDefault: true, syncViews: false, skill } : idleKeyboardAction;
};

export const resolveKeyboardUpAction = (key: string): KeyboardUpAction =>
  key === "Tab" ? { kind: "closeScoreboard", preventDefault: true, syncViews: true } : idleKeyboardUpAction;

export const resolvePointerDownAction = (input: {
  hasPendingSkill: boolean;
  leftButtonDown: boolean;
  playerAlive: boolean;
  modalOpen: boolean;
  targetUnit?: Unit;
  targetBuilding?: Building;
  attackMove: boolean;
}): PointerDownAction => {
  if (input.hasPendingSkill) return input.leftButtonDown ? { kind: "confirmPendingSkill" } : { kind: "cancelPendingSkill" };
  if (!input.playerAlive || input.modalOpen) return { kind: "blocked" };
  if (input.targetUnit) return { kind: "attackUnit", target: input.targetUnit };
  if (input.targetBuilding) return { kind: "attackBuilding", building: input.targetBuilding };
  return { kind: "move", attackMove: input.attackMove };
};

export const collectPlayerInputTickActions = (input: {
  ctrlDown: boolean;
  qJustDown: boolean;
  wJustDown: boolean;
  eJustDown: boolean;
  rJustDown: boolean;
  oneJustDown: boolean;
  twoJustDown: boolean;
  threeJustDown: boolean;
  fourJustDown: boolean;
  recallJustDown: boolean;
  manualAttackJustDown: boolean;
  fullscreenJustDown: boolean;
}): PlayerInputTickAction[] => {
  const actions: PlayerInputTickAction[] = [];
  if (!input.ctrlDown) {
    if (input.qJustDown) actions.push({ kind: "activateSkill", skill: "q" });
    if (input.wJustDown) actions.push({ kind: "activateSkill", skill: "w" });
    if (input.eJustDown) actions.push({ kind: "activateSkill", skill: "e" });
    if (input.rJustDown) actions.push({ kind: "activateSkill", skill: "r" });
  }
  if (input.oneJustDown) actions.push({ kind: "useItemSlot", slot: 1 });
  if (input.twoJustDown) actions.push({ kind: "useItemSlot", slot: 2 });
  if (input.threeJustDown) actions.push({ kind: "useItemSlot", slot: 3 });
  if (input.fourJustDown) actions.push({ kind: "useItemSlot", slot: 4 });
  if (input.recallJustDown) actions.push({ kind: "startRecall" });
  if (input.manualAttackJustDown) actions.push({ kind: "manualAttack" });
  if (input.fullscreenJustDown) actions.push({ kind: "toggleFullscreen" });
  return actions;
};

export const resolveAxisMovementDecision = (input: {
  axisX: number;
  axisY: number;
  recalling: boolean;
  hasPendingSkill: boolean;
  castingLocked: boolean;
}): AxisMovementDecision => {
  const moving = input.axisX !== 0 || input.axisY !== 0;
  if (input.castingLocked) {
    return {
      cancelRecall: moving && input.recalling,
      cancelPendingSkill: moving && input.hasPendingSkill,
      action: { kind: "castingLocked" },
    };
  }
  return {
    cancelRecall: moving && input.recalling,
    cancelPendingSkill: moving && input.hasPendingSkill,
    action: moving ? { kind: "move", direction: normalize(input.axisX, input.axisY) } : { kind: "none" },
  };
};

export const resolveTargetPointMovementDecision = (player: Unit, arriveDistance = 8): TargetPointMovementDecision => {
  if (!player.targetPoint) return player.actionTimer <= 0 ? { kind: "idle" } : { kind: "none" };

  const dx = player.targetPoint.x - player.x;
  const dy = player.targetPoint.y - player.y;
  if (Math.hypot(dx, dy) < arriveDistance) {
    return player.attackMovePoint ? { kind: "clearAttackMovePoint" } : { kind: "clearTargetPoint" };
  }
  return { kind: "move", direction: normalize(dx, dy) };
};

export const resolvePlayerInputBlockDecision = (player: Unit, modalOpen: boolean): PlayerInputBlockDecision => {
  if (!player.alive) return { kind: "dead", cancelPendingSkill: true, clearQueuedSkill: true };
  if (modalOpen) return { kind: "modal", action: player.actionTimer > 0 ? player.action : "idle" };
  return { kind: "active" };
};

export const resolvePlayerActionStartDecision = (input: {
  result: "playing" | "victory" | "defeat";
  playerAlive: boolean;
  modalOpen: boolean;
  modalBlockReason: string;
  castingLocked: boolean;
}): PlayerActionStartDecision => {
  if (input.result !== "playing") return { allowed: false };
  if (!input.playerAlive) return { allowed: false, message: "Respawning" };
  if (input.modalOpen) return { allowed: false, message: input.modalBlockReason };
  if (input.castingLocked) return { allowed: false, message: "Casting" };
  return { allowed: true };
};
