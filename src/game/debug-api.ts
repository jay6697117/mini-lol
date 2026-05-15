import { WORLD_HEIGHT, WORLD_WIDTH, type ItemId } from "./data/game-config";
import { clearUnitCommands } from "./simulation/commands";
import { lastHitWindowForUnit, type LastHitWindow } from "./simulation/last-hit";
import { clamp } from "./simulation/rules";
import type { Building, Point, TowerAggroState, Unit } from "./simulation/types";
import { clearUnitCrowdControlEffects } from "./simulation/unit-lifecycle";
import type { Team } from "./assets";
import type { CooldownSnapshot, GameSnapshot, SkillKey, UnitKind } from "./types";

type LaneDebugFixture = "azure_freeze" | "crimson_freeze" | "enemy_minion_pressure" | "enemy_siege_demolish" | "reset";
type LastHitTeachingFixture = "last_hit" | "tower_setup";

export interface MobaDebugAdapter {
  units: Unit[];
  buildings: Building[];
  towerHeroAggro: TowerAggroState;
  playerCooldowns: CooldownSnapshot;
  activeCastSkill: SkillKey | null;
  pendingSkill: SkillKey | null;
  scoreboardOpen: boolean;
  message: string;
  pointerWorld: Point;
  step: (dt: number) => void;
  snapshot: () => GameSnapshot;
  syncViews: () => void;
  getPlayer: () => Unit;
  getBuilding: (id: string) => Building;
  applyBuildingDamage: (building: Building, amount: number) => void;
  buyItem: (itemId: ItemId) => boolean;
  itemSlotAction: (itemId: ItemId) => boolean;
  useItem: (itemId: ItemId) => boolean;
  useItemSlot: (slot: number) => boolean;
  toggleShop: () => boolean;
  setShopOpen: (open: boolean) => boolean;
  toggleSettings: () => boolean;
  setSettingsOpen: (open: boolean) => boolean;
  setQuickCast: (enabled: boolean) => boolean;
  setRangeIndicators: (enabled: boolean) => boolean;
  setCameraZoom: (zoom: number) => number;
  getCameraZoom: () => number;
  clearQueuedSkill: () => void;
  activatePlayerSkill: (skill: SkillKey) => boolean;
  castPlayerSkill: (skill: SkillKey) => boolean;
  tryUpgradeSkill: (skill: SkillKey) => boolean;
  startRecall: (unit: Unit) => boolean;
  damageUnit: (target: Unit, amount: number, sourceTeam: Team, sourceId?: string) => void;
  spawnWave: () => void;
  setEnemyGold: (gold: number) => number;
  grantEnemyItem: (itemId: ItemId) => boolean;
  makeMinion: (assetId: string, team: Team, kind: Exclude<UnitKind, "hero">, x: number, y: number) => Unit;
  createUnitView: (unit: Unit) => void;
}

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    render_game_to_text?: () => string;
    miniLolDebug?: {
      snapshot: () => GameSnapshot;
      destroyEnemyTower: () => void;
      damageEnemyCore: (damage?: number) => void;
      damagePlayerCore: (damage?: number) => void;
      damageEnemyInhibitor: (damage?: number) => void;
      damagePlayerInhibitor: (damage?: number) => void;
      levelPlayerTo6: () => void;
      buyItem: (itemId: ItemId) => boolean;
      itemSlotAction: (itemId: ItemId) => boolean;
      useItem: (itemId: ItemId) => boolean;
      useItemSlot: (slot: number) => boolean;
      toggleShop: () => boolean;
      setShopOpen: (open: boolean) => boolean;
      toggleSettings: () => boolean;
      setSettingsOpen: (open: boolean) => boolean;
      setQuickCast: (enabled: boolean) => boolean;
      setRangeIndicators: (enabled: boolean) => boolean;
      setCameraZoom: (zoom: number) => number;
      getCameraZoom: () => number;
      setScoreboardOpen: (open: boolean) => boolean;
      resetPlayerCooldowns: () => void;
      clearStatusEffects: () => void;
      clearLaneUnits: () => void;
      resetTowerState: () => void;
      spawnTestMinion: (team: Team, kind: Exclude<UnitKind, "hero">, x: number, y: number) => string;
      damagePlayerFromEnemy: (amount?: number) => void;
      activateSkill: (skill: SkillKey) => boolean;
      castSkill: (skill: SkillKey) => boolean;
      upgradeSkill: (skill: SkillKey) => boolean;
      startRecall: () => boolean;
      injurePlayer: (hp: number, mana?: number) => void;
      injureEnemyHero: (hp: number) => void;
      killPlayer: () => void;
      setPlayerGold: (gold: number) => void;
      setEnemyGold: (gold: number) => number;
      grantEnemyItem: (itemId: ItemId) => boolean;
      forceWave: () => number;
      setPlayerPosition: (x: number, y: number) => void;
      setEnemyHeroPosition: (x: number, y: number) => void;
      setPointerWorld: (x: number, y: number) => void;
      setLaneFixture: (fixture: LaneDebugFixture) => string;
      setLastHitTeachingFixture: (fixture: LastHitTeachingFixture) => LastHitWindow;
      secureLastHitTarget: () => boolean;
      spawnLastHitTarget: () => string;
      spawnEnemyLastHitTarget: () => string;
      triggerVictory: () => void;
      triggerDefeat: () => void;
    };
  }
}

