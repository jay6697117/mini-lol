import type { ActiveItemKind, ItemId } from "../data/game-config";
import type { CooldownSnapshot } from "../types";
import type { Building, Unit } from "./types";

interface ActiveItemEffectInput {
  kind: ActiveItemKind;
  itemId: ItemId;
  player: Unit;
  playerCooldowns: CooldownSnapshot;
  demolishTarget?: Building;
}

interface ActiveItemVfxDraft {
  key: string;
  x: number;
  y: number;
  scale: number;
}

export interface ActiveItemEffectDraft {
  used: boolean;
  message?: string;
  vfx: ActiveItemVfxDraft[];
  buildingDamage?: {
    building: Building;
    damage: number;
  };
}

export interface ActiveItemUseGateDecision {
  allowed: boolean;
  message?: string;
}

export interface ActiveItemUseApplication {
  used: boolean;
  message?: string;
  cooldown?: number;
  cancelRecall: boolean;
  vfx: ActiveItemVfxDraft[];
  buildingDamage?: ActiveItemEffectDraft["buildingDamage"];
}

export const resolveActiveItemUseGate = (input: {
  activeKind: ActiveItemKind;
  owned: boolean;
  actionStart: ActiveItemUseGateDecision;
  cooldown: number;
}): ActiveItemUseGateDecision => {
  if (input.activeKind === "none") return { allowed: false, message: "Passive item" };
  if (!input.owned) return { allowed: false, message: "Item not owned" };
  if (!input.actionStart.allowed) return input.actionStart;
  if (input.cooldown > 0) return { allowed: false, message: "Item cooling down" };
  return { allowed: true };
};

export const resolveActiveItemUseApplication = (input: {
  effect: ActiveItemEffectDraft;
  activeCooldown: number;
  successMessage: string;
  cancelRecall: boolean;
}): ActiveItemUseApplication => {
  if (!input.effect.used) {
    return {
      used: false,
      message: input.effect.message,
      cancelRecall: false,
      vfx: [],
    };
  }
  return {
    used: true,
    message: input.successMessage,
    cooldown: input.activeCooldown,
    cancelRecall: input.cancelRecall,
    vfx: input.effect.vfx,
    buildingDamage: input.effect.buildingDamage,
  };
};

export const applyActiveItemEffect = ({ kind, itemId, player, playerCooldowns, demolishTarget }: ActiveItemEffectInput): ActiveItemEffectDraft => {
  if (kind === "mana") {
    player.mana = Math.min(player.maxMana, player.mana + 160);
    for (const skill of ["q", "w", "e"] as const) {
      playerCooldowns[skill] = Math.max(0, playerCooldowns[skill] - 1.1);
    }
    return {
      used: true,
      vfx: [{ key: "vfx-astra-w_shield_pulse", x: player.x, y: player.y - 6, scale: 0.78 }],
    };
  }

  if (kind === "shield") {
    player.shield = Math.max(player.shield, 180);
    player.shieldTimer = Math.max(player.shieldTimer, 3.2);
    return {
      used: true,
      vfx: [{ key: "vfx-astra-w_shield_pulse", x: player.x, y: player.y, scale: 1 }],
    };
  }

  if (kind === "haste") {
    player.hasteMultiplier = Math.max(player.hasteMultiplier, 1.34);
    player.hasteTimer = Math.max(player.hasteTimer, 3.4);
    return {
      used: true,
      vfx: [{ key: "vfx-astra-e_dash_trail", x: player.x + 20, y: player.y - 4, scale: 0.92 }],
    };
  }

  if (kind === "demolish") {
    if (!demolishTarget) return { used: false, message: "No structure in range", vfx: [] };
    return {
      used: true,
      vfx: [{ key: "vfx-astra-q_slash_arc", x: demolishTarget.x, y: demolishTarget.y - 42, scale: 1.05 }],
      buildingDamage: {
        building: demolishTarget,
        damage: 260,
      },
    };
  }

  return { used: false, message: `${itemId} has no active`, vfx: [] };
};
