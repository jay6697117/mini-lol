import Phaser from "phaser";
import { installMobaDebugApi, type MobaDebugAdapter } from "./debug-api";
import { installGameCommandDispatcher, type GameCommandAdapter } from "./game-command";
import {
  BUILDING_ASSETS,
  DIRECTIONS,
  MAP_ASSETS,
  type Direction,
  type Team,
  type UnitAction,
  UNIT_ASSETS,
  VFX_ASSETS,
} from "./assets";
import {
  BASIC_ATTACK_WINDUP,
  BUILDING_LAYOUT,
  ENEMY_START,
  FOUNTAIN_LAYOUT,
  FOUNTAIN_REGEN_RADIUS,
  ITEM_CATALOG,
  type ItemId,
  LANE_END,
  LANE_START,
  MINION_ATTACK_WINDUP,
  PLAYER_START,
  PLAYER_XP_SHARE_RANGE,
  TOWER_ATTACK_WINDUP,
  WAVE_INTERVAL,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./data/game-config";
import { applyActiveItemEffect, resolveActiveItemUseApplication, resolveActiveItemUseGate } from "./simulation/active-items";
import { applyBuildingDamageApplication, applyUnitDamageResolution, createBuildingAttackDamageEvent, createUnitAttackDamageEvent, drainDueDamageEvents, findNearestEnemyUnit as findNearestEnemyUnitRule, resolveAbilityDamagePlan, resolveAbilityPostDamageApplication, resolveAreaDamageApplication, resolvePendingDamageEventDispatch, type AreaDamageApplication } from "./simulation/combat";
import { applyAttackBuildingCommand, applyAttackUnitCommand, applyMoveCommand, applyPlayerAttackCommandDecision, clearUnitCommands as clearUnitCommandsRule, resolvePlayerAttackCommand } from "./simulation/commands";
import { tickItemCooldowns, tickSkillCooldowns } from "./simulation/cooldowns";
import { createEnemyHeroDecisionInput, decideEnemyHeroAction, traceEnemyHeroDecision, type EnemyHeroDecisionTrace } from "./simulation/enemy-ai";
import { applyPlayerExperienceGain, applyPlayerLastHitGold, enemyLastHitEconomyDelta, itemIdForActiveSlot, tryPurchaseCatalogItem } from "./simulation/economy";
import { createBuilding, createHero, createMinion } from "./simulation/factories";
import { laneReturnTargetForUnit } from "./simulation/lane-path";
import { shouldShowMissedCs } from "./simulation/last-hit";
import { decideMinionAction } from "./simulation/minion-ai";
import { callMinionAggroOnHeroDamage, tickMinionAggro } from "./simulation/minion-aggro";
import { isAnyModalOpen, resolveEscapeKeyAction, resolveSettingsTransition, resolveShopAutoClose, resolveShopTransition, type ModalTransition } from "./simulation/modal-state";
import { moveUnit } from "./simulation/movement";
import { buildingState, findNearestAttackableBuilding as findNearestAttackableBuildingRule, structureDamageMultiplier } from "./simulation/objectives";
import { applyPlayerSkillCastState, applyQueuedPlayerSkillState, createAimPreviewShape, createPlayerSkillCastDraft, playerSkillAttemptFailure, playerSkillLevel, resolveActiveAimSkill } from "./simulation/player-skills";
import { collectPlayerInputTickActions, resolveAxisMovementDecision, resolveKeyboardDownAction, resolveKeyboardUpAction, resolvePlayerActionStartDecision, resolvePlayerInputBlockDecision, resolvePointerDownAction, resolveTargetPointMovementDecision } from "./simulation/player-input";
import { resolveQueuedSkillTick } from "./simulation/queued-skill";
import { clamp, directionFromVector, distance, maxSkillLevel as configuredMaxSkillLevel, normalize, respawnDurationFor as configuredRespawnDurationFor, skillCooldown as configuredSkillCooldown, vectorFromDirection } from "./simulation/rules";
import { createGameSnapshot, playerInputBlockedReason, unitEffectLabels } from "./simulation/snapshot";
import { pickEnemyBuildingAtPoint, pickEnemyUnitAtPoint } from "./simulation/target-picking";
import { createTowerDamageEvent, registerTowerHeroAggro as registerTowerHeroAggroRule, resolveTowerAttacks, tickTowerAggro, towerAttackDisplayRadius } from "./simulation/towers";
import type { Building, DamageHitEffects, PendingDamageEvent, Point, TowerAggroState, Unit } from "./simulation/types";
import { applyBaseRecovery, beginRecallChannel, prepareHeroDeathState, respawnHeroAt, tickRecallChannel, tickUnitStatusEffects, visibleUnitAction } from "./simulation/unit-lifecycle";
import type { EnemyAiState, GameResult, GameSnapshot, SkillKey, UnitKind } from "./types";
import { updateHud } from "../ui/hud";

interface VfxInstance {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  ttl: number;
}

interface TowerProjectileInstance {
  id: string;
  orb: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  start: Point;
  end: Point;
  elapsed: number;
  duration: number;
}

const ENEMY_ITEM_ORDER: ItemId[] = ["bronze_sword", "plated_boots", "rift_lens", "vitality_core", "haste_talisman", "guard_shield", "siege_hammer"];
const DEFAULT_CAMERA_ZOOM = 1;
const MIN_CAMERA_ZOOM = 0.82;
const MAX_CAMERA_ZOOM = 1.28;
const CAMERA_ZOOM_STEP = 0.08;
const TOWER_PROJECTILE_ARC_HEIGHT = 28;

type KeyMap = Record<
  "up" | "down" | "left" | "right" | "a" | "b" | "p" | "q" | "w" | "e" | "r" | "one" | "two" | "three" | "four" | "space" | "f" | "ctrl" | "tab" | "escape",
  Phaser.Input.Keyboard.Key
>;

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
  private towerProjectiles: TowerProjectileInstance[] = [];
  private pendingDamageEvents: PendingDamageEvent[] = [];
  private playerCooldowns = { q: 0, w: 0, e: 0, r: 0 };
  private itemCooldowns: Record<ItemId, number> = {
    bronze_sword: 0,
    plated_boots: 0,
    focus_crystal: 0,
    guard_shield: 0,
    rift_lens: 0,
    vitality_core: 0,
    haste_talisman: 0,
    siege_hammer: 0,
  };
  private enemyItemCooldowns: Record<ItemId, number> = {
    bronze_sword: 0,
    plated_boots: 0,
    focus_crystal: 0,
    guard_shield: 0,
    rift_lens: 0,
    vitality_core: 0,
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
  private enemyAiTrace: EnemyHeroDecisionTrace = {
    intent: "Laning:spawn",
    targetId: null,
    targetX: null,
    targetY: null,
    speedMultiplier: null,
    reason: null,
  };
  private enemySkillCooldown = 1.8;
  private enemyGold = 0;
  private enemyXp = 0;
  private enemyLastHits = 0;
  private enemyPurchasedItems = new Set<string>();
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
  private playerCsStreak = 0;
  private playerMissedCs = 0;
  private playerXpGained = 0;
  private message = "Lane phase";
  private sequence = 0;
  private cameraZoom = DEFAULT_CAMERA_ZOOM;
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

    this.load.image("map-single-lane-rift", MAP_ASSETS.single_lane_rift.background);

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
    this.drawFountainZones();
    this.createAnimations();
    this.createVfxAnimations();
    this.createBuildings();
    this.createInitialUnits();
    this.createAimPreview();
    this.createInput();
    this.cameras.main.startFollow(this.getPlayerSprite(), true, 0.08, 0.08);
    this.setCameraZoom(DEFAULT_CAMERA_ZOOM);
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
    this.updateMinionAggro(dt);
    this.updateBaseRecovery(dt);
    this.updateRecallChannels(dt);
    this.updateShopState();
    this.updatePlayerInput(dt);
    this.updateEnemyHeroAI(dt);
    this.updateUnitAI(dt);
    this.updateTowerProjectiles(dt);
    this.updateBuildings(dt);
    this.resolvePendingDamageEvents();
    this.updateVfx(dt);
    this.resolveDeaths(dt);
    this.syncViews();
  }

  private drawMap() {
    const background = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "map-single-lane-rift");
    const scale = Math.max(WORLD_WIDTH / background.width, WORLD_HEIGHT / background.height);
    background.setScale(scale);
    background.setDepth(-120);
  }

  private drawFountainZones() {
    const zone = this.add.graphics().setDepth(-8);
    const drawZone = (point: Point, color: number) => {
      zone.fillStyle(color, 0.08);
      zone.fillCircle(point.x, point.y, FOUNTAIN_REGEN_RADIUS);
      zone.lineStyle(2, color, 0.28);
      zone.strokeCircle(point.x, point.y, FOUNTAIN_REGEN_RADIUS);
      zone.fillStyle(0xffffff, 0.08);
      zone.fillCircle(point.x, point.y, 18);
    };
    drawZone(FOUNTAIN_LAYOUT.azure, 0x66cfff);
    drawZone(FOUNTAIN_LAYOUT.crimson, 0xff675a);
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
      createBuilding("azure_outer_tower", "azure_outer_tower", "azure", "tower", BUILDING_LAYOUT.azure_outer_tower.x, BUILDING_LAYOUT.azure_outer_tower.y),
      createBuilding("crimson_outer_tower", "crimson_outer_tower", "crimson", "tower", BUILDING_LAYOUT.crimson_outer_tower.x, BUILDING_LAYOUT.crimson_outer_tower.y),
      createBuilding("azure_inhibitor", "azure_inhibitor", "azure", "inhibitor", BUILDING_LAYOUT.azure_inhibitor.x, BUILDING_LAYOUT.azure_inhibitor.y),
      createBuilding("crimson_inhibitor", "crimson_inhibitor", "crimson", "inhibitor", BUILDING_LAYOUT.crimson_inhibitor.x, BUILDING_LAYOUT.crimson_inhibitor.y),
      createBuilding("azure_core", "azure_core", "azure", "core", BUILDING_LAYOUT.azure_core.x, BUILDING_LAYOUT.azure_core.y),
      createBuilding("crimson_core", "crimson_core", "crimson", "core", BUILDING_LAYOUT.crimson_core.x, BUILDING_LAYOUT.crimson_core.y),
    ];

    for (const building of this.buildings) {
      const sprite = this.add
        .image(building.x, building.y, this.buildingTextureKey(building.assetId, "idle"))
        .setScale(building.type === "tower" ? 0.48 : building.type === "inhibitor" ? 0.3 : 0.42)
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
      createHero("player", "astra_vanguard", "azure", PLAYER_START.x, PLAYER_START.y),
      createHero("enemy_hero", "crimson_duelist", "crimson", ENEMY_START.x, ENEMY_START.y),
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
      const action = resolveKeyboardDownAction({
        key: event.key,
        repeat: event.repeat,
        ctrlKey: event.ctrlKey,
        settingsOpen: this.settingsOpen,
      });
      if (action.preventDefault) event.preventDefault();
      if (action.kind === "openScoreboard") this.scoreboardOpen = true;
      if (action.kind === "escape") this.handleEscapeKey();
      if (action.kind === "toggleShop") this.toggleShop();
      if (action.kind === "upgradeSkill") this.tryUpgradeSkill(action.skill);
      if (action.syncViews) this.syncViews();
    });

    keyboard.on("keyup", (event: KeyboardEvent) => {
      const action = resolveKeyboardUpAction(event.key);
      if (action.preventDefault) event.preventDefault();
      if (action.kind === "closeScoreboard") this.scoreboardOpen = false;
      if (action.syncViews) this.syncViews();
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.pointerWorld = this.toWorldPoint(pointer);
    });

    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const direction = deltaY > 0 ? -1 : 1;
      this.setCameraZoom(this.cameraZoom + direction * CAMERA_ZOOM_STEP);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const player = this.getPlayer();
      const worldPoint = this.toWorldPoint(pointer);
      this.pointerWorld = worldPoint;
      const action = resolvePointerDownAction({
        hasPendingSkill: Boolean(this.pendingSkill),
        leftButtonDown: pointer.leftButtonDown(),
        playerAlive: player.alive,
        modalOpen: this.isModalOpen(),
        targetUnit: this.pickEnemyUnit(worldPoint, player.team),
        targetBuilding: this.pickEnemyBuilding(worldPoint, player.team),
        attackMove: Boolean(this.keys?.a.isDown),
      });
      if (action.kind === "confirmPendingSkill") {
        this.castPendingSkill(worldPoint);
        this.syncViews();
      }
      if (action.kind === "cancelPendingSkill") {
        this.cancelPendingSkill();
        this.syncViews();
      }
      if (action.kind === "attackUnit") this.commandAttackUnit(player, action.target);
      if (action.kind === "attackBuilding") this.commandAttackBuilding(player, action.building);
      if (action.kind === "move") this.commandMove(player, worldPoint, action.attackMove);
    });
  }

  private exposeTestHooks() {
    installGameCommandDispatcher(this as unknown as GameCommandAdapter);
    installMobaDebugApi(this as unknown as MobaDebugAdapter);
  }

  private updateCooldowns(dt: number) {
    tickSkillCooldowns(this.playerCooldowns, dt);
    tickItemCooldowns(this.itemCooldowns, dt);
    tickItemCooldowns(this.enemyItemCooldowns, dt);
  }

  private updateStatusEffects(dt: number) {
    for (const unit of this.units) {
      const tick = tickUnitStatusEffects(unit, dt);
      if (unit.id === "player" && tick.actionReady) this.activeCastSkill = null;
    }
  }

  private updateQueuedSkill(dt: number) {
    const player = this.getPlayer();
    const decision = resolveQueuedSkillTick({
      queuedSkill: this.queuedSkill,
      queuedSkillTimer: this.queuedSkillTimer,
      dt,
      result: this.result,
      player,
      modalOpen: this.isModalOpen(),
    });
    this.queuedSkillTimer = decision.timer;
    if (decision.kind === "clear") return this.clearQueuedSkill(decision.message);
    if (decision.kind !== "cast") return;
    const aimPoint = this.queuedSkillAim ?? this.pointerWorld;
    this.clearQueuedSkill();
    this.castPlayerSkill(decision.skill, aimPoint, false);
  }

  private updateTowerAggro(dt: number) {
    tickTowerAggro(this.towerHeroAggro, this.units, dt);
  }

  private updateMinionAggro(dt: number) {
    tickMinionAggro(this.units, dt);
  }

  private updateBaseRecovery(dt: number) {
    for (const unit of this.units) {
      applyBaseRecovery(unit, dt);
    }
  }

  private updateRecallChannels(dt: number) {
    for (const unit of this.units) {
      const recall = tickRecallChannel(unit, dt, this.fountainPointForTeam(unit.team));
      if (!recall.completed) continue;
      const enemyPurchased = unit.id === "enemy_hero" && this.tryEnemyPurchaseAtBase(unit);
      this.spawnVfx(unit.team === "azure" ? "vfx-astra-w_shield_pulse" : "vfx-crimson-q_spear_thrust", unit.x, unit.y - 10, 1);
      this.message = unit.id === "player" ? "Recall complete" : enemyPurchased ? this.message : "Crimson recalled";
    }
  }

  private updateShopState() {
    if (!this.shopOpen) return;
    const player = this.getPlayer();
    const transition = resolveShopAutoClose({
      shopOpen: this.shopOpen,
      result: this.result,
      playerAlive: player.alive,
      playerInShop: this.isPlayerInShop(),
    });
    this.shopOpen = transition.shopOpen;
    if (transition.message) this.message = transition.message;
  }

  private isModalOpen() {
    return isAnyModalOpen({
      shopOpen: this.shopOpen,
      scoreboardOpen: this.scoreboardOpen,
      settingsOpen: this.settingsOpen,
    });
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
    const action = resolveEscapeKeyAction({
      hasQueuedSkill: Boolean(this.queuedSkill),
      hasPendingSkill: Boolean(this.pendingSkill),
      shopOpen: this.shopOpen,
      settingsOpen: this.settingsOpen,
    });
    if (action === "clearQueuedSkill") return this.clearQueuedSkill("Cast buffer cancelled");
    if (action === "cancelPendingSkill") return this.cancelPendingSkill();
    if (action === "closeShop") return this.setShopOpen(false);
    if (action === "closeSettings") return this.setSettingsOpen(false);
    return this.setSettingsOpen(true);
  }

  private toggleShop() {
    return this.setShopOpen(!this.shopOpen);
  }

  private setShopOpen(open: boolean) {
    const player = this.getPlayer();
    return this.applyModalTransition(
      resolveShopTransition(
        { shopOpen: this.shopOpen, settingsOpen: this.settingsOpen },
        open,
        { playerAlive: player.alive, playerInShop: this.isPlayerInShop() },
      ),
    );
  }

  toggleSettings() {
    return this.setSettingsOpen(!this.settingsOpen);
  }

  private setSettingsOpen(open: boolean) {
    return this.applyModalTransition(resolveSettingsTransition({ shopOpen: this.shopOpen, settingsOpen: this.settingsOpen }, open));
  }

  private applyModalTransition(transition: ModalTransition) {
    this.shopOpen = transition.shopOpen;
    this.settingsOpen = transition.settingsOpen;
    if (transition.cancelPendingSkill) this.cancelPendingSkill();
    if (transition.clearQueuedSkill) this.clearQueuedSkill();
    this.message = transition.message;
    return transition.success;
  }

  setQuickCast(enabled: boolean) {
    this.quickCast = enabled;
    if (enabled) this.cancelPendingSkill();
    this.clearQueuedSkill();
    this.message = enabled ? "Quick Cast enabled" : "Normal Cast enabled";
    return this.quickCast;
  }

  setRangeIndicators(enabled: boolean) {
    this.showRangeIndicators = enabled;
    this.message = enabled ? "Range indicators enabled" : "Range indicators hidden";
    return this.showRangeIndicators;
  }

  setEnemyGold(gold: number) {
    this.enemyGold = Math.max(0, Math.floor(gold));
    this.message = `Enemy gold set to ${this.enemyGold}`;
    return this.enemyGold;
  }

  private startRecall(unit: Unit) {
    if (!unit.alive || unit.kind !== "hero") return false;
    if (unit.id === "player" && !this.canStartPlayerAction(unit)) return false;
    if (unit.recallTimer > 0) return false;
    const nearestEnemy = findNearestEnemyUnitRule(this.units, unit, 260);
    if (nearestEnemy) {
      this.message = "Too close to enemies";
      return false;
    }
    if (!beginRecallChannel(unit)) return false;
    if (unit.id === "player") this.clearQueuedSkill();
    this.spawnVfx(unit.team === "azure" ? "vfx-astra-w_shield_pulse" : "vfx-crimson-q_spear_thrust", unit.x, unit.y - 6, 0.9);
    this.message = unit.id === "player" ? "Recalling" : "Crimson recall";
    return true;
  }

  private cancelRecall(unit: Unit, message?: string) {
    if (unit.recallTimer <= 0) return;
    unit.recallTimer = 0;
    if (message && unit.id === "player") this.message = message;
  }

  private toWorldPoint(pointer: Phaser.Input.Pointer): Point {
    const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return { x: clamp(worldPoint.x, 80, WORLD_WIDTH - 80), y: clamp(worldPoint.y, 90, WORLD_HEIGHT - 90) };
  }

  private commandMove(player: Unit, point: Point, attackMove: boolean) {
    this.cancelRecall(player, "Recall interrupted");
    this.message = applyMoveCommand(player, point, attackMove);
  }

  private commandAttackUnit(player: Unit, target: Unit) {
    this.cancelRecall(player, "Recall interrupted");
    this.message = applyAttackUnitCommand(player, target);
  }

  private commandAttackBuilding(player: Unit, building: Building) {
    this.cancelRecall(player, "Recall interrupted");
    this.message = applyAttackBuildingCommand(player, building);
  }

  private updatePlayerAttackCommands(player: Unit, dt: number) {
    const decision = resolvePlayerAttackCommand(player, this.units, this.buildings);
    return applyPlayerAttackCommandDecision(player, decision, {
      attackUnit: (target) => {
        this.tryUnitAttack(player, true, target);
        if (player.actionTimer <= 0) player.action = "idle";
      },
      attackBuilding: (building) => {
        this.attackBuilding(player, building);
        if (player.actionTimer <= 0) player.action = "idle";
      },
      attackMoveTarget: (target) => this.commandAttackUnit(player, target),
      move: (direction) => moveUnit(player, direction.x, direction.y, player.speed, dt),
    });
  }

  private pickEnemyUnit(point: Point, team: Team) {
    return pickEnemyUnitAtPoint(this.units, point, team);
  }

  private pickEnemyBuilding(point: Point, team: Team) {
    return pickEnemyBuildingAtPoint(this.buildings, point, team);
  }

  private updatePlayerInput(dt: number) {
    const player = this.getPlayer();
    if (!this.keys) return;
    const inputBlock = resolvePlayerInputBlockDecision(player, this.isModalOpen());
    if (inputBlock.kind === "dead") {
      this.cancelPendingSkill();
      this.clearQueuedSkill();
      return;
    }
    if (inputBlock.kind === "modal") {
      player.action = inputBlock.action;
      return;
    }

    const axisX = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const axisY = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    for (const action of collectPlayerInputTickActions({
      ctrlDown: this.keys.ctrl.isDown,
      qJustDown: Phaser.Input.Keyboard.JustDown(this.keys.q),
      wJustDown: Phaser.Input.Keyboard.JustDown(this.keys.w),
      eJustDown: Phaser.Input.Keyboard.JustDown(this.keys.e),
      rJustDown: Phaser.Input.Keyboard.JustDown(this.keys.r),
      oneJustDown: Phaser.Input.Keyboard.JustDown(this.keys.one),
      twoJustDown: Phaser.Input.Keyboard.JustDown(this.keys.two),
      threeJustDown: Phaser.Input.Keyboard.JustDown(this.keys.three),
      fourJustDown: Phaser.Input.Keyboard.JustDown(this.keys.four),
      recallJustDown: Phaser.Input.Keyboard.JustDown(this.keys.b),
      manualAttackJustDown: Phaser.Input.Keyboard.JustDown(this.keys.space),
      fullscreenJustDown: Phaser.Input.Keyboard.JustDown(this.keys.f),
    })) {
      if (action.kind === "activateSkill") this.activatePlayerSkill(action.skill);
      if (action.kind === "useItemSlot") this.useItemSlot(action.slot);
      if (action.kind === "startRecall") this.startRecall(player);
      if (action.kind === "manualAttack") this.tryUnitAttack(player, true);
      if (action.kind === "toggleFullscreen") this.toggleFullscreen();
    }

    const axisDecision = resolveAxisMovementDecision({
      axisX,
      axisY,
      recalling: player.recallTimer > 0,
      hasPendingSkill: Boolean(this.pendingSkill),
      castingLocked: player.action === "cast" && player.actionTimer > 0,
    });
    if (axisDecision.cancelRecall) this.cancelRecall(player, "Recall interrupted");
    if (axisDecision.cancelPendingSkill) this.cancelPendingSkill();
    if (axisDecision.action.kind === "castingLocked") return;
    if (axisDecision.action.kind === "move") {
      moveUnit(player, axisDecision.action.direction.x, axisDecision.action.direction.y, player.speed, dt);
      clearUnitCommandsRule(player);
      return;
    }

    if (this.updatePlayerAttackCommands(player, dt)) return;

    const targetPointDecision = resolveTargetPointMovementDecision(player);
    if (targetPointDecision.kind === "clearAttackMovePoint") {
      player.attackMovePoint = undefined;
      player.targetPoint = undefined;
      player.action = "idle";
    }
    if (targetPointDecision.kind === "clearTargetPoint") {
      player.targetPoint = undefined;
      player.action = "idle";
    }
    if (targetPointDecision.kind === "move") {
      moveUnit(player, targetPointDecision.direction.x, targetPointDecision.direction.y, player.speed, dt);
    }
    if (targetPointDecision.kind === "idle") {
      player.action = "idle";
    }
  }

  private updateEnemyHeroAI(dt: number) {
    const enemy = this.units.find((unit) => unit.id === "enemy_hero");
    if (!enemy || !enemy.alive) return;
    const player = this.getPlayer();
    this.enemySkillCooldown = Math.max(0, this.enemySkillCooldown - dt);
    const decision = decideEnemyHeroAction(createEnemyHeroDecisionInput({
      enemy,
      player,
      units: this.units,
      buildings: this.buildings,
      waveNumber: this.waveNumber,
      enemySkillCooldown: this.enemySkillCooldown,
      enemyGold: this.enemyGold,
      itemBreakpointGold: this.nextEnemyItemCost(),
      enemyItems: this.enemyPurchasedItems,
      enemyItemCooldowns: this.enemyItemCooldowns,
    }));
    this.enemyAiState = decision.state;
    const nextTrace = traceEnemyHeroDecision(decision);
    if (decision.kind === "recalling" && this.enemyAiTrace.reason?.endsWith("_recall")) {
      nextTrace.reason = this.enemyAiTrace.reason;
    }
    this.enemyAiTrace = nextTrace;

    if (decision.kind === "recalling") return;
    if (decision.kind === "startRecall") {
      this.startRecall(enemy);
      return;
    }
    if (decision.kind === "harass") {
      this.castEnemyHarass(enemy, player);
      return;
    }
    if (decision.kind === "useItem") {
      this.useEnemyItem(enemy, decision.itemId, decision.targetBuilding);
      return;
    }
    if (decision.kind === "attackUnit") {
      this.tryUnitAttack(enemy, false, decision.target);
      return;
    }

    const dir = normalize(decision.target.x - enemy.x, decision.target.y - enemy.y);
    moveUnit(enemy, dir.x, dir.y, enemy.speed * decision.speedMultiplier, dt);
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
      mark: 2.4,
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

      const decision = decideMinionAction({
        minion: unit,
        units: this.units,
        buildings: this.buildings,
        laneGoal: laneReturnTargetForUnit(unit),
      });
      if (decision.kind === "attackUnit") {
        this.tryUnitAttack(unit, false, decision.target);
        continue;
      }
      if (decision.kind === "chaseUnit") {
        const dir = normalize(decision.target.x - unit.x, decision.target.y - unit.y);
        moveUnit(unit, dir.x, dir.y, unit.speed, dt);
        continue;
      }
      if (decision.kind === "attackBuilding") {
        this.attackBuilding(unit, decision.building);
        continue;
      }
      const dir = normalize(decision.target.x - unit.x, decision.target.y - unit.y);
      moveUnit(unit, dir.x, dir.y, unit.speed, dt);
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
      this.spawnTowerProjectile(attack.towerId, attack.targetId, attack.sourceTeam);
      this.message = attack.message;
    }
  }

  private updateTowerProjectiles(dt: number) {
    for (const projectile of this.towerProjectiles) {
      projectile.elapsed += dt;
      const progress = clamp(projectile.elapsed / projectile.duration, 0, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      const x = projectile.start.x + (projectile.end.x - projectile.start.x) * eased;
      const y = projectile.start.y + (projectile.end.y - projectile.start.y) * eased - Math.sin(progress * Math.PI) * TOWER_PROJECTILE_ARC_HEIGHT;
      const alpha = 0.92 - progress * 0.18;
      projectile.orb.setPosition(x, y).setAlpha(alpha);
      projectile.glow.setPosition(x, y).setAlpha(0.28 * (1 - progress * 0.35));
      projectile.orb.setDepth(y + 240);
      projectile.glow.setDepth(y + 238);
    }

    const expired = this.towerProjectiles.filter((projectile) => projectile.elapsed >= projectile.duration);
    for (const projectile of expired) {
      projectile.orb.destroy();
      projectile.glow.destroy();
    }
    this.towerProjectiles = this.towerProjectiles.filter((projectile) => projectile.elapsed < projectile.duration);
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
    const { due, pending } = drainDueDamageEvents(this.pendingDamageEvents, this.elapsed);
    this.pendingDamageEvents = pending;
    for (const event of due) {
      const dispatch = resolvePendingDamageEventDispatch(event, this.units, this.buildings);
      if (!dispatch) continue;
      if (dispatch.vfx) this.spawnVfx(dispatch.vfx.key, dispatch.vfx.x, dispatch.vfx.y, dispatch.vfx.scale);
      const { action, effects } = dispatch;
      if (action.kind === "unit") this.applyAbilityDamageToUnit(action.target, action.damage, action.sourceTeam, action.sourceId, effects);
      if (action.kind === "building") this.applyBuildingDamage(action.building, action.amount);
      if (action.kind === "circle") {
        this.applyAreaDamage(resolveAreaDamageApplication({
          shape: { kind: "circle", center: action.center, radius: action.radius },
          units: this.units,
          buildings: this.buildings,
          damage: action.damage,
          sourceTeam: action.sourceTeam,
          sourceId: action.sourceId,
          effects,
          buildingDamageMultiplier: action.buildingDamageMultiplier,
        }));
      }
      if (action.kind === "cone") {
        this.applyAreaDamage(resolveAreaDamageApplication({
          shape: { kind: "cone", origin: action.origin, direction: action.direction, range: action.range, halfAngleDeg: action.halfAngleDeg },
          units: this.units,
          buildings: this.buildings,
          damage: action.damage,
          sourceTeam: action.sourceTeam,
          sourceId: action.sourceId,
          effects,
          buildingDamageMultiplier: action.buildingDamageMultiplier,
        }));
      }
    }
  }

  private activatePlayerSkill(skill: SkillKey) {
    const player = this.getPlayer();
    if (this.isPlayerCastingLocked(player)) return this.queuePlayerSkill(skill);
    if (this.quickCast) return this.castPlayerSkill(skill);
    if (!this.canStartPlayerAction(player)) return false;
    if (!this.canAttemptSkill(player, skill)) return false;
    this.pendingSkill = skill;
    clearUnitCommandsRule(player);
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
    const decision = this.playerActionStartDecision(player);
    if (decision.message) this.message = decision.message;
    return decision.allowed;
  }

  private playerActionStartDecision(player: Unit) {
    return resolvePlayerActionStartDecision({
      result: this.result,
      playerAlive: player.alive,
      modalOpen: this.isModalOpen(),
      modalBlockReason: this.inputBlockedReason(player),
      castingLocked: this.isPlayerCastingLocked(player),
    });
  }

  private canAttemptSkillSilently(player: Unit, skill: SkillKey) {
    return !playerSkillAttemptFailure({ player, skill, cooldown: this.playerCooldowns[skill] });
  }

  private canAttemptSkill(player: Unit, skill: SkillKey) {
    const failure = playerSkillAttemptFailure({ player, skill, cooldown: this.playerCooldowns[skill] });
    if (!failure) return true;
    this.message = failure;
    return false;
  }

  private queuePlayerSkill(skill: SkillKey, aimPoint = this.pointerWorld) {
    const player = this.getPlayer();
    if (!player.alive || this.result !== "playing" || this.isModalOpen()) return this.canStartPlayerAction(player);
    if (!this.canAttemptSkill(player, skill)) return false;
    const application = applyQueuedPlayerSkillState(player, skill, aimPoint);
    this.pendingSkill = application.pendingSkill;
    this.queuedSkill = application.queuedSkill;
    this.queuedSkillAim = application.queuedSkillAim;
    this.queuedSkillTimer = application.queuedSkillTimer;
    this.message = application.message;
    return true;
  }

  private castPlayerSkill(skill: SkillKey, aimPoint = this.pointerWorld, allowQueue = true) {
    const player = this.getPlayer();
    if (this.isPlayerCastingLocked(player) && allowQueue) return this.queuePlayerSkill(skill, aimPoint);
    if (!this.canStartPlayerAction(player)) return false;
    if (!this.canAttemptSkill(player, skill)) return false;
    const level = playerSkillLevel(player, skill);
    const dir = this.getPlayerAimDirection(player, aimPoint);
    const castDraft = createPlayerSkillCastDraft({
      player,
      skill,
      level,
      direction: dir,
      elapsed: this.elapsed,
    });
    this.pendingSkill = null;
    this.clearQueuedSkill();
    this.cancelRecall(player, "Recall interrupted");
    const application = applyPlayerSkillCastState({
      player,
      skill,
      direction: dir,
      cooldown: this.skillCooldown(player, skill),
      cooldowns: this.playerCooldowns,
      draft: castDraft,
    });
    this.activeCastSkill = application.activeCastSkill;

    for (const vfx of application.immediateVfx) this.spawnVfx(vfx.key, vfx.x, vfx.y, vfx.scale);
    for (const event of application.damageEvents) {
      this.queueDamageEvent({
        id: `skill_${skill}_${this.sequence += 1}`,
        ...event,
      });
    }
    this.message = application.message;
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
    const current = playerSkillLevel(player, skill);
    if (current >= this.maxSkillLevel(skill)) {
      this.message = "Skill already maxed";
      return false;
    }
    player.skillLevels[skill] = current + 1;
    player.skillPoints -= 1;
    this.message = `${skill.toUpperCase()} upgraded`;
    return true;
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
    return vectorFromDirection(player.lastDirection);
  }

  private tryUnitAttack(attacker: Unit, manual: boolean, forcedTarget?: Unit) {
    if (!attacker.alive || attacker.attackTimer > 0) return false;
    if (attacker.kind === "hero" && attacker.action === "cast" && attacker.actionTimer > 0) return false;
    this.cancelRecall(attacker, "Recall interrupted");
    const target = forcedTarget ?? findNearestEnemyUnitRule(this.units, attacker, attacker.attackRange + 16);
    if (target) {
      attacker.attackTimer = attacker.attackCooldown;
      attacker.action = "basic_attack";
      attacker.actionTimer = 0.46;
      attacker.lastDirection = directionFromVector(target.x - attacker.x, target.y - attacker.y);
      this.queueDamageEvent(createUnitAttackDamageEvent({
        id: `attack_${attacker.id}_${this.sequence += 1}`,
        triggerAt: this.elapsed + this.attackWindup(attacker),
        attacker,
        target,
      }));
      return true;
    }

    const building = findNearestAttackableBuildingRule(attacker, this.buildings, attacker.attackRange + 34);
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
    this.queueDamageEvent(createBuildingAttackDamageEvent({
      id: `attack_building_${attacker.id}_${this.sequence += 1}`,
      triggerAt: this.elapsed + this.attackWindup(attacker),
      attacker,
      building,
      structureDamageMultiplier: structureDamageMultiplier(attacker.team, building, this.units),
    }));
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
    const damagePlan = resolveAbilityDamagePlan(target, baseDamage, effects);
    const beforeAlive = target.alive;
    this.damageUnit(target, damagePlan.damage, sourceTeam, sourceId);
    if (beforeAlive && !target.alive) this.grantEnemyLastHitEconomy(target, sourceId);
    const postDamage = resolveAbilityPostDamageApplication({
      targetAlive: target.alive,
      consumedMark: damagePlan.consumedMark,
      sourceId,
      effects,
    });
    if (!postDamage) return;
    if (postDamage.clearMark) {
      target.markTimer = 0;
    }
    if (postDamage.cooldownRefund) this.applyCooldownRefund(postDamage.cooldownRefund);
    if (postDamage.vfx) this.spawnVfx(postDamage.vfx.key, target.x, target.y + postDamage.vfx.yOffset, postDamage.vfx.scale);
    if (postDamage.message) this.message = postDamage.message;
    if (postDamage.mark) this.applyMark(target, postDamage.mark);
    if (postDamage.slow) this.applySlow(target, postDamage.slow.multiplier, postDamage.slow.duration);
    if (postDamage.root) this.applyRoot(target, postDamage.root);
    if (postDamage.knockback) this.knockbackUnit(target, this.getEffectOrigin(sourceId, target), postDamage.knockback);
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

  private applyAreaDamage(application: AreaDamageApplication) {
    for (const unit of application.units) {
      this.applyAbilityDamageToUnit(unit, application.unitDamage, application.sourceTeam, application.sourceId, application.effects);
      if (application.knockback && unit.alive) this.knockbackUnit(unit, application.knockback.origin, application.knockback.distance);
    }
    for (const building of application.buildings) {
      this.applyBuildingDamage(building, application.buildingDamage);
    }
  }

  private damageUnit(target: Unit, amount: number, sourceTeam: Team, sourceId?: string) {
    if (!target.alive) return;
    this.cancelRecall(target, target.id === "player" ? "Recall interrupted" : undefined);
    const player = this.getPlayer();
    const missedCsCandidate = sourceId !== "player" && target.team !== player.team && target.kind !== "hero" && shouldShowMissedCs({ unit: target, player, buildings: this.buildings });
    const result = applyUnitDamageResolution(target, amount);
    if (!result.applied) return;
    const calledMinions = callMinionAggroOnHeroDamage({ target, sourceId, units: this.units, damage: amount });
    if (calledMinions > 0 && sourceId === "player") this.message = `Minion aggro ${calledMinions}`;
    this.flashUnit(target);
    this.showDamageNumber(target.x, target.y - 58, Math.round(amount), sourceTeam);
    if (result.died) {
      this.handleUnitDeath(target, sourceTeam, sourceId, missedCsCandidate);
    } else {
      this.registerTowerHeroAggro(target, sourceId);
    }
  }

  private applyBuildingDamage(building: Building, amount: number) {
    const application = applyBuildingDamageApplication(building, this.buildings, amount);
    if (!application.applied) return;
    this.flashBuilding(building);
    this.showDamageNumber(building.x, building.y - 118, Math.round(amount), application.damageNumberTeam ?? "azure");
    if (application.message) this.message = application.message;
    if (application.outcome) this.endGame(application.outcome);
  }

  private handleUnitDeath(target: Unit, sourceTeam: Team, sourceId?: string, missedCsCandidate = false) {
    if (sourceTeam === "azure") this.azureKills += 1;
    if (sourceTeam === "crimson") this.crimsonKills += 1;
    if (target.kind === "hero") this.handleHeroDeath(target, sourceTeam);
    const player = this.getPlayer();
    if (target.team !== player.team && distance(player, target) <= PLAYER_XP_SHARE_RANGE) {
      this.grantPlayerExperience(target);
    }
    if (sourceId === "player" && target.team !== player.team) {
      this.grantPlayerLastHitGold(target);
    } else if (missedCsCandidate) {
      this.playerCsStreak = 0;
      this.playerMissedCs += 1;
      this.message = `CS missed · ${this.playerMissedCs}`;
    }
  }

  private handleHeroDeath(target: Unit, sourceTeam: Team) {
    this.cancelRecall(target, target.id === "player" ? "Recall interrupted" : undefined);
    prepareHeroDeathState(target);
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
        respawnHeroAt(unit, this.fountainPointForTeam(unit.team));
        this.message = unit.id === "player" ? "Astra respawned" : "Crimson respawned";
      }
    }
    this.units = this.units.filter((unit) => unit.kind === "hero" || unit.alive || unit.actionTimer > 0);
  }

  private grantPlayerExperience(target: Unit) {
    const player = this.getPlayer();
    const result = applyPlayerExperienceGain(player, target.kind);
    this.playerXpGained += result.xpGained;
    for (let i = 0; i < result.levelsGained; i += 1) {
      this.spawnVfx("vfx-astra-w_shield_pulse", player.x, player.y, 1);
    }
    if (result.levelsGained > 0) this.message = `Level ${result.finalLevel}`;
  }

  private grantPlayerLastHitGold(target: Unit) {
    const player = this.getPlayer();
    const result = applyPlayerLastHitGold(player, target.kind);
    this.playerLastHits += result.lastHitIncrement;
    if (result.lastHitIncrement > 0) this.playerCsStreak += 1;
    this.message = result.lastHitIncrement > 0 ? `${result.message} · streak ${this.playerCsStreak}` : result.message;
  }

  private grantEnemyLastHitEconomy(target: Unit, sourceId?: string) {
    const delta = enemyLastHitEconomyDelta(target, sourceId);
    this.enemyGold += delta.goldGained;
    this.enemyXp += delta.xpGained;
    this.enemyLastHits += delta.lastHitIncrement;
  }

  private nextEnemyItemId() {
    return ENEMY_ITEM_ORDER.find((itemId) => !this.enemyPurchasedItems.has(itemId)) ?? null;
  }

  private nextEnemyItemCost() {
    const itemId = this.nextEnemyItemId();
    return itemId ? ITEM_CATALOG[itemId].cost : null;
  }

  private tryEnemyPurchaseAtBase(enemy: Unit) {
    const itemId = this.nextEnemyItemId();
    if (!itemId || this.enemyGold < ITEM_CATALOG[itemId].cost) return false;
    enemy.gold = this.enemyGold;
    const result = tryPurchaseCatalogItem({
      player: enemy,
      itemId,
      purchasedItems: this.enemyPurchasedItems,
      shopAvailable: true,
    });
    this.enemyGold = enemy.gold;
    if (result.purchased) this.message = `Crimson bought ${ITEM_CATALOG[itemId].name}`;
    return result.purchased;
  }

  grantEnemyItem(itemId: ItemId) {
    const enemy = this.units.find((unit) => unit.id === "enemy_hero");
    if (!enemy || this.enemyPurchasedItems.has(itemId)) return false;
    const previousGold = this.enemyGold;
    enemy.gold = ITEM_CATALOG[itemId].cost;
    const result = tryPurchaseCatalogItem({
      player: enemy,
      itemId,
      purchasedItems: this.enemyPurchasedItems,
      shopAvailable: true,
    });
    enemy.gold = 0;
    this.enemyGold = previousGold;
    if (result.purchased) this.message = `Granted Crimson ${ITEM_CATALOG[itemId].name}`;
    return result.purchased;
  }

  private useEnemyItem(enemy: Unit, itemId: ItemId, demolishTarget?: Building) {
    const item = ITEM_CATALOG[itemId];
    if (!this.enemyPurchasedItems.has(itemId) || item.activeKind === "none" || this.enemyItemCooldowns[itemId] > 0) return false;
    const enemyCooldowns = { q: this.enemySkillCooldown, w: 0, e: 0, r: 0 };
    const effect = applyActiveItemEffect({
      kind: item.activeKind,
      itemId,
      player: enemy,
      playerCooldowns: enemyCooldowns,
      demolishTarget,
    });
    const application = resolveActiveItemUseApplication({
      effect,
      activeCooldown: item.activeCooldown,
      successMessage: `Crimson used ${item.activeLabel}`,
      cancelRecall: false,
    });
    if (!application.used) return false;
    this.enemySkillCooldown = enemyCooldowns.q;
    if (application.buildingDamage) this.applyBuildingDamage(application.buildingDamage.building, application.buildingDamage.damage);
    for (const vfx of application.vfx) this.spawnVfx(vfx.key, vfx.x, vfx.y, vfx.scale);
    if (application.cooldown !== undefined) this.enemyItemCooldowns[itemId] = application.cooldown;
    if (application.message) this.message = application.message;
    return true;
  }

  private buyItem(itemId: keyof typeof ITEM_CATALOG) {
    const player = this.getPlayer();
    const result = tryPurchaseCatalogItem({
      player,
      itemId,
      purchasedItems: this.purchasedItems,
      shopAvailable: this.isPlayerInShop(),
    });
    this.message = result.message;
    return result.purchased;
  }

  itemSlotAction(itemId: ItemId) {
    if (this.purchasedItems.has(itemId)) return this.useItem(itemId);
    return this.buyItem(itemId);
  }

  private useItemSlot(slot: number) {
    const itemId = itemIdForActiveSlot(slot);
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
    const gate = resolveActiveItemUseGate({
      activeKind: item.activeKind,
      owned: this.purchasedItems.has(itemId),
      actionStart: this.playerActionStartDecision(player),
      cooldown: this.itemCooldowns[itemId],
    });
    if (!gate.allowed) {
      if (gate.message) this.message = gate.message;
      return false;
    }
    const effect = applyActiveItemEffect({
      kind: item.activeKind,
      itemId,
      player,
      playerCooldowns: this.playerCooldowns,
      demolishTarget: item.activeKind === "demolish" ? findNearestAttackableBuildingRule(player, this.buildings, 250) : undefined,
    });
    const application = resolveActiveItemUseApplication({
      effect,
      activeCooldown: item.activeCooldown,
      successMessage: `${item.activeLabel} activated`,
      cancelRecall: true,
    });
    if (!application.used) {
      if (application.message) this.message = application.message;
      return false;
    }
    if (application.buildingDamage) this.applyBuildingDamage(application.buildingDamage.building, application.buildingDamage.damage);
    for (const vfx of application.vfx) this.spawnVfx(vfx.key, vfx.x, vfx.y, vfx.scale);
    if (application.cancelRecall) this.cancelRecall(player, "Recall interrupted");
    if (application.cooldown !== undefined) this.itemCooldowns[itemId] = application.cooldown;
    if (application.message) this.message = application.message;
    return true;
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
    const shape = createAimPreviewShape(player, skill, dir);
    if (shape.kind === "circle") {
      preview.lineStyle(2, 0x8fe7ff, 0.34);
      preview.fillStyle(0x4aa8ff, 0.06);
      preview.fillCircle(player.x, player.y, shape.radius);
      preview.strokeCircle(player.x, player.y, shape.radius);
      return;
    }
    if (shape.kind === "dash") {
      preview.lineStyle(7, 0x76d9ff, 0.18);
      preview.lineBetween(player.x, player.y, shape.end.x, shape.end.y);
      preview.lineStyle(2, 0xc4f6ff, 0.42);
      preview.strokeCircle(shape.end.x, shape.end.y, shape.radius);
      return;
    }
    preview.fillStyle(skill === "r" ? 0x9bd7ff : 0x76d9ff, skill === "r" ? 0.1 : 0.075);
    preview.fillTriangle(player.x, player.y, shape.left.x, shape.left.y, shape.right.x, shape.right.y);
    preview.lineStyle(2, skill === "r" ? 0xd7f4ff : 0x9feaff, skill === "r" ? 0.42 : 0.3);
    preview.lineBetween(player.x, player.y, shape.left.x, shape.left.y);
    preview.lineBetween(player.x, player.y, shape.right.x, shape.right.y);
    preview.lineStyle(1, 0xc8f6ff, 0.25);
    preview.lineBetween(player.x, player.y, shape.center.x, shape.center.y);
  }

  private activeAimSkill(): SkillKey | null {
    return resolveActiveAimSkill({
      pendingSkill: this.pendingSkill,
      showRangeIndicators: this.showRangeIndicators,
      keysAvailable: Boolean(this.keys),
      modalOpen: this.isModalOpen(),
      keys: {
        r: Boolean(this.keys?.r.isDown),
        e: Boolean(this.keys?.e.isDown),
        w: Boolean(this.keys?.w.isDown),
        q: Boolean(this.keys?.q.isDown),
      },
    });
  }

  private drawTowerRanges() {
    const range = this.add.graphics().setDepth(-5);
    for (const building of this.buildings.filter((candidate) => candidate.type === "tower")) {
      const radius = towerAttackDisplayRadius(building);
      range.lineStyle(3, building.team === "azure" ? 0x4aa8ff : 0xff5448, 0.42);
      range.strokeCircle(building.x, building.y, radius);
      range.fillStyle(building.team === "azure" ? 0x4aa8ff : 0xff5448, 0.06);
      range.fillCircle(building.x, building.y, radius);
    }
  }

  private syncUnitView(unit: Unit) {
    const sprite = this.unitSprites.get(unit.id);
    const bar = this.unitBars.get(unit.id);
    if (!sprite || !bar) return;
    sprite.setPosition(unit.x, unit.y);
    sprite.setDepth(unit.y);
    sprite.setAlpha(unit.alive ? 1 : 0.8);
    const action = visibleUnitAction(unit);
    const animKey = this.animationKey(unit.assetId, action, unit.lastDirection);
    if (sprite.anims.currentAnim?.key !== animKey) sprite.play(animKey, true);
    const effects = unitEffectLabels(unit, { player: this.getPlayer(), buildings: this.buildings });
    this.drawHealthBar(bar, unit.x, unit.y - 54 * UNIT_ASSETS[unit.assetId].scale, 58, unit.hp, unit.maxHp, unit.team, unit.shield, effects);
  }

  private syncBuildingView(building: Building) {
    const sprite = this.buildingSprites.get(building.id);
    const bar = this.buildingBars.get(building.id);
    if (!sprite || !bar) return;
    const state = buildingState(building);
    sprite.setTexture(this.buildingTextureKey(building.assetId, state));
    sprite.setPosition(building.x, building.y);
    sprite.setDepth(building.y - 40);
    this.drawHealthBar(
      bar,
      building.x,
      building.y - (building.type === "tower" ? 190 : building.type === "inhibitor" ? 105 : 120),
      120,
      building.hp,
      building.maxHp,
      building.team,
      0,
    );
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
    if (effects.includes("aggro")) {
      graphics.fillStyle(0xd98dff, 0.9);
      graphics.fillRoundedRect(x - width / 2 + 1, y + 20, width - 2, 3, 2);
    }
    if (effects.includes("tower-setup")) {
      graphics.lineStyle(2, 0x67d9ff, 0.86);
      graphics.strokeRoundedRect(x - width / 2 - 2, y - 2, width + 4, 11, 4);
      graphics.fillStyle(0x67d9ff, 0.88);
      graphics.fillRoundedRect(x - width / 2 + 1, y + 25, width - 2, 3, 2);
    }
    if (effects.includes("last-hit")) {
      graphics.lineStyle(2, 0xffd76a, 0.96);
      graphics.strokeRoundedRect(x - width / 2 - 3, y - 3, width + 6, 13, 5);
      graphics.fillStyle(0xffd76a, 0.95);
      graphics.fillRoundedRect(x - width / 2 + 1, y + 25, width - 2, 3, 2);
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
    if (this.isInhibitorDestroyed("crimson")) {
      wave.push(this.makeMinion("azure_super_minion", "azure", "super", LANE_START.x - 184, LANE_START.y + 188));
    }
    if (this.isInhibitorDestroyed("azure")) {
      wave.push(this.makeMinion("crimson_super_minion", "crimson", "super", LANE_END.x + 196, LANE_END.y - 186));
    }
    this.units.push(...wave);
    for (const unit of wave) this.createUnitView(unit);
    const superWave = wave.some((unit) => unit.kind === "super");
    this.message = superWave ? "Super minion wave spawned" : this.waveNumber % 3 === 0 ? "Siege wave spawned" : "Minion wave spawned";
  }

  private makeMinion(assetId: string, team: Team, kind: Exclude<UnitKind, "hero">, x: number, y: number): Unit {
    this.sequence += 1;
    return createMinion(`${assetId}_${this.sequence}`, assetId, team, kind, x, y, Phaser.Math.FloatBetween(0, 0.35));
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

  private spawnVfx(animationKey: string, x: number, y: number, scale: number) {
    const texture = animationKey.startsWith("vfx-astra") ? "vfx-astra" : "vfx-crimson";
    const sprite = this.add.sprite(x, y, texture).setScale(scale).setDepth(y + 180).play(animationKey);
    this.vfx.push({ id: `${animationKey}_${this.elapsed}_${this.vfx.length}`, sprite, ttl: 0.48 });
  }

  private spawnTowerProjectile(towerId: string, targetId: string, sourceTeam: Team) {
    const tower = this.buildings.find((building) => building.id === towerId);
    const target = this.units.find((unit) => unit.id === targetId);
    if (!tower || !target) return;
    const color = sourceTeam === "azure" ? 0x7edcff : 0xff6b57;
    const highlight = sourceTeam === "azure" ? 0xe8fbff : 0xffdccf;
    const start = { x: tower.x, y: tower.y - (tower.type === "tower" ? 128 : 86) };
    const end = { x: target.x, y: target.y - Math.max(18, target.radius * 0.5) };
    const glow = this.add.circle(start.x, start.y, 15, color, 0.26).setDepth(start.y + 238);
    const orb = this.add.circle(start.x, start.y, 6, highlight, 0.94).setStrokeStyle(3, color, 0.88).setDepth(start.y + 240);
    this.towerProjectiles.push({
      id: `tower_projectile_${this.sequence += 1}`,
      orb,
      glow,
      start,
      end,
      elapsed: 0,
      duration: TOWER_ATTACK_WINDUP,
    });
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

  private fountainPointForTeam(team: Team): Point {
    return FOUNTAIN_LAYOUT[team];
  }

  setCameraZoom(zoom: number) {
    this.cameraZoom = clamp(zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    this.cameras.main.setZoom(this.cameraZoom);
    return this.cameraZoom;
  }

  getCameraZoom() {
    return this.cameraZoom;
  }

  private isPlayerInShop() {
    return distance(this.getPlayer(), this.getBuilding("azure_core")) <= 390;
  }

  private isInhibitorDestroyed(team: Team) {
    return (this.buildings.find((building) => building.id === `${team}_inhibitor`)?.hp ?? 0) <= 0;
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
      playerCsStreak: this.playerCsStreak,
      playerMissedCs: this.playerMissedCs,
      enemyLastHits: this.enemyLastHits,
      playerDeaths: this.playerDeaths,
      enemyDeaths: this.enemyDeaths,
      enemyGold: this.enemyGold,
      enemyXp: this.enemyXp,
      enemySkillCooldown: this.enemySkillCooldown,
      enemyAiState: this.enemyAiState,
      enemyAiTrace: this.enemyAiTrace,
      player,
      playerCooldowns: this.playerCooldowns,
      itemCooldowns: this.itemCooldowns,
      purchasedItems: this.purchasedItems,
      enemyPurchasedItems: this.enemyPurchasedItems,
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
      towerHeroAggro: this.towerHeroAggro,
      activeVfx: this.vfx.length + this.towerProjectiles.length,
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
