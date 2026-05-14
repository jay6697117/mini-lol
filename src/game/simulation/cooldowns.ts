import type { ItemId } from "../data/game-config";
import type { CooldownSnapshot, SkillKey } from "../types";

export const tickSkillCooldowns = (cooldowns: CooldownSnapshot, dt: number) => {
  for (const key of Object.keys(cooldowns) as SkillKey[]) {
    cooldowns[key] = Math.max(0, cooldowns[key] - dt);
  }
};

export const tickItemCooldowns = (cooldowns: Record<ItemId, number>, dt: number) => {
  for (const itemId of Object.keys(cooldowns) as ItemId[]) {
    cooldowns[itemId] = Math.max(0, cooldowns[itemId] - dt);
  }
};
