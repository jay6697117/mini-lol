import type { GameResult, SkillKey } from "../types";
import type { Unit } from "./types";

interface QueuedSkillTickInput {
  queuedSkill: SkillKey | null;
  queuedSkillTimer: number;
  dt: number;
  result: GameResult;
  player: Unit;
  modalOpen: boolean;
}

export type QueuedSkillTickDecision =
  | { kind: "none"; timer: number }
  | { kind: "clear"; timer: number; message?: string }
  | { kind: "wait"; timer: number }
  | { kind: "cast"; timer: number; skill: SkillKey };

export const resolveQueuedSkillTick = ({
  queuedSkill,
  queuedSkillTimer,
  dt,
  result,
  player,
  modalOpen,
}: QueuedSkillTickInput): QueuedSkillTickDecision => {
  if (!queuedSkill) return { kind: "none", timer: 0 };

  const timer = Math.max(0, queuedSkillTimer - dt);
  if (result !== "playing" || !player.alive || modalOpen) {
    return { kind: "clear", timer };
  }
  if (timer <= 0) {
    return { kind: "clear", timer, message: "Cast buffer expired" };
  }
  if (player.action === "cast" && player.actionTimer > 0) {
    return { kind: "wait", timer };
  }
  return { kind: "cast", timer, skill: queuedSkill };
};
