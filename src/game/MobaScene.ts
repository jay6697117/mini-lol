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
import type { BuildingSnapshot, GameResult, GameSnapshot, UnitSnapshot } from "./types";
import { updateHud } from "../ui/hud";

interface Point {
  x: number;
  y: number;
}

interface Unit {
  id: string;
  assetId: string;
  team: Team;
  kind: "hero" | "melee" | "caster";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shield: number;
  level: number;
  xp: number;
  gold: number;
  speed: number;
  radius: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  attackTimer: number;
  action: UnitAction;
  actionTimer: number;
  lastDirection: Direction;
  targetPoint?: Point;
  alive: boolean;
  respawnTimer: number;
}

interface Building {
  id: string;
  assetId: keyof typeof BUILDING_ASSETS;
  team: Team;
  type: "tower" | "core";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  attackTimer: number;
  attackFlash: number;
  radius: number;
}

interface VfxInstance {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  ttl: number;
}

type KeyMap = Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d" | "q" | "e" | "r" | "space" | "f", Phaser.Input.Keyboard.Key>;

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
      triggerVictory: () => void;
      triggerDefeat: () => void;
    };
  }
}

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 900;
const WAVE_INTERVAL = 25;
const LANE_START: Point = { x: 205, y: 690 };
const LANE_END: Point = { x: 1395, y: 220 };
const PLAYER_START: Point = { x: 485, y: 565 };
const ENEMY_START: Point = { x: 1085, y: 355 };
const PLAYER_COOLDOWNS = { q: 3.6, w: 8, e: 6, r: 24 };
const LEVEL_XP_REQUIREMENTS = [0, 280, 660, 1140, 1720, 2400];
const ITEM_CATALOG = {
  bronze_sword: { cost: 350, attackDamage: 18, moveSpeed: 0, maxHp: 0, maxMana: 0 },
  plated_boots: { cost: 300, attackDamage: 0, moveSpeed: 35, maxHp: 0, maxMana: 0 },
  focus_crystal: { cost: 400, attackDamage: 0, moveSpeed: 0, maxHp: 0, maxMana: 180 },
  guard_shield: { cost: 450, attackDamage: 0, moveSpeed: 0, maxHp: 140, maxMana: 0 },
  haste_talisman: { cost: 700, attackDamage: 12, moveSpeed: 12, maxHp: 0, maxMana: 0 },
  siege_hammer: { cost: 900, attackDamage: 28, moveSpeed: 0, maxHp: 0, maxMana: 0 },
} as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
const normalize = (x: number, y: number) => {
  const length = Math.hypot(x, y);
  return length > 0.0001 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
};

const directionFromVector = (dx: number, dy: number): Direction => {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return "south";
  const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
  if (angle >= 67.5 && angle < 112.5) return "south";
  if (angle >= 22.5 && angle < 67.5) return "south-east";
  if (angle >= -22.5 && angle < 22.5) return "east";
  if (angle >= -67.5 && angle < -22.5) return "north-east";
  if (angle >= -112.5 && angle < -67.5) return "north";
  if (angle >= -157.5 && angle < -112.5) return "north-west";
  if (angle >= 157.5 || angle < -157.5) return "west";
  return "south-west";
};

export class MobaScene extends Phaser.Scene {
  private keys?: KeyMap;
  private units: Unit[] = [];
  private buildings: Building[] = [];
  private unitSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private unitBars = new Map<string, Phaser.GameObjects.Graphics>();
  private buildingSprites = new Map<string, Phaser.GameObjects.Image>();
  private buildingBars = new Map<string, Phaser.GameObjects.Graphics>();
  private vfx: VfxInstance[] = [];
  private playerCooldowns = { q: 0, w: 0, e: 0, r: 0 };
  private purchasedItems = new Set<string>();
  private elapsed = 0;
  private waveTimer = WAVE_INTERVAL;
  private result: GameResult = "playing";
  private azureKills = 0;
  private crimsonKills = 0;
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
    this.updatePlayerInput(dt);
    this.updateEnemyHeroAI(dt);
    this.updateUnitAI(dt);
    this.updateBuildings(dt);
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

