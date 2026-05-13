import Phaser from "phaser";
import {
  BUILDING_ASSETS,
  DIRECTIONS,
  type Direction,
  type Team,
  type UnitAction,
  UNIT_ASSETS,
  VFX_ASSETS,
} from "./assets";
import {
  ACTIVE_ITEM_IDS,
  AZURE_BASE,
  BASE_HEALTH_REGEN_PER_SECOND,
  BASE_MANA_REGEN_PER_SECOND,
  BASE_REGEN_RADIUS,
  BASIC_ATTACK_WINDUP,
  CAST_QUEUE_WINDOW,
  CRIMSON_BASE,
  ENEMY_START,
  GOLD_REWARDS,
  ITEM_CATALOG,
  type ActiveItemKind,
  type ItemId,
  LANE_END,
  LANE_START,
  LEVEL_XP_REQUIREMENTS,
  MINION_ATTACK_WINDUP,
  PLAYER_START,
  PLAYER_XP_SHARE_RANGE,
  SKILL_CONFIG,
  WAVE_INTERVAL,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  XP_REWARDS,
} from "./data/game-config";
import { decideEnemyHeroAction, findLastHitCandidate as findEnemyLastHitCandidate } from "./simulation/enemy-ai";
import { createBuilding, createHero, createMinion } from "./simulation/factories";
import { buildingState, findNearestAttackableBuilding as findNearestAttackableBuildingRule, isBuildingVulnerable } from "./simulation/objectives";
import { clamp, directionFromVector, distance, maxSkillLevel as configuredMaxSkillLevel, normalize, respawnDurationFor as configuredRespawnDurationFor, skillCooldown as configuredSkillCooldown } from "./simulation/rules";
import { createGameSnapshot, playerInputBlockedReason, unitEffectLabels } from "./simulation/snapshot";
import { createTowerDamageEvent, registerTowerHeroAggro as registerTowerHeroAggroRule, resolveTowerAttacks, tickTowerAggro } from "./simulation/towers";
import type { Building, DamageHitEffects, PendingDamageEvent, Point, TowerAggroState, Unit } from "./simulation/types";
import type { EnemyAiState, GameResult, GameSnapshot, SkillKey, UnitKind } from "./types";
import { updateHud } from "../ui/hud";

interface VfxInstance {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  ttl: number;
}

type KeyMap = Record<
  "up" | "down" | "left" | "right" | "a" | "b" | "p" | "q" | "w" | "e" | "r" | "one" | "two" | "three" | "four" | "space" | "f" | "ctrl" | "tab" | "escape",
  Phaser.Input.Keyboard.Key
>;

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    render_game_to_text?: () => string;
    miniLolDebug?: {
      snapshot: () => GameSnapshot;
      destroyEnemyTower: () => void;
      damageEnemyCore: (damage?: number) => void;
      damagePlayerCore: (damage?: number) => void;
      levelPlayerTo6: () => void;
      buyItem: (itemId: keyof typeof ITEM_CATALOG) => boolean;
      itemSlotAction: (itemId: keyof typeof ITEM_CATALOG) => boolean;
      useItem: (itemId: keyof typeof ITEM_CATALOG) => boolean;
      useItemSlot: (slot: number) => boolean;
      toggleShop: () => boolean;
      setShopOpen: (open: boolean) => boolean;
      toggleSettings: () => boolean;
      setSettingsOpen: (open: boolean) => boolean;
      setQuickCast: (enabled: boolean) => boolean;
      setRangeIndicators: (enabled: boolean) => boolean;
      setScoreboardOpen: (open: boolean) => boolean;
      resetPlayerCooldowns: () => void;
      clearStatusEffects: () => void;
      activateSkill: (skill: SkillKey) => boolean;
      castSkill: (skill: SkillKey) => boolean;
      upgradeSkill: (skill: SkillKey) => boolean;
      startRecall: () => boolean;
      injurePlayer: (hp: number, mana?: number) => void;
      injureEnemyHero: (hp: number) => void;
      killPlayer: () => void;
      setPlayerGold: (gold: number) => void;
      forceWave: () => number;
      setPlayerPosition: (x: number, y: number) => void;
      setEnemyHeroPosition: (x: number, y: number) => void;
      setPointerWorld: (x: number, y: number) => void;
      spawnLastHitTarget: () => string;
      spawnEnemyLastHitTarget: () => string;
      triggerVictory: () => void;
      triggerDefeat: () => void;
    };
  }
}

export class MobaScene extends Phaser.Scene {
  private keys?: KeyMap;
  private units: Unit[] = [];
  private buildings: Building[] = [];
  private unitSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private unitBars = new Map<string, Phaser.GameObjects.Graphics>();
  private buildingSprites = new Map<string, Phaser.GameObjects.Image>();
  private buildingBars = new Map<string, Phaser.GameObjects.Graphics>();
  private aimPreview?: Phaser.GameObjects.Graphics;
  private vfx: VfxInstance[] = [];
  private pendingDamageEvents: PendingDamageEvent[] = [];
  private playerCooldowns = { q: 0, w: 0, e: 0, r: 0 };
  private itemCooldowns: Record<ItemId, number> = {
    bronze_sword: 0,
    plated_boots: 0,
    focus_crystal: 0,
    guard_shield: 0,
    haste_talisman: 0,
    siege_hammer: 0,
  };
  private purchasedItems = new Set<string>();
  private towerHeroAggro: TowerAggroState = {};
  private pointerWorld: Point = { ...ENEMY_START };
  private pendingSkill: SkillKey | null = null;
  private queuedSkill: SkillKey | null = null;
  private queuedSkillAim: Point | null = null;
  private queuedSkillTimer = 0;
  private activeCastSkill: SkillKey | null = null;
  private settingsOpen = false;
  private quickCast = true;
  private showRangeIndicators = true;
  private enemyAiState: EnemyAiState = "Laning";
  private enemySkillCooldown = 1.8;
  private enemyGold = 0;
  private enemyXp = 0;
  private enemyLastHits = 0;
  private playerHeroKills = 0;
  private enemyHeroKills = 0;
  private playerDeaths = 0;
  private enemyDeaths = 0;
  private shopOpen = false;
  private scoreboardOpen = false;
  private elapsed = 0;
  private waveTimer = WAVE_INTERVAL;
  private waveNumber = 0;
  private result: GameResult = "playing";
  private azureKills = 0;
  private crimsonKills = 0;
  private playerLastHits = 0;
  private playerXpGained = 0;
  private message = "Lane phase";
  private sequence = 0;

  constructor() {
    super("MobaScene");
  }

