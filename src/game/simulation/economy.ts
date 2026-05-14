import { ACTIVE_ITEM_IDS, GOLD_REWARDS, ITEM_CATALOG, LEVEL_XP_REQUIREMENTS, type ItemId, XP_REWARDS } from "../data/game-config";
import type { UnitKind } from "../types";
import { clamp } from "./rules";
import type { Unit } from "./types";

export interface ExperienceGainResult {
  xpGained: number;
  levelsGained: number;
  finalLevel: number;
}

export interface GoldGainResult {
  goldGained: number;
  lastHitIncrement: number;
  message: string;
}

export interface EnemyEconomyDelta {
  goldGained: number;
  xpGained: number;
  lastHitIncrement: number;
}

export interface PurchaseItemInput {
  player: Unit;
  itemId: ItemId;
  purchasedItems: Set<string>;
  shopAvailable: boolean;
}

export interface PurchaseItemResult {
  purchased: boolean;
  message: string;
}

export const applyPlayerExperienceGain = (player: Unit, targetKind: UnitKind): ExperienceGainResult => {
  if (!player.alive) return { xpGained: 0, levelsGained: 0, finalLevel: player.level };

  const xpGained = XP_REWARDS[targetKind];
  let levelsGained = 0;
  player.xp += xpGained;

  while (player.level < 6 && player.xp >= LEVEL_XP_REQUIREMENTS[player.level]) {
    player.xp -= LEVEL_XP_REQUIREMENTS[player.level];
    player.level += 1;
    player.skillPoints += 1;
    player.maxHp += 55;
    player.hp = Math.min(player.maxHp, player.hp + 55);
    player.attackDamage += 6;
    if (player.level === 6) player.skillLevels.r = Math.max(1, player.skillLevels.r);
    levelsGained += 1;
  }

  return { xpGained, levelsGained, finalLevel: player.level };
};

export const applyPlayerLastHitGold = (player: Unit, targetKind: UnitKind): GoldGainResult => {
  const goldGained = GOLD_REWARDS[targetKind];
  const lastHitIncrement = targetKind === "hero" ? 0 : 1;
  player.gold += goldGained;
  return {
    goldGained,
    lastHitIncrement,
    message: targetKind === "hero" ? `Champion takedown +${goldGained}g` : `Last hit +${goldGained}g`,
  };
};

export const enemyLastHitEconomyDelta = (target: Unit, sourceId?: string): EnemyEconomyDelta => {
  if (sourceId !== "enemy_hero" || target.team !== "azure") {
    return { goldGained: 0, xpGained: 0, lastHitIncrement: 0 };
  }

  return {
    goldGained: GOLD_REWARDS[target.kind],
    xpGained: XP_REWARDS[target.kind],
    lastHitIncrement: target.kind === "hero" ? 0 : 1,
  };
};

export const tryPurchaseCatalogItem = ({ player, itemId, purchasedItems, shopAvailable }: PurchaseItemInput): PurchaseItemResult => {
  const item = ITEM_CATALOG[itemId];
  if (!player.alive) return { purchased: false, message: "Cannot shop while dead" };
  if (purchasedItems.has(itemId)) return { purchased: false, message: "Item already owned" };
  if (!shopAvailable) return { purchased: false, message: "Shop is only available in base" };
  if (player.gold < item.cost) return { purchased: false, message: "Not enough gold" };

  player.gold -= item.cost;
  player.attackDamage += item.attackDamage;
  player.speed += item.moveSpeed;
  player.maxHp += item.maxHp;
  player.hp += item.maxHp;
  player.maxMana += item.maxMana;
  player.mana += item.maxMana;
  player.cooldownReduction = clamp(player.cooldownReduction + item.cooldownReduction, 0, 0.35);
  purchasedItems.add(itemId);

  return { purchased: true, message: `Purchased ${itemId.split("_").join(" ")}` };
};

export const itemIdForActiveSlot = (slot: number) => ACTIVE_ITEM_IDS.find((id) => ITEM_CATALOG[id].slot === slot) ?? null;