  private createInitialUnits() {
    this.units = [
      this.makeHero("player", "astra_vanguard", "azure", PLAYER_START.x, PLAYER_START.y),
      this.makeHero("enemy_hero", "crimson_duelist", "crimson", ENEMY_START.x, ENEMY_START.y),
    ];
    this.spawnWave();

    for (const unit of this.units) {
      this.createUnitView(unit);
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
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      f: Phaser.Input.Keyboard.KeyCodes.F,
    }) as KeyMap;

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const player = this.getPlayer();
      player.targetPoint = { x: clamp(worldPoint.x, 80, WORLD_WIDTH - 80), y: clamp(worldPoint.y, 90, WORLD_HEIGHT - 90) };
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
        this.message = "Astra reached level 6";
        this.syncViews();
      },
      buyItem: (itemId) => {
        const purchased = this.buyItem(itemId);
        this.syncViews();
        return purchased;
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
  }

  private updatePlayerInput(dt: number) {
    const player = this.getPlayer();
    if (!player.alive || !this.keys) return;

    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.castPlayerSkill("q");
    if (Phaser.Input.Keyboard.JustDown(this.keys.w)) this.castPlayerSkill("w");
    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) this.castPlayerSkill("e");
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.castPlayerSkill("r");
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) this.tryUnitAttack(player, true);
    if (Phaser.Input.Keyboard.JustDown(this.keys.f)) this.toggleFullscreen();

    const axisX = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const axisY = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    if (axisX !== 0 || axisY !== 0) {
      const dir = normalize(axisX, axisY);
      this.moveUnit(player, dir.x, dir.y, player.speed, dt);
      player.targetPoint = undefined;
      return;
    }

    if (player.targetPoint) {
      const dx = player.targetPoint.x - player.x;
      const dy = player.targetPoint.y - player.y;
      if (Math.hypot(dx, dy) < 8) {
        player.targetPoint = undefined;
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
    const gap = distance(enemy, player);
    if (gap < enemy.attackRange + player.radius) {
      this.tryUnitAttack(enemy, false);
      return;
    }
    const target = gap < 360 ? player : this.getLaneGoal(enemy.team);
    const dir = normalize(target.x - enemy.x, target.y - enemy.y);
    this.moveUnit(enemy, dir.x, dir.y, enemy.speed * 0.72, dt);
  }

  private updateUnitAI(dt: number) {
    for (const unit of this.units) {
      if (!unit.alive || unit.kind === "hero") {
        unit.attackTimer = Math.max(0, unit.attackTimer - dt);
        unit.actionTimer = Math.max(0, unit.actionTimer - dt);
        continue;
      }

      unit.attackTimer = Math.max(0, unit.attackTimer - dt);
      unit.actionTimer = Math.max(0, unit.actionTimer - dt);
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
    for (const building of this.buildings) {
      building.attackTimer = Math.max(0, building.attackTimer - dt);
      building.attackFlash = Math.max(0, building.attackFlash - dt);
      if (building.type !== "tower" || building.hp <= 0 || building.attackTimer > 0) continue;
      const target = this.findTowerTarget(building);
      if (!target) continue;
      building.attackTimer = building.attackCooldown;
      building.attackFlash = 0.32;
      this.damageUnit(target, building.attackDamage, building.team);
      this.spawnVfx(building.team === "azure" ? "vfx-astra-r_shockwave" : "vfx-crimson-q_spear_thrust", target.x, target.y - 12, 0.95);
      this.message = `${building.team === "azure" ? "Azure" : "Crimson"} tower fired`;
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

  private castPlayerSkill(skill: "q" | "w" | "e" | "r") {
    const player = this.getPlayer();
    if (!player.alive || this.playerCooldowns[skill] > 0) return;
    if (skill === "r" && player.level < 6) {
      this.message = "Ultimate locked";
      return;
    }

    const dir = this.directionVector(player.lastDirection);
    this.playerCooldowns[skill] = PLAYER_COOLDOWNS[skill];
    player.action = "cast";
    player.actionTimer = 0.42;

    if (skill === "q") {
      this.spawnVfx("vfx-astra-q_slash_arc", player.x + dir.x * 70, player.y + dir.y * 42, 1.05);
      this.damageEnemiesNear({ x: player.x + dir.x * 96, y: player.y + dir.y * 58 }, 110, 100, "azure");
      this.message = "Astra Q hit arc";
    } else if (skill === "w") {
      player.shield = Math.min(160, player.shield + 95);
      this.spawnVfx("vfx-astra-w_shield_pulse", player.x, player.y, 1.15);
      this.message = "Astra W shield";
    } else if (skill === "e") {
      this.spawnVfx("vfx-astra-e_dash_trail", player.x + dir.x * 42, player.y + dir.y * 24, 1.05);
      player.x = clamp(player.x + dir.x * 165, 80, WORLD_WIDTH - 80);
      player.y = clamp(player.y + dir.y * 112, 90, WORLD_HEIGHT - 90);
      this.damageEnemiesNear(player, 70, 92, "azure");
      this.message = "Astra E dash";
    } else {
      this.spawnVfx("vfx-astra-r_shockwave", player.x + dir.x * 80, player.y + dir.y * 44, 1.45);
      this.damageEnemiesNear({ x: player.x + dir.x * 120, y: player.y + dir.y * 70 }, 210, 190, "azure");
      this.message = "Astra R shockwave";
    }
  }

  private tryUnitAttack(attacker: Unit, manual: boolean, forcedTarget?: Unit) {
    if (!attacker.alive || attacker.attackTimer > 0) return;
    const target = forcedTarget ?? this.findNearestEnemyUnit(attacker, attacker.attackRange + 16);
    if (target) {
      attacker.attackTimer = attacker.attackCooldown;
      attacker.action = "basic_attack";
      attacker.actionTimer = 0.46;
      attacker.lastDirection = directionFromVector(target.x - attacker.x, target.y - attacker.y);
      this.damageUnit(target, attacker.attackDamage, attacker.team, attacker.id);
      if (attacker.team === "crimson") this.spawnVfx("vfx-crimson-basic_attack_arc", target.x, target.y - 8, 0.8);
      return;
    }

    const building = this.findNearestAttackableBuilding(attacker, attacker.attackRange + 34);
    if (building) {
      this.attackBuilding(attacker, building);
    } else if (manual) {
      this.message = "No target in range";
    }
  }

  private attackBuilding(attacker: Unit, building: Building) {
    if (attacker.attackTimer > 0 || building.hp <= 0) return;
    attacker.attackTimer = attacker.attackCooldown;
    attacker.action = "basic_attack";
    attacker.actionTimer = 0.46;
    attacker.lastDirection = directionFromVector(building.x - attacker.x, building.y - attacker.y);
    this.applyBuildingDamage(building, attacker.attackDamage);
    this.spawnVfx(attacker.team === "azure" ? "vfx-astra-q_slash_arc" : "vfx-crimson-basic_attack_arc", building.x, building.y - 40, 0.9);
  }

  private damageEnemiesNear(center: Point, damage: number, radius: number, sourceTeam: Team) {
    for (const unit of this.units) {
      if (!unit.alive || unit.team === sourceTeam || distance(unit, center) > radius + unit.radius) continue;
      this.damageUnit(unit, damage, sourceTeam, "player");
    }
    for (const building of this.buildings) {
      if (building.team === sourceTeam || building.hp <= 0 || distance(building, center) > radius + building.radius) continue;
      if (!this.isBuildingVulnerable(building)) continue;
      this.applyBuildingDamage(building, damage * 0.45);
    }
  }

  private damageUnit(target: Unit, amount: number, sourceTeam: Team, sourceId?: string) {
    if (!target.alive) return;
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
      if (sourceTeam === "azure") this.azureKills += 1;
      if (sourceTeam === "crimson") this.crimsonKills += 1;
      if (sourceId === "player" || sourceTeam === "azure") this.rewardPlayer(target);
    }
  }

  private applyBuildingDamage(building: Building, amount: number) {
    if (building.hp <= 0 || !this.isBuildingVulnerable(building)) return;
    building.hp = Math.max(0, building.hp - amount);
    this.flashBuilding(building);
    this.showDamageNumber(building.x, building.y - 118, Math.round(amount), building.team === "azure" ? "crimson" : "azure");
    if (building.hp <= 0) {
      this.message = `${building.id} destroyed`;
      if (building.id === "crimson_core") this.endGame("victory");
      if (building.id === "azure_core") this.endGame("defeat");
    }
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
        unit.alive = true;
        unit.action = "idle";
        unit.actionTimer = 0;
        unit.respawnTimer = 8;
      }
    }
    this.units = this.units.filter((unit) => unit.kind === "hero" || unit.alive || unit.actionTimer > 0);
  }

  private rewardPlayer(target: Unit) {
    const player = this.getPlayer();
    if (!player.alive) return;
    const gold = target.kind === "hero" ? 300 : target.kind === "caster" ? 24 : 18;
    const xp = target.kind === "hero" ? 360 : target.kind === "caster" ? 70 : 58;
    player.gold += gold;
    player.xp += xp;
    while (player.level < 6 && player.xp >= LEVEL_XP_REQUIREMENTS[player.level]) {
      player.xp -= LEVEL_XP_REQUIREMENTS[player.level];
      player.level += 1;
      player.maxHp += 55;
      player.hp = Math.min(player.maxHp, player.hp + 55);
      player.attackDamage += 6;
    }
  }

  private buyItem(itemId: keyof typeof ITEM_CATALOG) {
    const item = ITEM_CATALOG[itemId];
    const player = this.getPlayer();
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
    this.purchasedItems.add(itemId);
    this.message = `Purchased ${itemId.split("_").join(" ")}`;
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
    updateHud(this.snapshot());
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
    this.drawHealthBar(bar, unit.x, unit.y - 54 * UNIT_ASSETS[unit.assetId].scale, 58, unit.hp, unit.maxHp, unit.team, unit.shield);
  }

  private syncBuildingView(building: Building) {
    const sprite = this.buildingSprites.get(building.id);
    const bar = this.buildingBars.get(building.id);
    if (!sprite || !bar) return;
    const state = this.buildingState(building);
    sprite.setTexture(this.buildingTextureKey(building.assetId, state));
    sprite.setPosition(building.x, building.y);
    sprite.setDepth(building.y - 40);
    this.drawHealthBar(bar, building.x, building.y - (building.type === "tower" ? 190 : 120), 120, building.hp, building.maxHp, building.team, 0);
  }

  private drawHealthBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, hp: number, maxHp: number, team: Team, shield: number) {
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
  }

  private spawnWave() {
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
    this.units.push(...wave);
    for (const unit of wave) this.createUnitView(unit);
    this.message = "Minion wave spawned";
  }

  private makeHero(id: string, assetId: string, team: Team, x: number, y: number): Unit {
    return {
      id,
      assetId,
      team,
      kind: "hero",
      x,
      y,
      hp: team === "azure" ? 1250 : 1180,
      maxHp: team === "azure" ? 1250 : 1180,
      mana: 560,
      maxMana: 560,
      shield: 0,
      level: 1,
      xp: 0,
      gold: team === "azure" ? 842 : 0,
      speed: 205,
      radius: 32,
      attackRange: 92,
      attackDamage: team === "azure" ? 112 : 106,
      attackCooldown: 0.95,
      attackTimer: 0,
      action: "idle",
      actionTimer: 0,
      lastDirection: team === "azure" ? "north-east" : "south-west",
      alive: true,
      respawnTimer: 8,
    };
  }

  private makeMinion(assetId: string, team: Team, kind: "melee" | "caster", x: number, y: number): Unit {
    this.sequence += 1;
    const caster = kind === "caster";
    return {
      id: `${assetId}_${this.sequence}`,
      assetId,
      team,
      kind,
      x,
      y,
      hp: caster ? 250 : 320,
      maxHp: caster ? 250 : 320,
      mana: 0,
      maxMana: 0,
      shield: 0,
      level: 1,
      xp: 0,
      gold: 0,
      speed: caster ? 72 : 84,
      radius: 20,
      attackRange: caster ? 145 : 54,
      attackDamage: caster ? 34 : 42,
      attackCooldown: caster ? 1.35 : 1.05,
      attackTimer: Phaser.Math.FloatBetween(0, 0.35),
      action: "move",
      actionTimer: 0,
      lastDirection: team === "azure" ? "north-east" : "south-west",
      alive: true,
      respawnTimer: 0,
    };
  }

  private makeBuilding(id: string, assetId: keyof typeof BUILDING_ASSETS, team: Team, type: "tower" | "core", x: number, y: number): Building {
    const tower = type === "tower";
    return {
      id,
      assetId,
      team,
      type,
      x,
      y,
      hp: tower ? 3000 : 4200,
      maxHp: tower ? 3000 : 4200,
      attackRange: tower ? 305 : 0,
      attackDamage: tower ? 155 : 0,
      attackCooldown: 1.25,
      attackTimer: 0,
      attackFlash: 0,
      radius: tower ? 72 : 104,
    };
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
    unit.x = clamp(unit.x + dx * speed * dt, 72, WORLD_WIDTH - 72);
    unit.y = clamp(unit.y + dy * speed * dt, 80, WORLD_HEIGHT - 76);
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
    return this.buildings
      .filter((building) => building.team !== source.team && building.hp > 0 && this.isBuildingVulnerable(building))
      .map((building) => ({ building, gap: distance(source, building) - building.radius - source.radius }))
      .filter(({ gap }) => gap <= range)
      .sort((a, b) => a.gap - b.gap)[0]?.building;
  }

  private findTowerTarget(tower: Building) {
    const enemies = this.units.filter((unit) => unit.alive && unit.team !== tower.team && distance(unit, tower) <= tower.attackRange);
    const minion = enemies.find((unit) => unit.kind !== "hero");
    return minion ?? enemies[0];
  }

  private isBuildingVulnerable(building: Building) {
    if (building.type === "tower") return true;
    const blockingTower = building.team === "azure" ? this.getBuilding("azure_outer_tower") : this.getBuilding("crimson_outer_tower");
    return blockingTower.hp <= 0;
  }

  private buildingState(building: Building): string {
    if (building.hp <= 0) return "destroyed";
    if (building.type === "tower") return building.attackFlash > 0 ? "attack" : "idle";
    return building.hp < building.maxHp * 0.55 ? "damaged" : "idle";
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
    return {
      coordinateSystem: "world pixels, origin top-left, x right, y down; lane runs from azure lower-left to crimson upper-right",
      mode: this.result,
      time: Number(this.elapsed.toFixed(2)),
      score: {
        azureKills: this.azureKills,
        crimsonKills: this.crimsonKills,
      },
      player: {
        hp: Math.round(player.hp),
        maxHp: player.maxHp,
        mana: Math.round(player.mana),
        maxMana: player.maxMana,
        level: player.level,
        xp: Math.round(player.xp),
        gold: player.gold,
        items: [...this.purchasedItems],
        shopAvailable: this.isPlayerInShop(),
        x: Math.round(player.x),
        y: Math.round(player.y),
        alive: player.alive,
      },
      cooldowns: {
        q: Number(this.playerCooldowns.q.toFixed(1)),
        w: Number(this.playerCooldowns.w.toFixed(1)),
        e: Number(this.playerCooldowns.e.toFixed(1)),
        r: Number(this.playerCooldowns.r.toFixed(1)),
      },
      buildings: this.buildings.map((building): BuildingSnapshot => ({
        id: building.id,
        team: building.team,
        type: building.type,
        hp: Math.round(building.hp),
        maxHp: building.maxHp,
        state: this.buildingState(building) as BuildingSnapshot["state"],
      })),
      units: this.units
        .filter((unit) => unit.alive)
        .map((unit): UnitSnapshot => ({
          id: unit.id,
          team: unit.team,
          kind: unit.kind,
          hp: Math.round(unit.hp),
          maxHp: unit.maxHp,
          x: Math.round(unit.x),
          y: Math.round(unit.y),
        })),
      activeVfx: this.vfx.length,
      nextWaveIn: Number(Math.max(0, this.waveTimer).toFixed(1)),
      message: this.message,
    };
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
