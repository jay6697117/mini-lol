import type { GameResult } from "../types";

export interface ModalState {
  shopOpen: boolean;
  settingsOpen: boolean;
  scoreboardOpen?: boolean;
}

export interface ShopAvailability {
  playerAlive: boolean;
  playerInShop: boolean;
}

export interface ShopAutoCloseInput extends ShopAvailability {
  shopOpen: boolean;
  result: GameResult;
}

export interface ShopAutoCloseTransition {
  shopOpen: boolean;
  message: string | null;
}

export interface ModalTransition {
  shopOpen: boolean;
  settingsOpen: boolean;
  success: boolean;
  message: string;
  cancelPendingSkill: boolean;
  clearQueuedSkill: boolean;
}

export type EscapeKeyAction = "clearQueuedSkill" | "cancelPendingSkill" | "closeShop" | "closeSettings" | "openSettings";

export const isAnyModalOpen = (state: ModalState) => Boolean(state.shopOpen || state.settingsOpen || state.scoreboardOpen);

export const resolveEscapeKeyAction = (input: {
  hasQueuedSkill: boolean;
  hasPendingSkill: boolean;
  shopOpen: boolean;
  settingsOpen: boolean;
}): EscapeKeyAction => {
  if (input.hasQueuedSkill) return "clearQueuedSkill";
  if (input.hasPendingSkill) return "cancelPendingSkill";
  if (input.shopOpen) return "closeShop";
  if (input.settingsOpen) return "closeSettings";
  return "openSettings";
};

export const resolveShopTransition = (state: ModalState, open: boolean, availability: ShopAvailability): ModalTransition => {
  if (!open) {
    return {
      shopOpen: false,
      settingsOpen: state.settingsOpen,
      success: true,
      message: "Shop closed",
      cancelPendingSkill: false,
      clearQueuedSkill: false,
    };
  }

  if (!availability.playerAlive) {
    return {
      shopOpen: false,
      settingsOpen: state.settingsOpen,
      success: false,
      message: "Cannot shop while dead",
      cancelPendingSkill: false,
      clearQueuedSkill: false,
    };
  }

  if (!availability.playerInShop) {
    return {
      shopOpen: false,
      settingsOpen: state.settingsOpen,
      success: false,
      message: "Shop is only available in base",
      cancelPendingSkill: false,
      clearQueuedSkill: false,
    };
  }

  return {
    shopOpen: true,
    settingsOpen: false,
    success: true,
    message: "Shop opened",
    cancelPendingSkill: true,
    clearQueuedSkill: true,
  };
};

export const resolveSettingsTransition = (state: ModalState, open: boolean): ModalTransition => ({
  shopOpen: open ? false : state.shopOpen,
  settingsOpen: open,
  success: open,
  message: open ? "Settings opened" : "Settings closed",
  cancelPendingSkill: open,
  clearQueuedSkill: open,
});

export const resolveShopAutoClose = (input: ShopAutoCloseInput): ShopAutoCloseTransition => {
  if (!input.shopOpen || (input.result === "playing" && input.playerAlive && input.playerInShop)) {
    return { shopOpen: input.shopOpen, message: null };
  }

  return {
    shopOpen: false,
    message: input.result === "playing" && input.playerAlive ? "Shop closed" : null,
  };
};
