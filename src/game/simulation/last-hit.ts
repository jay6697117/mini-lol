import { PLAYER_XP_SHARE_RANGE } from "../data/game-config";
import type { LastHitHintSnapshot, LastHitHintWindow } from "../types";
import { distance } from "./rules";
import { isUnitInTowerAttackRange } from "./towers";
import type { Building, Unit } from "./types";

export type LastHitWindow = "none" | LastHitHintWindow;

interface LastHitWindowInput {
  unit: Unit;
  player: Unit;
  buildings: Building[];
}

interface LastHitPlan {
  window: LastHitWindow;
  towerShotsToLastHit: number;
  hpAfterTowerShots: number;
}

export const lastHitPlanForUnit = ({ unit, player, buildings }: LastHitWindowInput): LastHitPlan => {
  if (!player.alive || !unit.alive || unit.kind === "hero" || unit.team === player.team) return noLastHitPlan(unit);
  if (distance(player, unit) > PLAYER_XP_SHARE_RANGE) return noLastHitPlan(unit);
  if (unit.hp <= player.attackDamage) {
    return { window: "last_hit", towerShotsToLastHit: 0, hpAfterTowerShots: Math.max(0, Math.round(unit.hp)) };
  }
  const alliedTower = buildings.find(
    (building) => building.type === "tower" && building.team === player.team && building.hp > 0 && isUnitInTowerAttackRange(unit, building),
  );
  if (!alliedTower) return noLastHitPlan(unit);
  const towerShotsToLastHit = Math.ceil((unit.hp - player.attackDamage) / alliedTower.attackDamage);
  const hpAfterTowerShots = Math.round(unit.hp - towerShotsToLastHit * alliedTower.attackDamage);
  if (towerShotsToLastHit > 0 && hpAfterTowerShots > 0 && hpAfterTowerShots <= player.attackDamage) {
    return { window: "tower_setup", towerShotsToLastHit, hpAfterTowerShots };
  }
  return noLastHitPlan(unit);
};

export const lastHitWindowForUnit = (input: LastHitWindowInput): LastHitWindow => lastHitPlanForUnit(input).window;

export const lastHitHintForUnit = (input: LastHitWindowInput): LastHitHintSnapshot | null => {
  const plan = lastHitPlanForUnit(input);
  if (plan.window === "none") return null;
  return {
    window: plan.window,
    towerShotsToLastHit: plan.towerShotsToLastHit,
    hpAfterTowerShots: plan.hpAfterTowerShots,
  };
};

export const shouldShowMissedCs = ({ unit, player, buildings }: LastHitWindowInput) => lastHitWindowForUnit({ unit, player, buildings }) !== "none";

const noLastHitPlan = (unit: Unit): LastHitPlan => ({
  window: "none",
  towerShotsToLastHit: 0,
  hpAfterTowerShots: Math.max(0, Math.round(unit.hp)),
});