export const installMobaDebugApi = (scene: MobaDebugAdapter) => {
  window.advanceTime = (ms: number) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) scene.step(1 / 60);
  };

  window.render_game_to_text = () => JSON.stringify(scene.snapshot());
  window.miniLolDebug = {
    snapshot: () => scene.snapshot(),
    destroyEnemyTower: () => {
      scene.getBuilding("crimson_outer_tower").hp = 0;
      scene.message = "Crimson tower destroyed";
      scene.syncViews();
    },
    damageEnemyCore: (damage = 900) => {
      scene.applyBuildingDamage(scene.getBuilding("crimson_core"), damage);
      scene.syncViews();
    },
    damagePlayerCore: (damage = 900) => {
      scene.applyBuildingDamage(scene.getBuilding("azure_core"), damage);
      scene.syncViews();
    },
    damageEnemyInhibitor: (damage = 900) => {
      scene.applyBuildingDamage(scene.getBuilding("crimson_inhibitor"), damage);
      scene.syncViews();
    },
    damagePlayerInhibitor: (damage = 900) => {
      scene.applyBuildingDamage(scene.getBuilding("azure_inhibitor"), damage);
      scene.syncViews();
    },
    levelPlayerTo6: () => {
      const player = scene.getPlayer();
      player.level = 6;
      player.xp = 0;
      player.skillLevels.r = Math.max(1, player.skillLevels.r);
      player.skillPoints = Math.max(0, player.skillPoints + 1);
      scene.message = "风雪刀客已达到 6 级";
      scene.syncViews();
    },
    buyItem: (itemId) => {
      const purchased = scene.buyItem(itemId);
      scene.syncViews();
      return purchased;
    },
    itemSlotAction: (itemId) => {
      const acted = scene.itemSlotAction(itemId);
      scene.syncViews();
      return acted;
    },
    useItem: (itemId) => {
      const used = scene.useItem(itemId);
      scene.syncViews();
      return used;
    },
    useItemSlot: (slot) => {
      const used = scene.useItemSlot(slot);
      scene.syncViews();
      return used;
    },
    toggleShop: () => {
      const open = scene.toggleShop();
      scene.syncViews();
      return open;
    },
    setShopOpen: (open) => {
      const changed = scene.setShopOpen(open);
      scene.syncViews();
      return changed;
    },
    toggleSettings: () => {
      const open = scene.toggleSettings();
      scene.syncViews();
      return open;
    },
    setSettingsOpen: (open) => {
      const changed = scene.setSettingsOpen(open);
      scene.syncViews();
      return changed;
    },
    setQuickCast: (enabled) => {
      const current = scene.setQuickCast(enabled);
      scene.syncViews();
      return current;
    },
    setRangeIndicators: (enabled) => {
      const current = scene.setRangeIndicators(enabled);
      scene.syncViews();
      return current;
    },
    setCameraZoom: (zoom) => scene.setCameraZoom(zoom),
    getCameraZoom: () => scene.getCameraZoom(),
    setScoreboardOpen: (open) => {
      scene.scoreboardOpen = open;
      scene.syncViews();
      return scene.scoreboardOpen;
    },
    resetPlayerCooldowns: () => {
      const player = scene.getPlayer();
      scene.playerCooldowns = { q: 0, w: 0, e: 0, r: 0 };
      if (player.action === "cast") {
        player.action = "idle";
        player.actionTimer = 0;
      }
      scene.activeCastSkill = null;
      scene.pendingSkill = null;
      scene.clearQueuedSkill();
      scene.syncViews();
    },
    clearStatusEffects: () => {
      for (const unit of scene.units) {
        clearUnitCrowdControlEffects(unit);
      }
      scene.syncViews();
    },
    clearLaneUnits: () => {
      scene.units = scene.units.filter((unit) => unit.kind === "hero");
      resetTowerState(scene);
      scene.syncViews();
    },
    resetTowerState: () => {
      resetTowerState(scene);
      scene.syncViews();
    },
    spawnTestMinion: (team, kind, x, y) => {
      const assetId = `${team}_${kind}_minion`;
      const minion = scene.makeMinion(assetId, team, kind, clamp(x, 80, WORLD_WIDTH - 80), clamp(y, 90, WORLD_HEIGHT - 90));
      minion.attackTimer = 0;
      scene.units.push(minion);
      scene.createUnitView(minion);
      scene.syncViews();
      return minion.id;
    },
    damagePlayerFromEnemy: (amount = 20) => {
      const player = scene.getPlayer();
      scene.damageUnit(player, amount, "crimson", "enemy_hero");
      scene.syncViews();
    },
    activateSkill: (skill) => {
      const activated = scene.activatePlayerSkill(skill);
      scene.syncViews();
      return activated;
    },
    castSkill: (skill) => {
      const cast = scene.castPlayerSkill(skill);
      scene.syncViews();
      return cast;
    },
    upgradeSkill: (skill) => {
      const upgraded = scene.tryUpgradeSkill(skill);
      scene.syncViews();
      return upgraded;
    },
    startRecall: () => {
      const started = scene.startRecall(scene.getPlayer());
      scene.syncViews();
      return started;
    },
    injurePlayer: (hp, mana) => {
      const player = scene.getPlayer();
      player.hp = clamp(hp, 1, player.maxHp);
      if (typeof mana === "number") player.mana = clamp(mana, 0, player.maxMana);
      scene.syncViews();
    },
    injureEnemyHero: (hp) => {
      const enemy = scene.units.find((unit) => unit.id === "enemy_hero");
      if (!enemy) return;
      enemy.hp = clamp(hp, 1, enemy.maxHp);
      scene.syncViews();
    },
    killPlayer: () => {
      const player = scene.getPlayer();
      scene.damageUnit(player, player.hp + player.shield + 999, "crimson", "enemy_hero");
      scene.syncViews();
    },
    setPlayerGold: (gold) => {
      const player = scene.getPlayer();
      player.gold = Math.max(0, Math.floor(gold));
      scene.syncViews();
    },
    setEnemyGold: (gold) => {
      const value = scene.setEnemyGold(gold);
      scene.syncViews();
      return value;
    },
    grantEnemyItem: (itemId) => {
      const granted = scene.grantEnemyItem(itemId);
      scene.syncViews();
      return granted;
    },
    forceWave: () => {
      scene.spawnWave();
      scene.syncViews();
      return scene.snapshot().lane.waveNumber;
    },
    setPlayerPosition: (x, y) => {
      const player = scene.getPlayer();
      player.x = clamp(x, 80, WORLD_WIDTH - 80);
      player.y = clamp(y, 90, WORLD_HEIGHT - 90);
      clearUnitCommands(player);
      scene.syncViews();
    },
    setEnemyHeroPosition: (x, y) => {
      const enemy = scene.units.find((unit) => unit.id === "enemy_hero");
      if (!enemy) return;
      enemy.x = clamp(x, 80, WORLD_WIDTH - 80);
      enemy.y = clamp(y, 90, WORLD_HEIGHT - 90);
      enemy.targetPoint = undefined;
      scene.syncViews();
    },
    setPointerWorld: (x, y) => {
      scene.pointerWorld = {
        x: clamp(x, 80, WORLD_WIDTH - 80),
        y: clamp(y, 90, WORLD_HEIGHT - 90),
      };
      scene.syncViews();
    },
    setLaneFixture: (fixture) => {
      scene.units = scene.units.filter((unit) => unit.kind === "hero");
      let laneMinions: Unit[];
      if (fixture === "reset") {
        laneMinions = [
          scene.makeMinion("azure_melee_minion", "azure", "melee", 805, 455),
          scene.makeMinion("crimson_melee_minion", "crimson", "melee", 830, 445),
        ];
      } else if (fixture === "azure_freeze") {
        laneMinions = [
          scene.makeMinion("azure_melee_minion", "azure", "melee", 600, 535),
          scene.makeMinion("crimson_melee_minion", "crimson", "melee", 635, 520),
          scene.makeMinion("crimson_caster_minion", "crimson", "caster", 655, 512),
        ];
      } else if (fixture === "enemy_minion_pressure") {
        const player = scene.getPlayer();
        const enemy = scene.units.find((unit) => unit.id === "enemy_hero");
        player.x = 1000;
        player.y = 430;
        clearUnitCommands(player);
        if (enemy) {
          enemy.x = 880;
          enemy.y = 430;
          enemy.hp = Math.round(enemy.maxHp * 0.52);
          enemy.targetPoint = undefined;
        }
        laneMinions = [
          scene.makeMinion("azure_melee_minion", "azure", "melee", 810, 455),
          scene.makeMinion("azure_melee_minion", "azure", "melee", 830, 430),
          scene.makeMinion("azure_melee_minion", "azure", "melee", 850, 465),
          scene.makeMinion("azure_caster_minion", "azure", "caster", 870, 445),
          scene.makeMinion("azure_caster_minion", "azure", "caster", 890, 425),
          scene.makeMinion("crimson_melee_minion", "crimson", "melee", 830, 445),
          scene.makeMinion("crimson_melee_minion", "crimson", "melee", 1390, 220),
          scene.makeMinion("crimson_melee_minion", "crimson", "melee", 1370, 245),
          scene.makeMinion("crimson_caster_minion", "crimson", "caster", 1350, 265),
          scene.makeMinion("crimson_caster_minion", "crimson", "caster", 1330, 290),
        ];
      } else if (fixture === "enemy_siege_demolish") {
        const player = scene.getPlayer();
        const enemy = scene.units.find((unit) => unit.id === "enemy_hero");
        player.x = 980;
        player.y = 420;
        clearUnitCommands(player);
        if (enemy) {
          enemy.x = 620;
          enemy.y = 560;
          enemy.hp = enemy.maxHp;
          enemy.targetPoint = undefined;
        }
        laneMinions = [
          scene.makeMinion("crimson_melee_minion", "crimson", "melee", 490, 585),
          scene.makeMinion("crimson_caster_minion", "crimson", "caster", 520, 560),
        ];
      } else {
        laneMinions = [
          scene.makeMinion("azure_melee_minion", "azure", "melee", 1020, 360),
          scene.makeMinion("azure_caster_minion", "azure", "caster", 1040, 350),
          scene.makeMinion("crimson_melee_minion", "crimson", "melee", 980, 380),
        ];
      }
      scene.units.push(...laneMinions);
      scene.message =
        fixture === "reset"
          ? "Lane fixture: Wave reset"
          : fixture === "azure_freeze"
          ? "Lane fixture: Azure freeze"
          : fixture === "enemy_minion_pressure"
          ? "Lane fixture: Enemy minion pressure"
          : fixture === "enemy_siege_demolish"
          ? "Lane fixture: Enemy siege demolish"
          : "Lane fixture: Crimson freeze";
      scene.syncViews();
      return scene.snapshot().lane.pressure;
    },
    setLastHitTeachingFixture: (fixture) => {
      const player = scene.getPlayer();
      const tower = scene.getBuilding("azure_outer_tower");
      player.x = 485;
      player.y = 565;
      clearUnitCommands(player);
      scene.units = scene.units.filter((unit) => unit.kind === "hero");
      const target = scene.makeMinion("crimson_melee_minion", "crimson", "melee", tower.x + 132, tower.y - 42);
      target.hp = fixture === "last_hit" ? 90 : 250;
      target.maxHp = 320;
      target.speed = 0;
      target.action = "idle";
      tower.attackTimer = 0;
      scene.units.push(target);
      scene.message = fixture === "last_hit" ? "Last-hit fixture" : "Tower setup fixture";
      scene.syncViews();
      return lastHitWindowForUnit({ unit: target, player, buildings: [tower] });
    },
    secureLastHitTarget: () => {
      const player = scene.getPlayer();
      const target = scene.units.find((unit) => unit.alive && unit.team !== player.team && unit.kind !== "hero" && unit.hp <= player.attackDamage);
      if (!target) return false;
      scene.damageUnit(target, target.hp + target.shield + 999, player.team, player.id);
      scene.syncViews();
      return true;
    },
    spawnLastHitTarget: () => {
      const player = scene.getPlayer();
      const target = scene.makeMinion("crimson_melee_minion", "crimson", "melee", player.x + 82, player.y - 28);
      target.hp = 28;
      target.maxHp = 320;
      scene.units.push(target);
      scene.createUnitView(target);
      scene.syncViews();
      return target.id;
    },
    spawnEnemyLastHitTarget: () => {
      const enemy = scene.units.find((unit) => unit.id === "enemy_hero");
      if (!enemy) return "";
      const target = scene.makeMinion("azure_melee_minion", "azure", "melee", enemy.x - 76, enemy.y + 18);
      target.hp = 32;
      target.maxHp = 320;
      scene.units.push(target);
      scene.createUnitView(target);
      scene.syncViews();
      return target.id;
    },
    triggerVictory: () => {
      scene.getBuilding("crimson_outer_tower").hp = 0;
      scene.getBuilding("crimson_inhibitor").hp = 0;
      scene.applyBuildingDamage(scene.getBuilding("crimson_core"), 9999);
      scene.syncViews();
    },
    triggerDefeat: () => {
      scene.getBuilding("azure_outer_tower").hp = 0;
      scene.getBuilding("azure_inhibitor").hp = 0;
      scene.applyBuildingDamage(scene.getBuilding("azure_core"), 9999);
      scene.syncViews();
    },
  };
};

const resetTowerState = (scene: Pick<MobaDebugAdapter, "buildings" | "towerHeroAggro">) => {
  for (const building of scene.buildings) {
    building.attackTimer = 0;
    building.attackFlash = 0;
    building.targetUnitId = undefined;
    building.championTargetId = undefined;
    building.championShotStacks = 0;
  }
  delete scene.towerHeroAggro.azure;
  delete scene.towerHeroAggro.crimson;
};