  preload() {
    for (const unit of Object.values(UNIT_ASSETS)) {
      for (const [action, spec] of Object.entries(unit.actions)) {
        if (!spec) continue;
        this.load.spritesheet(this.unitTextureKey(unit.id, action as UnitAction), spec.url, {
          frameWidth: spec.cell,
          frameHeight: spec.cell,
        });
      }
    }

    for (const [buildingId, states] of Object.entries(BUILDING_ASSETS)) {
      for (const [state, url] of Object.entries(states)) {
        this.load.image(this.buildingTextureKey(buildingId, state), url);
      }
    }

    this.load.spritesheet("vfx-astra", VFX_ASSETS.astra_skill_vfx.url, {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.spritesheet("vfx-crimson", VFX_ASSETS.crimson_skill_vfx.url, {
      frameWidth: 128,
      frameHeight: 128,
    });
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#143524");
    this.drawMap();
    this.createAnimations();
    this.createVfxAnimations();
    this.createBuildings();
    this.createInitialUnits();
    this.createAimPreview();
    this.createInput();
    this.cameras.main.startFollow(this.getPlayerSprite(), true, 0.08, 0.08);
    this.cameras.main.setZoom(1);
    this.exposeTestHooks();
    this.syncViews();
  }

  update(_: number, delta: number) {
    this.step(Math.min(delta / 1000, 1 / 20));
  }

  private step(dt: number) {
    if (this.result !== "playing") {
      this.syncViews();
      return;
    }

    this.elapsed += dt;
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.spawnWave();
      this.waveTimer += WAVE_INTERVAL;
    }

    this.updateCooldowns(dt);
    this.updateStatusEffects(dt);
    this.updateQueuedSkill(dt);
    this.updateTowerAggro(dt);
    this.updateBaseRecovery(dt);
    this.updateRecallChannels(dt);
    this.updateShopState();
    this.updatePlayerInput(dt);
    this.updateEnemyHeroAI(dt);
    this.updateUnitAI(dt);
    this.updateBuildings(dt);
    this.resolvePendingDamageEvents();
    this.updateVfx(dt);
    this.resolveDeaths(dt);
    this.syncViews();
  }

  private drawMap() {
    const g = this.add.graphics();
    g.fillStyle(0x163b28, 1);
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    g.fillStyle(0x1f5133, 1);
    g.fillEllipse(760, 455, 1350, 620);

    const lane = [
      { x: 110, y: 710 },
      { x: 240, y: 815 },
      { x: 1510, y: 330 },
      { x: 1380, y: 125 },
    ];
    g.fillStyle(0x837d65, 1);
    g.fillPoints(lane, true);
    g.lineStyle(4, 0xb2aa86, 0.55);
    g.strokePoints(lane, true);

    for (let i = 0; i < 42; i += 1) {
      const t = i / 41;
      const x = Phaser.Math.Linear(LANE_START.x, LANE_END.x, t);
      const y = Phaser.Math.Linear(LANE_START.y, LANE_END.y, t);
      const offset = Math.sin(i * 1.7) * 36;
      g.fillStyle(i % 2 === 0 ? 0x958e74 : 0x746f5c, 0.45);
      g.fillEllipse(x + offset, y - offset * 0.16, 56, 26);
    }

    g.fillStyle(0x224f39, 1);
    g.fillEllipse(190, 700, 250, 170);
    g.fillEllipse(1410, 215, 260, 180);
    g.lineStyle(3, 0x4aa8ff, 0.45);
    g.strokeEllipse(190, 700, 250, 170);
    g.lineStyle(3, 0xff5448, 0.45);
    g.strokeEllipse(1410, 215, 260, 180);

    g.fillStyle(0x0d261c, 0.7);
    g.fillEllipse(150, 390, 340, 210);
    g.fillEllipse(1330, 560, 360, 230);
    g.setDepth(-100);
  }

  private createAnimations() {
    for (const unit of Object.values(UNIT_ASSETS)) {
      for (const direction of DIRECTIONS) {
        const row = DIRECTIONS.indexOf(direction);
        for (const [action, spec] of Object.entries(unit.actions)) {
          if (!spec) continue;
          const typedAction = action as UnitAction;
          const key = this.animationKey(unit.id, typedAction, direction);
          if (this.anims.exists(key)) continue;
          const start = row * spec.columns;
          const end = start + spec.frames - 1;
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(this.unitTextureKey(unit.id, typedAction), { start, end }),
            frameRate: typedAction === "death" ? 8 : typedAction === "hit" ? 10 : 9,
            repeat: typedAction === "idle" || typedAction === "move" ? -1 : 0,
          });
        }
      }
    }
  }

  private createVfxAnimations() {
    for (const [name, row] of Object.entries(VFX_ASSETS.astra_skill_vfx.rows)) {
      this.anims.create({
        key: `vfx-astra-${name}`,
        frames: this.anims.generateFrameNumbers("vfx-astra", { start: row * 6, end: row * 6 + 5 }),
        frameRate: 18,
        repeat: 0,
      });
    }
    for (const [name, row] of Object.entries(VFX_ASSETS.crimson_skill_vfx.rows)) {
      this.anims.create({
        key: `vfx-crimson-${name}`,
        frames: this.anims.generateFrameNumbers("vfx-crimson", { start: row * 6, end: row * 6 + 5 }),
        frameRate: 18,
        repeat: 0,
      });
    }
  }

  private createBuildings() {
    this.buildings = [
      this.makeBuilding("azure_outer_tower", "azure_outer_tower", "azure", "tower", 420, 600),
      this.makeBuilding("crimson_outer_tower", "crimson_outer_tower", "crimson", "tower", 1180, 330),
      this.makeBuilding("azure_core", "azure_core", "azure", "core", 175, 705),
      this.makeBuilding("crimson_core", "crimson_core", "crimson", "core", 1420, 205),
    ];

    for (const building of this.buildings) {
      const sprite = this.add
        .image(building.x, building.y, this.buildingTextureKey(building.assetId, "idle"))
        .setScale(building.type === "tower" ? 0.48 : 0.42)
        .setDepth(building.y - 40);
      const bar = this.add.graphics().setDepth(building.y + 220);
      this.buildingSprites.set(building.id, sprite);
      this.buildingBars.set(building.id, bar);
    }
    this.drawTowerRanges();
  }

  private createAimPreview() {
    this.aimPreview = this.add.graphics().setDepth(8500);
  }

  private createInitialUnits() {
    this.units = [
      this.makeHero("player", "astra_vanguard", "azure", PLAYER_START.x, PLAYER_START.y),
      this.makeHero("enemy_hero", "crimson_duelist", "crimson", ENEMY_START.x, ENEMY_START.y),
    ];
    this.spawnWave();

    for (const unit of this.units) {
      if (!this.unitSprites.has(unit.id)) this.createUnitView(unit);
    }
  }

  private createInput() {
    this.input.mouse?.disableContextMenu();
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      b: Phaser.Input.Keyboard.KeyCodes.B,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      f: Phaser.Input.Keyboard.KeyCodes.F,
      ctrl: Phaser.Input.Keyboard.KeyCodes.CTRL,
      tab: Phaser.Input.Keyboard.KeyCodes.TAB,
      escape: Phaser.Input.Keyboard.KeyCodes.ESC,
    }) as KeyMap;

    keyboard.on("keydown", (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        this.scoreboardOpen = true;
        this.syncViews();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.handleEscapeKey();
        this.syncViews();
        return;
      }
      if (!event.ctrlKey) return;
      const skill = event.key.toLowerCase();
      if (skill !== "q" && skill !== "w" && skill !== "e" && skill !== "r") return;
      event.preventDefault();
      this.tryUpgradeSkill(skill);
    });

    keyboard.on("keyup", (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      this.scoreboardOpen = false;
      this.syncViews();
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.pointerWorld = this.toWorldPoint(pointer);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const player = this.getPlayer();
      const worldPoint = this.toWorldPoint(pointer);
      this.pointerWorld = worldPoint;
      if (this.pendingSkill) {
        if (pointer.leftButtonDown()) this.castPendingSkill(worldPoint);
        else this.cancelPendingSkill();
        this.syncViews();
        return;
      }
      if (!player.alive || this.isModalOpen()) return;
      const targetUnit = this.pickEnemyUnit(worldPoint, player.team);
      if (targetUnit) {
        this.commandAttackUnit(player, targetUnit);
        return;
      }
      const targetBuilding = this.pickEnemyBuilding(worldPoint, player.team);
      if (targetBuilding) {
        this.commandAttackBuilding(player, targetBuilding);
        return;
      }
      this.commandMove(player, worldPoint, Boolean(this.keys?.a.isDown));
    });
  }

  private exposeTestHooks() {
    window.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let i = 0; i < steps; i += 1) this.step(1 / 60);
    };
    window.render_game_to_text = () => JSON.stringify(this.snapshot());
    window.miniLolDebug = {
      snapshot: () => this.snapshot(),
      destroyEnemyTower: () => {
        this.getBuilding("crimson_outer_tower").hp = 0;
        this.message = "Crimson tower destroyed";
        this.syncViews();
      },
      damageEnemyCore: (damage = 900) => {
        this.applyBuildingDamage(this.getBuilding("crimson_core"), damage);
        this.syncViews();
      },
      damagePlayerCore: (damage = 900) => {
        this.applyBuildingDamage(this.getBuilding("azure_core"), damage);
        this.syncViews();
      },
      levelPlayerTo6: () => {
        const player = this.getPlayer();
        player.level = 6;
        player.xp = 0;
        player.skillLevels.r = Math.max(1, player.skillLevels.r);
        player.skillPoints = Math.max(0, player.skillPoints + 1);
        this.message = "Astra reached level 6";
        this.syncViews();
      },
      buyItem: (itemId) => {
        const purchased = this.buyItem(itemId);
        this.syncViews();
        return purchased;
      },
      itemSlotAction: (itemId) => {
        const acted = this.itemSlotAction(itemId);
        this.syncViews();
        return acted;
      },
      useItem: (itemId) => {
        const used = this.useItem(itemId);
        this.syncViews();
        return used;
      },
      useItemSlot: (slot) => {
        const used = this.useItemSlot(slot);
        this.syncViews();
        return used;
      },
      toggleShop: () => {
        const open = this.toggleShop();
        this.syncViews();
        return open;
      },
      setShopOpen: (open) => {
        const changed = this.setShopOpen(open);
        this.syncViews();
        return changed;
      },
      toggleSettings: () => {
        const open = this.toggleSettings();
        this.syncViews();
        return open;
      },
      setSettingsOpen: (open) => {
        const changed = this.setSettingsOpen(open);
        this.syncViews();
        return changed;
      },
      setQuickCast: (enabled) => {
        const current = this.setQuickCast(enabled);
        this.syncViews();
        return current;
      },
      setRangeIndicators: (enabled) => {
        const current = this.setRangeIndicators(enabled);
        this.syncViews();
        return current;
      },
      setScoreboardOpen: (open) => {
        this.scoreboardOpen = open;
        this.syncViews();
        return this.scoreboardOpen;
      },
      resetPlayerCooldowns: () => {
        const player = this.getPlayer();
        this.playerCooldowns = { q: 0, w: 0, e: 0, r: 0 };
        if (player.action === "cast") {
          player.action = "idle";
          player.actionTimer = 0;
        }
        this.activeCastSkill = null;
        this.pendingSkill = null;
        this.clearQueuedSkill();
        this.syncViews();
      },
      clearStatusEffects: () => {
        for (const unit of this.units) {
          unit.slowTimer = 0;
          unit.slowMultiplier = 1;
          unit.rootTimer = 0;
          unit.markTimer = 0;
          unit.hasteTimer = 0;
          unit.hasteMultiplier = 1;
        }
        this.syncViews();
      },
      activateSkill: (skill) => {
        const activated = this.activatePlayerSkill(skill);
        this.syncViews();
        return activated;
      },
      castSkill: (skill) => {
        const cast = this.castPlayerSkill(skill);
        this.syncViews();
        return cast;
      },
      upgradeSkill: (skill) => {
        const upgraded = this.tryUpgradeSkill(skill);
        this.syncViews();
        return upgraded;
      },
      startRecall: () => {
        const started = this.startRecall(this.getPlayer());
        this.syncViews();
        return started;
      },
      injurePlayer: (hp, mana) => {
        const player = this.getPlayer();
        player.hp = clamp(hp, 1, player.maxHp);
        if (typeof mana === "number") player.mana = clamp(mana, 0, player.maxMana);
        this.syncViews();
      },
      injureEnemyHero: (hp) => {
        const enemy = this.units.find((unit) => unit.id === "enemy_hero");
        if (!enemy) return;
        enemy.hp = clamp(hp, 1, enemy.maxHp);
        this.syncViews();
      },
      killPlayer: () => {
        const player = this.getPlayer();
        this.damageUnit(player, player.hp + player.shield + 999, "crimson", "enemy_hero");
        this.syncViews();
      },
      setPlayerGold: (gold) => {
        const player = this.getPlayer();
        player.gold = Math.max(0, Math.floor(gold));
        this.syncViews();
      },
      forceWave: () => {
        this.spawnWave();
        this.syncViews();
        return this.waveNumber;
      },
      setPlayerPosition: (x, y) => {
        const player = this.getPlayer();
        player.x = clamp(x, 80, WORLD_WIDTH - 80);
        player.y = clamp(y, 90, WORLD_HEIGHT - 90);
        this.clearPlayerCommands(player);
        this.syncViews();
      },
      setEnemyHeroPosition: (x, y) => {
        const enemy = this.units.find((unit) => unit.id === "enemy_hero");
        if (!enemy) return;
        enemy.x = clamp(x, 80, WORLD_WIDTH - 80);
        enemy.y = clamp(y, 90, WORLD_HEIGHT - 90);
        enemy.targetPoint = undefined;
        this.syncViews();
      },
      setPointerWorld: (x, y) => {
        this.pointerWorld = {
          x: clamp(x, 80, WORLD_WIDTH - 80),
          y: clamp(y, 90, WORLD_HEIGHT - 90),
        };
        this.syncViews();
      },
      spawnLastHitTarget: () => {
        const player = this.getPlayer();
        const target = this.makeMinion("crimson_melee_minion", "crimson", "melee", player.x + 82, player.y - 28);
        target.hp = 28;
        target.maxHp = 320;
        this.units.push(target);
        this.createUnitView(target);
        this.syncViews();
        return target.id;
      },
      spawnEnemyLastHitTarget: () => {
        const enemy = this.units.find((unit) => unit.id === "enemy_hero");
        if (!enemy) return "";
        const target = this.makeMinion("azure_melee_minion", "azure", "melee", enemy.x - 76, enemy.y + 18);
        target.hp = 32;
        target.maxHp = 320;
        this.units.push(target);
        this.createUnitView(target);
        this.syncViews();
        return target.id;
      },
      triggerVictory: () => {
        this.getBuilding("crimson_outer_tower").hp = 0;
        this.applyBuildingDamage(this.getBuilding("crimson_core"), 9999);
        this.syncViews();
      },
      triggerDefeat: () => {
        this.getBuilding("azure_outer_tower").hp = 0;
        this.applyBuildingDamage(this.getBuilding("azure_core"), 9999);
        this.syncViews();
      },
    };
  }

  private updateCooldowns(dt: number) {
    for (const key of Object.keys(this.playerCooldowns) as Array<keyof typeof this.playerCooldowns>) {
      this.playerCooldowns[key] = Math.max(0, this.playerCooldowns[key] - dt);
    }
    for (const itemId of Object.keys(this.itemCooldowns) as ItemId[]) {
      this.itemCooldowns[itemId] = Math.max(0, this.itemCooldowns[itemId] - dt);
    }
  }

  private updateStatusEffects(dt: number) {
    for (const unit of this.units) {
      unit.attackTimer = Math.max(0, unit.attackTimer - dt);
      unit.actionTimer = Math.max(0, unit.actionTimer - dt);
      unit.slowTimer = Math.max(0, unit.slowTimer - dt);
      unit.rootTimer = Math.max(0, unit.rootTimer - dt);
      unit.markTimer = Math.max(0, unit.markTimer - dt);
      unit.hasteTimer = Math.max(0, unit.hasteTimer - dt);
      unit.shieldTimer = Math.max(0, unit.shieldTimer - dt);
      if (unit.slowTimer <= 0) unit.slowMultiplier = 1;
      if (unit.hasteTimer <= 0) unit.hasteMultiplier = 1;
      if (unit.shieldTimer <= 0) unit.shield = 0;
      if (unit.id === "player" && unit.actionTimer <= 0) this.activeCastSkill = null;
    }
  }

  private updateQueuedSkill(dt: number) {
    if (!this.queuedSkill) return;
    const player = this.getPlayer();
    this.queuedSkillTimer = Math.max(0, this.queuedSkillTimer - dt);
    if (this.result !== "playing" || !player.alive || this.isModalOpen()) {
      this.clearQueuedSkill();
      return;
    }
    if (this.queuedSkillTimer <= 0) {
      this.clearQueuedSkill("Cast buffer expired");
      return;
    }
    if (this.isPlayerCastingLocked(player)) return;
    const skill = this.queuedSkill;
    const aimPoint = this.queuedSkillAim ?? this.pointerWorld;
    this.clearQueuedSkill();
    this.castPlayerSkill(skill, aimPoint, false);
  }

  private updateTowerAggro(dt: number) {
    tickTowerAggro(this.towerHeroAggro, this.units, dt);
  }

  private updateBaseRecovery(dt: number) {
    for (const unit of this.units) {
      if (!unit.alive || unit.kind !== "hero") continue;
      const base = unit.team === "azure" ? AZURE_BASE : CRIMSON_BASE;
      if (distance(unit, base) > BASE_REGEN_RADIUS) continue;
      unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * BASE_HEALTH_REGEN_PER_SECOND * dt);
      unit.mana = Math.min(unit.maxMana, unit.mana + unit.maxMana * BASE_MANA_REGEN_PER_SECOND * dt);
    }
  }

  private updateRecallChannels(dt: number) {
    for (const unit of this.units) {
      if (!unit.alive || unit.recallTimer <= 0) continue;
      unit.recallTimer = Math.max(0, unit.recallTimer - dt);
      unit.action = "cast";
      unit.actionTimer = Math.max(unit.actionTimer, 0.08);
      if (unit.recallTimer > 0) continue;
      const start = unit.team === "azure" ? PLAYER_START : ENEMY_START;
      unit.x = start.x;
      unit.y = start.y;
      unit.hp = unit.maxHp;
      unit.mana = unit.maxMana;
      unit.shield = 0;
      unit.shieldTimer = 0;
      unit.slowTimer = 0;
      unit.slowMultiplier = 1;
      unit.rootTimer = 0;
      unit.markTimer = 0;
      this.clearUnitCommands(unit);
      this.spawnVfx(unit.team === "azure" ? "vfx-astra-w_shield_pulse" : "vfx-crimson-q_spear_thrust", unit.x, unit.y - 10, 1);
      this.message = unit.id === "player" ? "Recall complete" : "Crimson recalled";
    }
  }

  private updateShopState() {
    if (!this.shopOpen) return;
    const player = this.getPlayer();
    if (this.result !== "playing" || !player.alive || !this.isPlayerInShop()) {
      this.shopOpen = false;
      if (this.result === "playing" && player.alive) this.message = "Shop closed";
    }
  }

  private isModalOpen() {
    return this.shopOpen || this.scoreboardOpen || this.settingsOpen;
  }

  private isPlayerCastingLocked(player = this.getPlayer()) {
    return player.action === "cast" && player.actionTimer > 0;
  }

  private clearQueuedSkill(message?: string) {
    this.queuedSkill = null;
    this.queuedSkillAim = null;
    this.queuedSkillTimer = 0;
    if (message) this.message = message;
  }

  private inputBlockedReason(player = this.getPlayer()) {
    return playerInputBlockedReason({
      result: this.result,
      player,
      shopOpen: this.shopOpen,
      scoreboardOpen: this.scoreboardOpen,
      settingsOpen: this.settingsOpen,
      playerCastingLocked: this.isPlayerCastingLocked(player),
    });
  }

  private handleEscapeKey() {
    if (this.queuedSkill) {
      this.clearQueuedSkill("Cast buffer cancelled");
      return;
    }
    if (this.pendingSkill) {
      this.cancelPendingSkill();
      return;
    }
    if (this.shopOpen) {
      this.setShopOpen(false);
      return;
    }
    if (this.settingsOpen) {
      this.setSettingsOpen(false);
      return;
    }
    this.setSettingsOpen(true);
  }

  private toggleShop() {
    return this.setShopOpen(!this.shopOpen);
  }

  private setShopOpen(open: boolean) {
    const player = this.getPlayer();
    if (!open) {
      this.shopOpen = false;
      this.message = "Shop closed";
      return true;
    }
    if (!player.alive) {
      this.shopOpen = false;
      this.message = "Cannot shop while dead";
      return false;
    }
    if (!this.isPlayerInShop()) {
      this.shopOpen = false;
      this.message = "Shop is only available in base";
      return false;
    }
    this.shopOpen = true;
    this.settingsOpen = false;
    this.cancelPendingSkill();
    this.clearQueuedSkill();
    this.message = "Shop opened";
    return true;
  }

  private toggleSettings() {
    return this.setSettingsOpen(!this.settingsOpen);
  }

  private setSettingsOpen(open: boolean) {
    this.settingsOpen = open;
    if (open) {
      this.shopOpen = false;
      this.cancelPendingSkill();
      this.clearQueuedSkill();
    }
    this.message = open ? "Settings opened" : "Settings closed";
    return this.settingsOpen;
  }

  private setQuickCast(enabled: boolean) {
    this.quickCast = enabled;
    if (enabled) this.cancelPendingSkill();
    this.clearQueuedSkill();
    this.message = enabled ? "Quick Cast enabled" : "Normal Cast enabled";
    return this.quickCast;
  }

  private setRangeIndicators(enabled: boolean) {
    this.showRangeIndicators = enabled;
    this.message = enabled ? "Range indicators enabled" : "Range indicators hidden";
    return this.showRangeIndicators;
  }

  private startRecall(unit: Unit) {
    if (!unit.alive || unit.kind !== "hero") return false;
    if (unit.id === "player" && !this.canStartPlayerAction(unit)) return false;
    if (unit.recallTimer > 0) return false;
    const nearestEnemy = this.findNearestEnemyUnit(unit, 260);
    if (nearestEnemy) {
      this.message = "Too close to enemies";
      return false;
    }
    this.clearUnitCommands(unit);
    if (unit.id === "player") this.clearQueuedSkill();
    unit.recallTimer = unit.recallDuration;
    unit.action = "cast";
    unit.actionTimer = 0.4;
    this.spawnVfx(unit.team === "azure" ? "vfx-astra-w_shield_pulse" : "vfx-crimson-q_spear_thrust", unit.x, unit.y - 6, 0.9);
    this.message = unit.id === "player" ? "Recalling" : "Crimson recall";
    return true;
  }

  private cancelRecall(unit: Unit, message?: string) {
    if (unit.recallTimer <= 0) return;
    unit.recallTimer = 0;
    if (message && unit.id === "player") this.message = message;
  }

  private clearUnitCommands(unit: Unit) {
    unit.targetUnitId = undefined;
    unit.targetBuildingId = undefined;
    unit.targetPoint = undefined;
    unit.attackMovePoint = undefined;
  }

  private toWorldPoint(pointer: Phaser.Input.Pointer): Point {
    const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return { x: clamp(worldPoint.x, 80, WORLD_WIDTH - 80), y: clamp(worldPoint.y, 90, WORLD_HEIGHT - 90) };
  }

  private commandMove(player: Unit, point: Point, attackMove: boolean) {
    this.cancelRecall(player, "Recall interrupted");
    player.targetUnitId = undefined;
    player.targetBuildingId = undefined;
    player.targetPoint = point;
    player.attackMovePoint = attackMove ? point : undefined;
    this.message = attackMove ? "Attack move" : "Move command";
  }

  private commandAttackUnit(player: Unit, target: Unit) {
    this.cancelRecall(player, "Recall interrupted");
    player.targetUnitId = target.id;
    player.targetBuildingId = undefined;
    player.targetPoint = undefined;
    player.attackMovePoint = undefined;
    this.message = `${target.kind} targeted`;
  }

  private commandAttackBuilding(player: Unit, building: Building) {
    this.cancelRecall(player, "Recall interrupted");
    player.targetUnitId = undefined;
    player.targetBuildingId = building.id;
    player.targetPoint = undefined;
    player.attackMovePoint = undefined;
    this.message = `${building.id.split("_").join(" ")} targeted`;
  }

  private clearPlayerCommands(player: Unit) {
    this.clearUnitCommands(player);
  }

  private updatePlayerAttackCommands(player: Unit, dt: number) {
    if (player.targetUnitId) {
      const target = this.units.find((unit) => unit.id === player.targetUnitId && unit.alive);
      if (!target) {
        player.targetUnitId = undefined;
        return false;
      }
      const gap = distance(player, target) - player.radius - target.radius;
      if (gap <= player.attackRange + 10) {
        this.tryUnitAttack(player, true, target);
        if (player.actionTimer <= 0) player.action = "idle";
      } else {
        const dir = normalize(target.x - player.x, target.y - player.y);
        this.moveUnit(player, dir.x, dir.y, player.speed, dt);
      }
      return true;
    }

    if (player.targetBuildingId) {
      const building = this.buildings.find((candidate) => candidate.id === player.targetBuildingId && candidate.hp > 0);
      if (!building || !isBuildingVulnerable(building, this.buildings)) {
        player.targetBuildingId = undefined;
        return false;
      }
      const gap = distance(player, building) - player.radius - building.radius;
      if (gap <= player.attackRange + 18) {
        this.attackBuilding(player, building);
        if (player.actionTimer <= 0) player.action = "idle";
      } else {
        const dir = normalize(building.x - player.x, building.y - player.y);
        this.moveUnit(player, dir.x, dir.y, player.speed, dt);
      }
      return true;
    }

    if (player.attackMovePoint) {
      const target = this.findNearestEnemyUnit(player, player.attackRange + 96);
      if (target) {
        this.commandAttackUnit(player, target);
        return true;
      }
    }
    return false;
  }

  private pickEnemyUnit(point: Point, team: Team) {
    return this.units
      .filter((unit) => unit.alive && unit.team !== team && distance(unit, point) <= unit.radius + 22)
      .sort((a, b) => distance(a, point) - distance(b, point))[0];
  }

  private pickEnemyBuilding(point: Point, team: Team) {
    return this.buildings
      .filter((building) => building.hp > 0 && building.team !== team && isBuildingVulnerable(building, this.buildings) && distance(building, point) <= building.radius + 42)
      .sort((a, b) => distance(a, point) - distance(b, point))[0];
  }

  private updatePlayerInput(dt: number) {
    const player = this.getPlayer();
    if (!this.keys) return;
    if (!player.alive) {
      this.cancelPendingSkill();
      this.clearQueuedSkill();
      return;
    }

    if (!this.settingsOpen && Phaser.Input.Keyboard.JustDown(this.keys.p)) this.toggleShop();
    if (this.isModalOpen()) {
      player.action = player.actionTimer > 0 ? player.action : "idle";
      return;
    }

    const axisX = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const axisY = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const ctrlDown = this.keys.ctrl.isDown;
    if (!ctrlDown && Phaser.Input.Keyboard.JustDown(this.keys.q)) this.activatePlayerSkill("q");
    if (!ctrlDown && Phaser.Input.Keyboard.JustDown(this.keys.w)) this.activatePlayerSkill("w");
    if (!ctrlDown && Phaser.Input.Keyboard.JustDown(this.keys.e)) this.activatePlayerSkill("e");
    if (!ctrlDown && Phaser.Input.Keyboard.JustDown(this.keys.r)) this.activatePlayerSkill("r");
    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.useItemSlot(1);
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.useItemSlot(2);
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.useItemSlot(3);
    if (Phaser.Input.Keyboard.JustDown(this.keys.four)) this.useItemSlot(4);
    if (Phaser.Input.Keyboard.JustDown(this.keys.b)) this.startRecall(player);
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) this.tryUnitAttack(player, true);
    if (Phaser.Input.Keyboard.JustDown(this.keys.f)) this.toggleFullscreen();

    if (player.recallTimer > 0 && (axisX !== 0 || axisY !== 0)) this.cancelRecall(player, "Recall interrupted");
    if (this.pendingSkill && (axisX !== 0 || axisY !== 0)) this.cancelPendingSkill();

    if (player.action === "cast" && player.actionTimer > 0) return;

    if (axisX !== 0 || axisY !== 0) {
      const dir = normalize(axisX, axisY);
      this.moveUnit(player, dir.x, dir.y, player.speed, dt);
      this.clearPlayerCommands(player);
      return;
    }

    if (this.updatePlayerAttackCommands(player, dt)) return;

    if (player.targetPoint) {
      const dx = player.targetPoint.x - player.x;
      const dy = player.targetPoint.y - player.y;
      if (Math.hypot(dx, dy) < 8) {
        if (player.attackMovePoint) {
          player.attackMovePoint = undefined;
          player.targetPoint = undefined;
        } else {
          player.targetPoint = undefined;
        }
        player.action = "idle";
      } else {
        const dir = normalize(dx, dy);
        this.moveUnit(player, dir.x, dir.y, player.speed, dt);
      }
    } else if (player.actionTimer <= 0) {
      player.action = "idle";
    }
  }

  private updateEnemyHeroAI(dt: number) {
    const enemy = this.units.find((unit) => unit.id === "enemy_hero");
    if (!enemy || !enemy.alive) return;
    const player = this.getPlayer();
    this.enemySkillCooldown = Math.max(0, this.enemySkillCooldown - dt);

    const decision = decideEnemyHeroAction({
      enemy,
      player,
      enemySkillCooldown: this.enemySkillCooldown,
      canSafelyRecall: !this.findNearestEnemyUnit(enemy, 260),
      lastHitTarget: findEnemyLastHitCandidate(enemy, this.units),
    });
    this.enemyAiState = decision.state;

    if (decision.kind === "recalling") return;
    if (decision.kind === "startRecall") {
      this.startRecall(enemy);
      return;
    }
    if (decision.kind === "harass") {
      this.castEnemyHarass(enemy, player);
      return;
    }
    if (decision.kind === "attackUnit") {
      this.tryUnitAttack(enemy, false, decision.target);
      return;
    }

    const dir = normalize(decision.target.x - enemy.x, decision.target.y - enemy.y);
    this.moveUnit(enemy, dir.x, dir.y, enemy.speed * decision.speedMultiplier, dt);
  }

  private castEnemyHarass(enemy: Unit, player: Unit) {
    this.enemySkillCooldown = 5.4;
    enemy.action = "cast";
    enemy.actionTimer = 0.42;
    enemy.lastDirection = directionFromVector(player.x - enemy.x, player.y - enemy.y);
    this.queueDamageEvent({
      id: `enemy_harass_${this.sequence += 1}`,
      triggerAt: this.elapsed + 0.22,
      sourceTeam: "crimson",
      sourceId: enemy.id,
      kind: "unit",
      targetId: player.id,
      damage: 76,
      buildingDamageMultiplier: 0,
      cancelIfSourceDead: true,
      slow: {
        multiplier: 0.82,
        duration: 0.8,
      },
      vfx: {
        key: "vfx-crimson-q_spear_thrust",
        x: player.x,
        y: player.y - 10,
        scale: 0.9,
      },
    });
    this.message = "Crimson harass";
  }

  private updateUnitAI(dt: number) {
    for (const unit of this.units) {
      if (!unit.alive || unit.kind === "hero") {
        continue;
      }

      const targetUnit = this.findNearestEnemyUnit(unit, unit.attackRange + 24);
      if (targetUnit) {
        this.tryUnitAttack(unit, false, targetUnit);
        continue;
      }

      const targetBuilding = this.findNearestAttackableBuilding(unit, unit.attackRange + 38);
      if (targetBuilding) {
        this.attackBuilding(unit, targetBuilding);
        continue;
      }

      const laneGoal = this.getLaneGoal(unit.team);
      const dir = normalize(laneGoal.x - unit.x, laneGoal.y - unit.y);
      this.moveUnit(unit, dir.x, dir.y, unit.speed, dt);
    }
  }

  private updateBuildings(dt: number) {
    const towerAttacks = resolveTowerAttacks({
      buildings: this.buildings,
      units: this.units,
      towerHeroAggro: this.towerHeroAggro,
      dt,
    });
    for (const attack of towerAttacks) {
      this.queueDamageEvent(createTowerDamageEvent(attack, `tower_${attack.towerId}_${this.sequence += 1}`, this.elapsed));
      this.message = attack.message;
    }
  }

  private updateVfx(dt: number) {
    for (const instance of this.vfx) {
      instance.ttl -= dt;
    }
    const expired = this.vfx.filter((instance) => instance.ttl <= 0);
    for (const instance of expired) {
      instance.sprite.destroy();
    }
    this.vfx = this.vfx.filter((instance) => instance.ttl > 0);
  }

  private queueDamageEvent(event: PendingDamageEvent) {
    this.pendingDamageEvents.push(event);
  }

  private resolvePendingDamageEvents() {
    const due = this.pendingDamageEvents.filter((event) => event.triggerAt <= this.elapsed);
    this.pendingDamageEvents = this.pendingDamageEvents.filter((event) => event.triggerAt > this.elapsed);
    for (const event of due) {
      if (!this.isDamageSourceValid(event)) continue;
      if (event.vfx) this.spawnVfx(event.vfx.key, event.vfx.x, event.vfx.y, event.vfx.scale);
      if (event.kind === "unit" && event.targetId) {
        const target = this.units.find((unit) => unit.id === event.targetId);
        if (target?.alive) {
          this.applyAbilityDamageToUnit(target, event.damage, event.sourceTeam, event.sourceId, {
            slow: event.slow,
            root: event.root,
            mark: event.mark,
            knockback: event.knockback,
            consumeMarkBonus: event.consumeMarkBonus,
            cooldownRefund: event.cooldownRefund,
          });
        }
      } else if (event.kind === "building" && event.buildingId) {
        const building = this.buildings.find((candidate) => candidate.id === event.buildingId);
        if (building) this.applyBuildingDamage(building, event.damage * event.buildingDamageMultiplier);
      } else if (event.kind === "circle" && event.center && event.radius) {
        this.damageEnemiesNear(
          event.center,
          event.damage,
          event.radius,
          event.sourceTeam,
          event.sourceId,
          {
            slow: event.slow,
            root: event.root,
            mark: event.mark,
            knockback: event.knockback,
            consumeMarkBonus: event.consumeMarkBonus,
            cooldownRefund: event.cooldownRefund,
          },
          event.buildingDamageMultiplier,
        );
      } else if (event.kind === "cone" && event.origin && event.direction && event.range && event.halfAngleDeg) {
        this.damageEnemiesInCone(
          event.origin,
          event.direction,
          event.range,
          event.halfAngleDeg,
          event.damage,
          event.sourceTeam,
          event.sourceId,
          {
            slow: event.slow,
            root: event.root,
            mark: event.mark,
            knockback: event.knockback,
            consumeMarkBonus: event.consumeMarkBonus,
            cooldownRefund: event.cooldownRefund,
          },
          event.buildingDamageMultiplier,
        );
      }
    }
  }

  private isDamageSourceValid(event: PendingDamageEvent) {
    if (!event.cancelIfSourceDead || !event.sourceId) return true;
    const sourceUnit = this.units.find((unit) => unit.id === event.sourceId);
    if (sourceUnit) return sourceUnit.alive;
    const sourceBuilding = this.buildings.find((building) => building.id === event.sourceId);
    if (sourceBuilding) return sourceBuilding.hp > 0;
    return true;
  }

  private activatePlayerSkill(skill: SkillKey) {
    const player = this.getPlayer();
    if (this.isPlayerCastingLocked(player)) return this.queuePlayerSkill(skill);
    if (this.quickCast) return this.castPlayerSkill(skill);
    if (!this.canStartPlayerAction(player)) return false;
    if (!this.canAttemptSkill(player, skill)) return false;
    this.pendingSkill = skill;
    this.clearPlayerCommands(player);
    this.message = `${skill.toUpperCase()} aiming`;
    return true;
  }

  private castPendingSkill(aimPoint = this.pointerWorld) {
    if (!this.pendingSkill) return false;
    const skill = this.pendingSkill;
    this.pendingSkill = null;
    return this.castPlayerSkill(skill, aimPoint);
  }

  private cancelPendingSkill() {
    if (!this.pendingSkill) return;
    this.pendingSkill = null;
    this.message = "Cast cancelled";
  }

  private canStartPlayerAction(player: Unit) {
    if (this.result !== "playing") return false;
    if (!player.alive) {
      this.message = "Respawning";
      return false;
    }
    if (this.isModalOpen()) {
      this.message = this.inputBlockedReason(player);
      return false;
    }
    if (this.isPlayerCastingLocked(player)) {
      this.message = "Casting";
      return false;
    }
    return true;
  }

  private skillAttemptFailure(player: Unit, skill: SkillKey) {
    if (this.playerCooldowns[skill] > 0) {
      return "Skill cooling down";
    }
    if (skill === "r" && player.level < 6) {
      return "Ultimate locked";
    }
    const level = this.skillLevel(player, skill);
    if (level <= 0) {
      return "Skill not learned";
    }
    const config = SKILL_CONFIG[skill];
    if (player.mana < config.mana) {
      return "Not enough mana";
    }
    if (skill === "e" && player.rootTimer > 0) {
      return "Rooted";
    }
    return "";
  }

  private canAttemptSkillSilently(player: Unit, skill: SkillKey) {
    return !this.skillAttemptFailure(player, skill);
  }

  private canAttemptSkill(player: Unit, skill: SkillKey) {
    const failure = this.skillAttemptFailure(player, skill);
    if (!failure) return true;
    this.message = failure;
    return false;
  }

  private queuePlayerSkill(skill: SkillKey, aimPoint = this.pointerWorld) {
    const player = this.getPlayer();
    if (!player.alive || this.result !== "playing" || this.isModalOpen()) return this.canStartPlayerAction(player);
    if (!this.canAttemptSkill(player, skill)) return false;
    this.pendingSkill = null;
    this.queuedSkill = skill;
    this.queuedSkillAim = { ...aimPoint };
    this.queuedSkillTimer = CAST_QUEUE_WINDOW;
    this.clearPlayerCommands(player);
    this.message = `${skill.toUpperCase()} buffered`;
    return true;
  }

  private castPlayerSkill(skill: SkillKey, aimPoint = this.pointerWorld, allowQueue = true) {
    const player = this.getPlayer();
    if (this.isPlayerCastingLocked(player) && allowQueue) return this.queuePlayerSkill(skill, aimPoint);
    if (!this.canStartPlayerAction(player)) return false;
    if (!this.canAttemptSkill(player, skill)) return false;
    const level = this.skillLevel(player, skill);
    const config = SKILL_CONFIG[skill];

    const dir = this.getPlayerAimDirection(player, aimPoint);
    this.pendingSkill = null;
    this.clearQueuedSkill();
    this.cancelRecall(player, "Recall interrupted");
    player.lastDirection = directionFromVector(dir.x, dir.y);
    player.mana -= config.mana;
    this.playerCooldowns[skill] = this.skillCooldown(player, skill);
    player.action = "cast";
    player.actionTimer = skill === "e" ? 0.24 : 0.42;
    this.activeCastSkill = skill;
    this.clearPlayerCommands(player);

    if (skill === "q") {
      const origin = { x: player.x, y: player.y };
      this.queueDamageEvent({
        id: `skill_q_${this.sequence += 1}`,
        triggerAt: this.elapsed + SKILL_CONFIG.q.hitDelay,
        sourceTeam: "azure",
        sourceId: player.id,
        kind: "cone",
        origin,
        direction: dir,
        range: SKILL_CONFIG.q.range,
        halfAngleDeg: SKILL_CONFIG.q.halfAngleDeg,
        damage: SKILL_CONFIG.q.damage[level],
        buildingDamageMultiplier: 0.45,
        cancelIfSourceDead: true,
        mark: SKILL_CONFIG.q.markDuration,
        vfx: {
          key: "vfx-astra-q_slash_arc",
          x: origin.x + dir.x * 78,
          y: origin.y + dir.y * 46,
          scale: 1.05,
        },
      });
      this.message = "Arc Slash queued";
    } else if (skill === "w") {
      player.shield = Math.max(player.shield, SKILL_CONFIG.w.shield[level]);
      player.shieldTimer = 2.8;
      this.queueDamageEvent({
        id: `skill_w_${this.sequence += 1}`,
        triggerAt: this.elapsed + SKILL_CONFIG.w.hitDelay,
        sourceTeam: "azure",
        sourceId: player.id,
        kind: "circle",
        center: { x: player.x, y: player.y },
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
          x: player.x,
          y: player.y,
          scale: 1.15,
        },
      });
      this.message = "Guard Pulse shielded";
    } else if (skill === "e") {
      this.spawnVfx("vfx-astra-e_dash_trail", player.x + dir.x * 42, player.y + dir.y * 24, 1.05);
      player.x = clamp(player.x + dir.x * SKILL_CONFIG.e.dashX[level], 80, WORLD_WIDTH - 80);
      player.y = clamp(player.y + dir.y * SKILL_CONFIG.e.dashY[level], 90, WORLD_HEIGHT - 90);
      this.queueDamageEvent({
        id: `skill_e_${this.sequence += 1}`,
        triggerAt: this.elapsed,
        sourceTeam: "azure",
        sourceId: player.id,
        kind: "circle",
        center: { x: player.x, y: player.y },
        radius: SKILL_CONFIG.e.radius,
        damage: SKILL_CONFIG.e.damage[level],
        buildingDamageMultiplier: 0,
        cancelIfSourceDead: true,
        consumeMarkBonus: SKILL_CONFIG.e.markBonus[level],
        cooldownRefund: SKILL_CONFIG.e.markRefund,
      });
      this.message = "Astra E dash";
    } else {
      const origin = { x: player.x, y: player.y };
      this.queueDamageEvent({
        id: `skill_r_${this.sequence += 1}`,
        triggerAt: this.elapsed + SKILL_CONFIG.r.hitDelay,
        sourceTeam: "azure",
        sourceId: player.id,
        kind: "cone",
        origin,
        direction: dir,
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
          x: origin.x + dir.x * 104,
          y: origin.y + dir.y * 58,
          scale: 1.45,
        },
      });
      this.message = "Azure Breaker released";
    }
    return true;
  }

  private tryUpgradeSkill(skill: SkillKey) {
    const player = this.getPlayer();
    if (!player.alive) return false;
    if (player.skillPoints <= 0) {
      this.message = "No skill points";
      return false;
    }
    if (skill === "r" && player.level < 6) {
      this.message = "Ultimate locked";
      return false;
    }
    const current = this.skillLevel(player, skill);
    if (current >= this.maxSkillLevel(skill)) {
      this.message = "Skill already maxed";
      return false;
    }
    player.skillLevels[skill] = current + 1;
    player.skillPoints -= 1;
    this.message = `${skill.toUpperCase()} upgraded`;
    return true;
  }

  private skillLevel(player: Unit, skill: SkillKey) {
    return player.skillLevels[skill] ?? 0;
  }

  private maxSkillLevel(skill: SkillKey) {
    return configuredMaxSkillLevel(skill);
  }

  private skillCooldown(player: Unit, skill: SkillKey) {
    return configuredSkillCooldown(player, skill);
  }

  private getPlayerAimDirection(player: Unit, aim = this.pointerWorld) {
    const dx = aim.x - player.x;
    const dy = aim.y - player.y;
    if (Math.hypot(dx, dy) > 18) return normalize(dx, dy);
    return this.directionVector(player.lastDirection);
  }

  private tryUnitAttack(attacker: Unit, manual: boolean, forcedTarget?: Unit) {
    if (!attacker.alive || attacker.attackTimer > 0) return false;
    if (attacker.kind === "hero" && attacker.action === "cast" && attacker.actionTimer > 0) return false;
    this.cancelRecall(attacker, "Recall interrupted");
    const target = forcedTarget ?? this.findNearestEnemyUnit(attacker, attacker.attackRange + 16);
    if (target) {
      attacker.attackTimer = attacker.attackCooldown;
      attacker.action = "basic_attack";
      attacker.actionTimer = 0.46;
      attacker.lastDirection = directionFromVector(target.x - attacker.x, target.y - attacker.y);
      this.queueDamageEvent({
        id: `attack_${attacker.id}_${this.sequence += 1}`,
        triggerAt: this.elapsed + this.attackWindup(attacker),
        sourceTeam: attacker.team,
        sourceId: attacker.id,
        kind: "unit",
        targetId: target.id,
        damage: attacker.attackDamage,
        buildingDamageMultiplier: 0,
        cancelIfSourceDead: true,
        vfx:
          attacker.team === "crimson"
            ? { key: "vfx-crimson-basic_attack_arc", x: target.x, y: target.y - 8, scale: 0.8 }
            : { key: "vfx-astra-q_slash_arc", x: target.x, y: target.y - 8, scale: 0.72 },
      });
      return true;
    }

    const building = this.findNearestAttackableBuilding(attacker, attacker.attackRange + 34);
    if (building) {
      return this.attackBuilding(attacker, building);
    } else if (manual) {
      this.message = "No target in range";
    }
    return false;
  }

  private attackBuilding(attacker: Unit, building: Building) {
    if (attacker.attackTimer > 0 || building.hp <= 0) return false;
    this.cancelRecall(attacker, "Recall interrupted");
    attacker.attackTimer = attacker.attackCooldown;
    attacker.action = "basic_attack";
    attacker.actionTimer = 0.46;
    attacker.lastDirection = directionFromVector(building.x - attacker.x, building.y - attacker.y);
    this.queueDamageEvent({
      id: `attack_building_${attacker.id}_${this.sequence += 1}`,
      triggerAt: this.elapsed + this.attackWindup(attacker),
      sourceTeam: attacker.team,
      sourceId: attacker.id,
      kind: "building",
      buildingId: building.id,
      damage: attacker.attackDamage * attacker.buildingDamageMultiplier,
      buildingDamageMultiplier: 1,
      cancelIfSourceDead: true,
      vfx: {
        key: attacker.team === "azure" ? "vfx-astra-q_slash_arc" : "vfx-crimson-basic_attack_arc",
        x: building.x,
        y: building.y - 40,
        scale: 0.9,
      },
    });
    return true;
  }

  private attackWindup(attacker: Unit) {
    if (attacker.kind === "hero") return BASIC_ATTACK_WINDUP;
    return MINION_ATTACK_WINDUP;
  }

  private registerTowerHeroAggro(target: Unit, sourceId?: string) {
    registerTowerHeroAggroRule({
      target,
      sourceId,
      units: this.units,
      buildings: this.buildings,
      towerHeroAggro: this.towerHeroAggro,
    });
  }

  private applyAbilityDamageToUnit(target: Unit, baseDamage: number, sourceTeam: Team, sourceId?: string, effects: DamageHitEffects = {}) {
    const marked = target.markTimer > 0 && (effects.consumeMarkBonus ?? 0) > 0;
    const damage = baseDamage + (marked ? effects.consumeMarkBonus ?? 0 : 0);
    const beforeAlive = target.alive;
    this.damageUnit(target, damage, sourceTeam, sourceId);
    if (beforeAlive && !target.alive) this.grantEnemyLastHitEconomy(target, sourceId);
    if (!target.alive) return;
    if (marked) {
      target.markTimer = 0;
      if (sourceId === "player") {
        this.applyCooldownRefund(effects.cooldownRefund);
        this.spawnVfx("vfx-astra-w_shield_pulse", target.x, target.y - 6, 0.68);
        this.message = "Mark consumed";
      }
    }
    if (effects.mark) this.applyMark(target, effects.mark);
    if (effects.slow) this.applySlow(target, effects.slow.multiplier, effects.slow.duration);
    if (effects.root) this.applyRoot(target, effects.root);
    if (effects.knockback && effects.knockback > 0) this.knockbackUnit(target, this.getEffectOrigin(sourceId, target), effects.knockback);
  }

  private getEffectOrigin(sourceId: string | undefined, fallback: Point) {
    const source = sourceId ? this.units.find((unit) => unit.id === sourceId) : undefined;
    return source ?? fallback;
  }

  private applyCooldownRefund(refund?: Partial<Record<SkillKey, number>>) {
    if (!refund) return;
    for (const [skill, seconds] of Object.entries(refund) as Array<[SkillKey, number]>) {
      this.playerCooldowns[skill] = Math.max(0, this.playerCooldowns[skill] - seconds);
    }
  }

  private applySlow(unit: Unit, multiplier: number, duration: number) {
    unit.slowMultiplier = Math.min(unit.slowMultiplier, multiplier);
    unit.slowTimer = Math.max(unit.slowTimer, duration);
  }

  private applyRoot(unit: Unit, duration: number) {
    unit.rootTimer = Math.max(unit.rootTimer, duration);
    unit.targetPoint = undefined;
    unit.attackMovePoint = undefined;
  }

  private applyMark(unit: Unit, duration: number) {
    unit.markTimer = Math.max(unit.markTimer, duration);
  }

  private knockbackUnit(unit: Unit, origin: Point, distancePixels: number) {
    const dir = normalize(unit.x - origin.x, unit.y - origin.y);
    unit.x = clamp(unit.x + dir.x * distancePixels, 72, WORLD_WIDTH - 72);
    unit.y = clamp(unit.y + dir.y * distancePixels * 0.68, 80, WORLD_HEIGHT - 76);
    unit.targetPoint = undefined;
  }

  private damageEnemiesNear(
    center: Point,
    damage: number,
    radius: number,
    sourceTeam: Team,
    sourceId?: string,
    effects: DamageHitEffects = {},
    buildingDamageMultiplier = 0.45,
  ) {
    const { knockback, ...damageEffects } = effects;
    for (const unit of this.units) {
      if (!unit.alive || unit.team === sourceTeam || distance(unit, center) > radius + unit.radius) continue;
      this.applyAbilityDamageToUnit(unit, damage, sourceTeam, sourceId, damageEffects);
      if (knockback && unit.alive) this.knockbackUnit(unit, center, knockback);
    }
    for (const building of this.buildings) {
      if (building.team === sourceTeam || building.hp <= 0 || distance(building, center) > radius + building.radius) continue;
      if (!isBuildingVulnerable(building, this.buildings)) continue;
      this.applyBuildingDamage(building, damage * buildingDamageMultiplier);
    }
  }

  private damageEnemiesInCone(
    origin: Point,
    direction: Point,
    range: number,
    halfAngleDeg: number,
    damage: number,
    sourceTeam: Team,
    sourceId?: string,
    effects: DamageHitEffects = {},
    buildingDamageMultiplier = 0.45,
  ) {
    const dir = normalize(direction.x, direction.y);
    const maxWidthAtEdge = Math.tan(Phaser.Math.DegToRad(halfAngleDeg)) * range;
    const { knockback, ...damageEffects } = effects;
    for (const unit of this.units) {
      if (!unit.alive || unit.team === sourceTeam) continue;
      const rel = { x: unit.x - origin.x, y: unit.y - origin.y };
      const forward = rel.x * dir.x + rel.y * dir.y;
      if (forward < -unit.radius || forward > range + unit.radius) continue;
      const perpendicular = Math.abs(rel.x * dir.y - rel.y * dir.x);
      const allowedWidth = Math.max(42, (forward / range) * maxWidthAtEdge) + unit.radius;
      if (perpendicular > allowedWidth) continue;
      this.applyAbilityDamageToUnit(unit, damage, sourceTeam, sourceId, damageEffects);
      if (knockback && unit.alive) this.knockbackUnit(unit, origin, knockback);
    }
    for (const building of this.buildings) {
      if (building.team === sourceTeam || building.hp <= 0 || !isBuildingVulnerable(building, this.buildings)) continue;
      const rel = { x: building.x - origin.x, y: building.y - origin.y };
      const forward = rel.x * dir.x + rel.y * dir.y;
      if (forward < -building.radius || forward > range + building.radius) continue;
      const perpendicular = Math.abs(rel.x * dir.y - rel.y * dir.x);
      const allowedWidth = Math.max(56, (forward / range) * maxWidthAtEdge) + building.radius;
      if (perpendicular <= allowedWidth) this.applyBuildingDamage(building, damage * buildingDamageMultiplier);
    }
  }

  private damageUnit(target: Unit, amount: number, sourceTeam: Team, sourceId?: string) {
    if (!target.alive) return;
    this.cancelRecall(target, target.id === "player" ? "Recall interrupted" : undefined);
    const shieldDamage = Math.min(target.shield, amount);
    target.shield -= shieldDamage;
    target.hp -= amount - shieldDamage;
    this.flashUnit(target);
    this.showDamageNumber(target.x, target.y - 58, Math.round(amount), sourceTeam);
    target.action = target.hp <= 0 ? "death" : "hit";
    target.actionTimer = target.hp <= 0 ? 1.2 : 0.24;
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      this.handleUnitDeath(target, sourceTeam, sourceId);
    } else {
      this.registerTowerHeroAggro(target, sourceId);
    }
  }

  private applyBuildingDamage(building: Building, amount: number) {
    if (building.hp <= 0 || !isBuildingVulnerable(building, this.buildings)) return;
    building.hp = Math.max(0, building.hp - amount);
    this.flashBuilding(building);
    this.showDamageNumber(building.x, building.y - 118, Math.round(amount), building.team === "azure" ? "crimson" : "azure");
    if (building.hp <= 0) {
      this.message = `${building.id} destroyed`;
      if (building.id === "crimson_core") this.endGame("victory");
      if (building.id === "azure_core") this.endGame("defeat");
    }
  }

  private handleUnitDeath(target: Unit, sourceTeam: Team, sourceId?: string) {
    if (sourceTeam === "azure") this.azureKills += 1;
    if (sourceTeam === "crimson") this.crimsonKills += 1;
    if (target.kind === "hero") this.handleHeroDeath(target, sourceTeam);
    const player = this.getPlayer();
    if (target.team !== player.team && distance(player, target) <= PLAYER_XP_SHARE_RANGE) {
      this.grantPlayerExperience(target);
    }
    if (sourceId === "player" && target.team !== player.team) {
      this.grantPlayerLastHitGold(target);
    }
  }

  private handleHeroDeath(target: Unit, sourceTeam: Team) {
    this.cancelRecall(target, target.id === "player" ? "Recall interrupted" : undefined);
    this.clearUnitCommands(target);
    target.attackTimer = 0;
    target.shield = 0;
    target.shieldTimer = 0;
    target.slowTimer = 0;
    target.slowMultiplier = 1;
    target.rootTimer = 0;
    target.markTimer = 0;
    target.hasteTimer = 0;
    target.hasteMultiplier = 1;
    if (target.id === "player") {
      this.playerDeaths += 1;
      if (sourceTeam === "crimson") this.enemyHeroKills += 1;
      this.shopOpen = false;
      this.settingsOpen = false;
      this.cancelPendingSkill();
      this.clearQueuedSkill();
      this.activeCastSkill = null;
      target.respawnDuration = this.respawnDurationFor(this.playerDeaths);
      target.respawnTimer = target.respawnDuration;
      this.message = `Astra down · ${Math.ceil(target.respawnTimer)}s`;
      return;
    }
    if (target.id === "enemy_hero") {
      this.enemyDeaths += 1;
      if (sourceTeam === "azure") this.playerHeroKills += 1;
      target.respawnDuration = this.respawnDurationFor(this.enemyDeaths);
      target.respawnTimer = target.respawnDuration;
      this.message = `Crimson down · ${Math.ceil(target.respawnTimer)}s`;
    }
  }

  private respawnDurationFor(deaths: number) {
    return configuredRespawnDurationFor(deaths, this.elapsed);
  }

  private resolveDeaths(dt: number) {
    for (const unit of this.units) {
      if (unit.alive || unit.kind !== "hero") continue;
      unit.respawnTimer -= dt;
      if (unit.respawnTimer <= 0) {
        const start = unit.team === "azure" ? PLAYER_START : ENEMY_START;
        unit.x = start.x;
        unit.y = start.y;
        unit.hp = unit.maxHp;
        unit.mana = unit.maxMana;
        unit.shield = 0;
        unit.shieldTimer = 0;
        unit.slowTimer = 0;
        unit.slowMultiplier = 1;
        unit.rootTimer = 0;
        unit.markTimer = 0;
        unit.hasteTimer = 0;
        unit.hasteMultiplier = 1;
        unit.alive = true;
        unit.action = "idle";
        unit.actionTimer = 0;
        unit.attackTimer = 0;
        unit.targetUnitId = undefined;
        unit.targetBuildingId = undefined;
        unit.targetPoint = undefined;
        unit.attackMovePoint = undefined;
        unit.respawnTimer = 0;
        this.message = unit.id === "player" ? "Astra respawned" : "Crimson respawned";
      }
    }
    this.units = this.units.filter((unit) => unit.kind === "hero" || unit.alive || unit.actionTimer > 0);
  }

  private grantPlayerExperience(target: Unit) {
    const player = this.getPlayer();
    if (!player.alive) return;
    const xp = XP_REWARDS[target.kind];
    player.xp += xp;
    this.playerXpGained += xp;
    while (player.level < 6 && player.xp >= LEVEL_XP_REQUIREMENTS[player.level]) {
      player.xp -= LEVEL_XP_REQUIREMENTS[player.level];
      player.level += 1;
      player.skillPoints += 1;
      player.maxHp += 55;
      player.hp = Math.min(player.maxHp, player.hp + 55);
      player.attackDamage += 6;
      if (player.level === 6) player.skillLevels.r = Math.max(1, player.skillLevels.r);
      this.spawnVfx("vfx-astra-w_shield_pulse", player.x, player.y, 1);
      this.message = `Level ${player.level}`;
    }
  }

  private grantPlayerLastHitGold(target: Unit) {
    const player = this.getPlayer();
    const gold = GOLD_REWARDS[target.kind];
    player.gold += gold;
    this.playerLastHits += target.kind === "hero" ? 0 : 1;
    this.message = target.kind === "hero" ? `Champion takedown +${gold}g` : `Last hit +${gold}g`;
  }

  private grantEnemyLastHitEconomy(target: Unit, sourceId?: string) {
    if (sourceId !== "enemy_hero" || target.team !== "azure") return;
    this.enemyGold += GOLD_REWARDS[target.kind];
    this.enemyXp += XP_REWARDS[target.kind];
    if (target.kind !== "hero") this.enemyLastHits += 1;
  }

  private buyItem(itemId: keyof typeof ITEM_CATALOG) {
    const item = ITEM_CATALOG[itemId];
    const player = this.getPlayer();
    if (!player.alive) {
      this.message = "Cannot shop while dead";
      return false;
    }
    if (this.purchasedItems.has(itemId)) {
      this.message = "Item already owned";
      return false;
    }
    if (!this.isPlayerInShop()) {
      this.message = "Shop is only available in base";
      return false;
    }
    if (player.gold < item.cost) {
      this.message = "Not enough gold";
      return false;
    }
    player.gold -= item.cost;
    player.attackDamage += item.attackDamage;
    player.speed += item.moveSpeed;
    player.maxHp += item.maxHp;
    player.hp += item.maxHp;
    player.maxMana += item.maxMana;
    player.mana += item.maxMana;
    player.cooldownReduction = clamp(player.cooldownReduction + item.cooldownReduction, 0, 0.35);
    this.purchasedItems.add(itemId);
    this.message = `Purchased ${itemId.split("_").join(" ")}`;
    return true;
  }

  private itemSlotAction(itemId: ItemId) {
    if (this.purchasedItems.has(itemId)) return this.useItem(itemId);
    return this.buyItem(itemId);
  }

  private useItemSlot(slot: number) {
    const itemId = ACTIVE_ITEM_IDS.find((id) => ITEM_CATALOG[id].slot === slot);
    if (!itemId) {
      this.message = "Empty item slot";
      return false;
    }
    if (!this.purchasedItems.has(itemId)) {
      this.message = `Slot ${slot} item not owned`;
      return false;
    }
    return this.useItem(itemId);
  }

  private useItem(itemId: ItemId) {
    const player = this.getPlayer();
    const item = ITEM_CATALOG[itemId];
    if (item.activeKind === "none") {
      this.message = "Passive item";
      return false;
    }
    if (!this.purchasedItems.has(itemId)) {
      this.message = "Item not owned";
      return false;
    }
    if (!this.canStartPlayerAction(player)) return false;
    if (this.itemCooldowns[itemId] > 0) {
      this.message = "Item cooling down";
      return false;
    }
    const used = this.resolveActiveItemEffect(item.activeKind, itemId, player);
    if (!used) return false;
    this.cancelRecall(player, "Recall interrupted");
    this.itemCooldowns[itemId] = item.activeCooldown;
    this.message = `${item.activeLabel} activated`;
    return true;
  }

  private resolveActiveItemEffect(kind: ActiveItemKind, itemId: ItemId, player: Unit) {
    if (kind === "mana") {
      player.mana = Math.min(player.maxMana, player.mana + 160);
      for (const skill of ["q", "w", "e"] as const) {
        this.playerCooldowns[skill] = Math.max(0, this.playerCooldowns[skill] - 1.1);
      }
      this.spawnVfx("vfx-astra-w_shield_pulse", player.x, player.y - 6, 0.78);
      return true;
    }
    if (kind === "shield") {
      player.shield = Math.max(player.shield, 180);
      player.shieldTimer = Math.max(player.shieldTimer, 3.2);
      this.spawnVfx("vfx-astra-w_shield_pulse", player.x, player.y, 1);
      return true;
    }
    if (kind === "haste") {
      player.hasteMultiplier = Math.max(player.hasteMultiplier, 1.34);
      player.hasteTimer = Math.max(player.hasteTimer, 3.4);
      this.spawnVfx("vfx-astra-e_dash_trail", player.x + 20, player.y - 4, 0.92);
      return true;
    }
    if (kind === "demolish") {
      const building = this.findNearestAttackableBuilding(player, 250);
      if (!building) {
        this.message = "No structure in range";
        return false;
      }
      this.applyBuildingDamage(building, 260);
      this.spawnVfx("vfx-astra-q_slash_arc", building.x, building.y - 42, 1.05);
      return true;
    }
    this.message = `${itemId} has no active`;
    return false;
  }

  private syncViews() {
    for (const unit of this.units) {
      if (!this.unitSprites.has(unit.id)) this.createUnitView(unit);
      this.syncUnitView(unit);
    }
    for (const [id, sprite] of this.unitSprites.entries()) {
      if (!this.units.some((unit) => unit.id === id)) {
        sprite.destroy();
        this.unitSprites.delete(id);
        this.unitBars.get(id)?.destroy();
        this.unitBars.delete(id);
      }
    }
    for (const building of this.buildings) {
      this.syncBuildingView(building);
    }
    this.updateAimPreview();
    updateHud(this.snapshot());
  }

  private updateAimPreview() {
    const preview = this.aimPreview;
    if (!preview) return;
    preview.clear();
    const player = this.getPlayer();
    if (!player.alive || this.result !== "playing") return;
    const skill = this.activeAimSkill();
    if (!skill) return;
    const dir = this.getPlayerAimDirection(player);
    if (skill === "w") {
      preview.lineStyle(2, 0x8fe7ff, 0.34);
      preview.fillStyle(0x4aa8ff, 0.06);
      preview.fillCircle(player.x, player.y, SKILL_CONFIG.w.radius);
      preview.strokeCircle(player.x, player.y, SKILL_CONFIG.w.radius);
      return;
    }
    if (skill === "e") {
      const level = Math.max(1, this.skillLevel(player, "e"));
      const end = {
        x: player.x + dir.x * SKILL_CONFIG.e.dashX[level],
        y: player.y + dir.y * SKILL_CONFIG.e.dashY[level],
      };
      preview.lineStyle(7, 0x76d9ff, 0.18);
      preview.lineBetween(player.x, player.y, end.x, end.y);
      preview.lineStyle(2, 0xc4f6ff, 0.42);
      preview.strokeCircle(end.x, end.y, SKILL_CONFIG.e.radius);
      return;
    }
    const config = skill === "r" ? SKILL_CONFIG.r : SKILL_CONFIG.q;
    const range = skill === "r" ? config.range : SKILL_CONFIG.q.range;
    const halfAngle = Phaser.Math.DegToRad(skill === "r" ? SKILL_CONFIG.r.halfAngleDeg : SKILL_CONFIG.q.halfAngleDeg);
    const center = { x: player.x + dir.x * range, y: player.y + dir.y * range };
    const leftAngle = Math.atan2(dir.y, dir.x) - halfAngle;
    const rightAngle = Math.atan2(dir.y, dir.x) + halfAngle;
    const left = { x: player.x + Math.cos(leftAngle) * range, y: player.y + Math.sin(leftAngle) * range };
    const right = { x: player.x + Math.cos(rightAngle) * range, y: player.y + Math.sin(rightAngle) * range };
    preview.fillStyle(skill === "r" ? 0x9bd7ff : 0x76d9ff, skill === "r" ? 0.1 : 0.075);
    preview.fillTriangle(player.x, player.y, left.x, left.y, right.x, right.y);
    preview.lineStyle(2, skill === "r" ? 0xd7f4ff : 0x9feaff, skill === "r" ? 0.42 : 0.3);
    preview.lineBetween(player.x, player.y, left.x, left.y);
    preview.lineBetween(player.x, player.y, right.x, right.y);
    preview.lineStyle(1, 0xc8f6ff, 0.25);
    preview.lineBetween(player.x, player.y, center.x, center.y);
  }

  private activeAimSkill(): SkillKey | null {
    if (this.pendingSkill) return this.pendingSkill;
    if (!this.showRangeIndicators || !this.keys || this.isModalOpen()) return null;
    if (this.keys.r.isDown) return "r";
    if (this.keys.e.isDown) return "e";
    if (this.keys.w.isDown) return "w";
    if (this.keys.q.isDown) return "q";
    return null;
  }

  private drawTowerRanges() {
    const range = this.add.graphics().setDepth(-5);
    for (const building of this.buildings.filter((candidate) => candidate.type === "tower")) {
      range.lineStyle(3, building.team === "azure" ? 0x4aa8ff : 0xff5448, 0.42);
      range.strokeCircle(building.x, building.y, building.attackRange);
      range.fillStyle(building.team === "azure" ? 0x4aa8ff : 0xff5448, 0.06);
      range.fillCircle(building.x, building.y, building.attackRange);
    }
  }

  private syncUnitView(unit: Unit) {
    const sprite = this.unitSprites.get(unit.id);
    const bar = this.unitBars.get(unit.id);
    if (!sprite || !bar) return;
    sprite.setPosition(unit.x, unit.y);
    sprite.setDepth(unit.y);
    sprite.setAlpha(unit.alive ? 1 : 0.8);
    const action = this.visibleAction(unit);
    const animKey = this.animationKey(unit.assetId, action, unit.lastDirection);
    if (sprite.anims.currentAnim?.key !== animKey) sprite.play(animKey, true);
    this.drawHealthBar(bar, unit.x, unit.y - 54 * UNIT_ASSETS[unit.assetId].scale, 58, unit.hp, unit.maxHp, unit.team, unit.shield, unitEffectLabels(unit));
  }

  private syncBuildingView(building: Building) {
    const sprite = this.buildingSprites.get(building.id);
    const bar = this.buildingBars.get(building.id);
    if (!sprite || !bar) return;
    const state = buildingState(building);
    sprite.setTexture(this.buildingTextureKey(building.assetId, state));
    sprite.setPosition(building.x, building.y);
    sprite.setDepth(building.y - 40);
    this.drawHealthBar(bar, building.x, building.y - (building.type === "tower" ? 190 : 120), 120, building.hp, building.maxHp, building.team, 0);
  }

  private drawHealthBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, hp: number, maxHp: number, team: Team, shield: number, effects: string[] = []) {
    const percent = maxHp > 0 ? clamp(hp / maxHp, 0, 1) : 0;
    graphics.clear();
    graphics.fillStyle(0x0b0d10, 0.82);
    graphics.fillRoundedRect(x - width / 2, y, width, 7, 3);
    graphics.fillStyle(team === "azure" ? 0x45d970 : 0xff574f, 1);
    graphics.fillRoundedRect(x - width / 2 + 1, y + 1, Math.max(0, (width - 2) * percent), 5, 2);
    if (shield > 0) {
      graphics.fillStyle(0x67d9ff, 0.85);
      graphics.fillRoundedRect(x - width / 2 + 1, y - 5, Math.min(width - 2, shield / 2), 3, 2);
    }
    if (effects.includes("marked")) {
      graphics.fillStyle(0xffd76a, 0.95);
      graphics.fillRoundedRect(x - width / 2 + 1, y + 10, width - 2, 3, 2);
    }
    if (effects.includes("rooted")) {
      graphics.fillStyle(0x90f4ff, 0.92);
      graphics.fillRoundedRect(x - width / 2 + 1, y + 15, width - 2, 3, 2);
    }
  }

  private spawnWave() {
    this.waveNumber += 1;
    const wave = [
      this.makeMinion("azure_melee_minion", "azure", "melee", LANE_START.x + 24, LANE_START.y + 12),
      this.makeMinion("azure_melee_minion", "azure", "melee", LANE_START.x - 18, LANE_START.y + 42),
      this.makeMinion("azure_melee_minion", "azure", "melee", LANE_START.x - 62, LANE_START.y + 70),
      this.makeMinion("azure_caster_minion", "azure", "caster", LANE_START.x - 18, LANE_START.y + 88),
      this.makeMinion("azure_caster_minion", "azure", "caster", LANE_START.x - 62, LANE_START.y + 116),
      this.makeMinion("azure_caster_minion", "azure", "caster", LANE_START.x - 104, LANE_START.y + 142),
      this.makeMinion("crimson_melee_minion", "crimson", "melee", LANE_END.x - 18, LANE_END.y - 10),
      this.makeMinion("crimson_melee_minion", "crimson", "melee", LANE_END.x + 30, LANE_END.y - 36),
      this.makeMinion("crimson_melee_minion", "crimson", "melee", LANE_END.x + 74, LANE_END.y - 64),
      this.makeMinion("crimson_caster_minion", "crimson", "caster", LANE_END.x + 28, LANE_END.y - 86),
      this.makeMinion("crimson_caster_minion", "crimson", "caster", LANE_END.x + 76, LANE_END.y - 112),
      this.makeMinion("crimson_caster_minion", "crimson", "caster", LANE_END.x + 118, LANE_END.y - 140),
    ];
    if (this.waveNumber % 3 === 0) {
      wave.push(
        this.makeMinion("azure_siege_minion", "azure", "siege", LANE_START.x - 146, LANE_START.y + 166),
        this.makeMinion("crimson_siege_minion", "crimson", "siege", LANE_END.x + 158, LANE_END.y - 164),
      );
    }
    this.units.push(...wave);
    for (const unit of wave) this.createUnitView(unit);
    this.message = this.waveNumber % 3 === 0 ? "Siege wave spawned" : "Minion wave spawned";
  }

  private makeHero(id: string, assetId: string, team: Team, x: number, y: number): Unit {
    return createHero(id, assetId, team, x, y);
  }

  private makeMinion(assetId: string, team: Team, kind: Exclude<UnitKind, "hero">, x: number, y: number): Unit {
    this.sequence += 1;
    return createMinion(`${assetId}_${this.sequence}`, assetId, team, kind, x, y, Phaser.Math.FloatBetween(0, 0.35));
  }

  private makeBuilding(id: string, assetId: keyof typeof BUILDING_ASSETS, team: Team, type: "tower" | "core", x: number, y: number): Building {
    return createBuilding(id, assetId, team, type, x, y);
  }

  private createUnitView(unit: Unit) {
    const sprite = this.add
      .sprite(unit.x, unit.y, this.unitTextureKey(unit.assetId, "idle"))
      .setScale(UNIT_ASSETS[unit.assetId].scale)
      .setDepth(unit.y);
    sprite.play(this.animationKey(unit.assetId, "idle", unit.lastDirection));
    this.unitSprites.set(unit.id, sprite);
    this.unitBars.set(unit.id, this.add.graphics().setDepth(9999));
  }

  private moveUnit(unit: Unit, dx: number, dy: number, speed: number, dt: number) {
    if (unit.rootTimer > 0) {
      if (unit.actionTimer <= 0) unit.action = "idle";
      return;
    }
    const adjustedSpeed = speed * unit.slowMultiplier * unit.hasteMultiplier;
    unit.x = clamp(unit.x + dx * adjustedSpeed * dt, 72, WORLD_WIDTH - 72);
    unit.y = clamp(unit.y + dy * adjustedSpeed * dt, 80, WORLD_HEIGHT - 76);
    unit.lastDirection = directionFromVector(dx, dy);
    if (unit.actionTimer <= 0) unit.action = "move";
  }

  private findNearestEnemyUnit(source: Unit, range: number) {
    return this.units
      .filter((unit) => unit.alive && unit.team !== source.team)
      .map((unit) => ({ unit, gap: distance(source, unit) - unit.radius - source.radius }))
      .filter(({ gap }) => gap <= range)
      .sort((a, b) => a.gap - b.gap)[0]?.unit;
  }

  private findNearestAttackableBuilding(source: Unit, range: number) {
    return findNearestAttackableBuildingRule(source, this.buildings, range);
  }

  private visibleAction(unit: Unit): UnitAction {
    if (!unit.alive) return "death";
    if (unit.actionTimer > 0) return unit.action;
    return unit.action === "move" ? "move" : "idle";
  }

  private spawnVfx(animationKey: string, x: number, y: number, scale: number) {
    const texture = animationKey.startsWith("vfx-astra") ? "vfx-astra" : "vfx-crimson";
    const sprite = this.add.sprite(x, y, texture).setScale(scale).setDepth(y + 180).play(animationKey);
    this.vfx.push({ id: `${animationKey}_${this.elapsed}_${this.vfx.length}`, sprite, ttl: 0.48 });
  }

  private flashUnit(unit: Unit) {
    const sprite = this.unitSprites.get(unit.id);
    if (!sprite) return;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(90, () => sprite.clearTint());
  }

  private flashBuilding(building: Building) {
    const sprite = this.buildingSprites.get(building.id);
    if (!sprite) return;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(90, () => sprite.clearTint());
  }

  private showDamageNumber(x: number, y: number, amount: number, sourceTeam: Team) {
    const text = this.add
      .text(x, y, String(amount), {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        fontStyle: "700",
        color: sourceTeam === "azure" ? "#9ff4ff" : "#ffba91",
        stroke: "#081014",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(y + 260);
    this.tweens.add({
      targets: text,
      y: y - 34,
      alpha: 0,
      duration: 620,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  private directionVector(direction: Direction) {
    const vectors: Record<Direction, Point> = {
      south: { x: 0, y: 1 },
      "south-east": { x: 0.7, y: 0.7 },
      east: { x: 1, y: 0 },
      "north-east": { x: 0.7, y: -0.7 },
      north: { x: 0, y: -1 },
      "north-west": { x: -0.7, y: -0.7 },
      west: { x: -1, y: 0 },
      "south-west": { x: -0.7, y: 0.7 },
    };
    return normalize(vectors[direction].x, vectors[direction].y);
  }

  private getLaneGoal(team: Team): Point {
    return team === "azure" ? LANE_END : LANE_START;
  }

  private getPlayer() {
    const player = this.units.find((unit) => unit.id === "player");
    if (!player) throw new Error("Player unit is missing");
    return player;
  }

  private getPlayerSprite() {
    const sprite = this.unitSprites.get("player");
    if (!sprite) throw new Error("Player sprite is missing");
    return sprite;
  }

  private getBuilding(id: string) {
    const building = this.buildings.find((candidate) => candidate.id === id);
    if (!building) throw new Error(`Building ${id} is missing`);
    return building;
  }

  private isPlayerInShop() {
    return distance(this.getPlayer(), this.getBuilding("azure_core")) <= 390;
  }

  private endGame(result: GameResult) {
    if (this.result !== "playing") return;
    this.result = result;
    this.message = result === "victory" ? "Victory: Crimson core destroyed" : "Defeat: Azure core destroyed";
  }

  private toggleFullscreen() {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  }

  private unitTextureKey(assetId: string, action: UnitAction | string) {
    return `${assetId}-${action}`;
  }

  private animationKey(assetId: string, action: UnitAction, direction: Direction) {
    return `${assetId}-${action}-${direction}`;
  }

  private buildingTextureKey(buildingId: string, state: string) {
    return `${buildingId}-${state}`;
  }

  private snapshot(): GameSnapshot {
    const player = this.getPlayer();
    const activeAimSkill = this.activeAimSkill();
    return createGameSnapshot({
      result: this.result,
      elapsed: this.elapsed,
      azureKills: this.azureKills,
      crimsonKills: this.crimsonKills,
      playerHeroKills: this.playerHeroKills,
      enemyHeroKills: this.enemyHeroKills,
      playerLastHits: this.playerLastHits,
      enemyLastHits: this.enemyLastHits,
      playerDeaths: this.playerDeaths,
      enemyDeaths: this.enemyDeaths,
      enemyGold: this.enemyGold,
      enemyXp: this.enemyXp,
      enemySkillCooldown: this.enemySkillCooldown,
      enemyAiState: this.enemyAiState,
      player,
      playerCooldowns: this.playerCooldowns,
      itemCooldowns: this.itemCooldowns,
      purchasedItems: this.purchasedItems,
      waveNumber: this.waveNumber,
      waveTimer: this.waveTimer,
      shopOpen: this.shopOpen,
      shopAvailable: player.alive && this.isPlayerInShop(),
      scoreboardOpen: this.scoreboardOpen,
      settingsOpen: this.settingsOpen,
      quickCast: this.quickCast,
      showRangeIndicators: this.showRangeIndicators,
      queuedSkill: this.queuedSkill,
      queuedSkillTimer: this.queuedSkillTimer,
      pendingSkill: this.pendingSkill,
      activeCastSkill: this.activeCastSkill,
      activeAimSkill,
      aimPreviewVisible: Boolean(player.alive && this.aimPreview && this.result === "playing" && activeAimSkill),
      pointerWorld: this.pointerWorld,
      playerCastingLocked: this.isPlayerCastingLocked(player),
      buildings: this.buildings,
      units: this.units,
      activeVfx: this.vfx.length,
      message: this.message,
      canAttemptSkill: (skill) => this.canAttemptSkillSilently(player, skill),
    });
  }
}

export const createGameConfig = (): Phaser.Types.Core.GameConfig => ({
  type: Phaser.CANVAS,
  parent: "game-root",
  width: 1280,
  height: 720,
  backgroundColor: "#143524",
  scene: [MobaScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
});
