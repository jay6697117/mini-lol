import type { ItemId } from "./data/game-config";
import type { Unit } from "./simulation/types";
import type { GameSnapshot, SkillKey } from "./types";

export type GameCommand =
  | { type: "itemSlotAction"; itemId: ItemId }
  | { type: "buyItem"; itemId: ItemId }
  | { type: "toggleShop" }
  | { type: "setShopOpen"; open: boolean }
  | { type: "setScoreboardOpen"; open: boolean }
  | { type: "toggleSettings" }
  | { type: "setSettingsOpen"; open: boolean }
  | { type: "toggleQuickCast" }
  | { type: "toggleRangeIndicators" }
  | { type: "upgradeSkill"; skill: SkillKey }
  | { type: "startRecall" }
  | { type: "castSkill"; skill: SkillKey };

export interface GameCommandAdapter {
  scoreboardOpen: boolean;
  snapshot: () => GameSnapshot;
  syncViews: () => void;
  getPlayer: () => Unit;
  buyItem: (itemId: ItemId) => boolean;
  itemSlotAction: (itemId: ItemId) => boolean;
  toggleShop: () => boolean;
  setShopOpen: (open: boolean) => boolean;
  toggleSettings: () => boolean;
  setSettingsOpen: (open: boolean) => boolean;
  setQuickCast: (enabled: boolean) => boolean;
  setRangeIndicators: (enabled: boolean) => boolean;
  tryUpgradeSkill: (skill: SkillKey) => boolean;
  startRecall: (unit: Unit) => boolean;
  castPlayerSkill: (skill: SkillKey) => boolean;
}

declare global {
  interface Window {
    miniLolCommands?: {
      dispatch: (command: GameCommand) => boolean;
    };
  }
}

export const installGameCommandDispatcher = (scene: GameCommandAdapter) => {
  window.miniLolCommands = {
    dispatch: (command) => {
      const handled = dispatchSceneCommand(scene, command);
      scene.syncViews();
      return handled;
    },
  };
};

export const dispatchGameCommand = (command: GameCommand) => window.miniLolCommands?.dispatch(command) ?? false;

const dispatchSceneCommand = (scene: GameCommandAdapter, command: GameCommand) => {
  if (command.type === "itemSlotAction") return scene.itemSlotAction(command.itemId);
  if (command.type === "buyItem") return scene.buyItem(command.itemId);
  if (command.type === "toggleShop") return scene.toggleShop();
  if (command.type === "setShopOpen") return scene.setShopOpen(command.open);
  if (command.type === "setScoreboardOpen") {
    scene.scoreboardOpen = command.open;
    return true;
  }
  if (command.type === "toggleSettings") return scene.toggleSettings();
  if (command.type === "setSettingsOpen") return scene.setSettingsOpen(command.open);
  if (command.type === "toggleQuickCast") return scene.setQuickCast(!scene.snapshot().settings.quickCast);
  if (command.type === "toggleRangeIndicators") return scene.setRangeIndicators(!scene.snapshot().settings.showRangeIndicators);
  if (command.type === "upgradeSkill") return scene.tryUpgradeSkill(command.skill);
  if (command.type === "startRecall") return scene.startRecall(scene.getPlayer());
  if (command.type === "castSkill") return scene.castPlayerSkill(command.skill);
  return false;
};
