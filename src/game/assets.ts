export type Direction =
  | "south"
  | "south-east"
  | "east"
  | "north-east"
  | "north"
  | "north-west"
  | "west"
  | "south-west";

export type Team = "azure" | "crimson";

export type UnitAction = "idle" | "move" | "basic_attack" | "cast" | "hit" | "death";

export const DIRECTIONS: Direction[] = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
];

export interface SheetSpec {
  url: string;
  columns: number;
  frames: number;
  cell: number;
}

export interface UnitAssetSpec {
  id: string;
  team: Team;
  scale: number;
  actions: Partial<Record<UnitAction, SheetSpec>>;
}

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^assets\//, "")}`;

const unitSheet = (path: string, columns: number, frames = columns): SheetSpec => ({
  url: assetUrl(path),
  columns,
  frames,
  cell: 64,
});

const characterPath = (id: string, action: UnitAction) =>
  `assets/sprites/characters/${id}/run/64/final/${action}-sheet-clean.png`;

const minionPath = (team: Team, id: string, action: UnitAction) =>
  `assets/sprites/minions/${team}/${id}/run/64/final/${action}-sheet-clean.png`;

export const UNIT_ASSETS: Record<string, UnitAssetSpec> = {
  astra_vanguard: {
    id: "astra_vanguard",
    team: "azure",
    scale: 1.58,
    actions: {
      idle: unitSheet(characterPath("astra_vanguard", "idle"), 6),
      move: unitSheet(characterPath("astra_vanguard", "move"), 6),
      basic_attack: unitSheet(characterPath("astra_vanguard", "basic_attack"), 6),
      cast: unitSheet(characterPath("astra_vanguard", "cast"), 6),
      hit: unitSheet(characterPath("astra_vanguard", "hit"), 4),
      death: unitSheet(characterPath("astra_vanguard", "death"), 8),
    },
  },
  crimson_duelist: {
    id: "crimson_duelist",
    team: "crimson",
    scale: 1.52,
    actions: {
      idle: unitSheet(characterPath("crimson_duelist", "idle"), 6),
      move: unitSheet(characterPath("crimson_duelist", "move"), 6),
      basic_attack: unitSheet(characterPath("crimson_duelist", "basic_attack"), 6),
      cast: unitSheet(characterPath("crimson_duelist", "cast"), 6),
      hit: unitSheet(characterPath("crimson_duelist", "hit"), 4),
      death: unitSheet(characterPath("crimson_duelist", "death"), 8),
    },
  },
  azure_melee_minion: {
    id: "azure_melee_minion",
    team: "azure",
    scale: 1.0,
    actions: {
      idle: unitSheet(minionPath("azure", "azure_melee_minion", "idle"), 4),
      move: unitSheet(minionPath("azure", "azure_melee_minion", "move"), 6),
      basic_attack: unitSheet(minionPath("azure", "azure_melee_minion", "basic_attack"), 6),
      hit: unitSheet(minionPath("azure", "azure_melee_minion", "hit"), 4),
      death: unitSheet(minionPath("azure", "azure_melee_minion", "death"), 6),
    },
  },
  crimson_melee_minion: {
    id: "crimson_melee_minion",
    team: "crimson",
    scale: 1.0,
    actions: {
      idle: unitSheet(minionPath("crimson", "crimson_melee_minion", "idle"), 4),
      move: unitSheet(minionPath("crimson", "crimson_melee_minion", "move"), 6),
      basic_attack: unitSheet(minionPath("crimson", "crimson_melee_minion", "basic_attack"), 6),
      hit: unitSheet(minionPath("crimson", "crimson_melee_minion", "hit"), 4),
      death: unitSheet(minionPath("crimson", "crimson_melee_minion", "death"), 6),
    },
  },
  azure_caster_minion: {
    id: "azure_caster_minion",
    team: "azure",
    scale: 1.0,
    actions: {
      idle: unitSheet(minionPath("azure", "azure_caster_minion", "idle"), 4),
      move: unitSheet(minionPath("azure", "azure_caster_minion", "move"), 6),
      basic_attack: unitSheet(minionPath("azure", "azure_caster_minion", "basic_attack"), 6),
      hit: unitSheet(minionPath("azure", "azure_caster_minion", "hit"), 4),
      death: unitSheet(minionPath("azure", "azure_caster_minion", "death"), 6),
    },
  },
  crimson_caster_minion: {
    id: "crimson_caster_minion",
    team: "crimson",
    scale: 1.0,
    actions: {
      idle: unitSheet(minionPath("crimson", "crimson_caster_minion", "idle"), 4),
      move: unitSheet(minionPath("crimson", "crimson_caster_minion", "move"), 6),
      basic_attack: unitSheet(minionPath("crimson", "crimson_caster_minion", "basic_attack"), 6),
      hit: unitSheet(minionPath("crimson", "crimson_caster_minion", "hit"), 4),
      death: unitSheet(minionPath("crimson", "crimson_caster_minion", "death"), 6),
    },
  },
};

export const BUILDING_ASSETS = {
  azure_outer_tower: {
    idle: assetUrl("assets/sprites/buildings/azure/azure_outer_tower/final/azure_outer_tower-idle.png"),
    attack: assetUrl("assets/sprites/buildings/azure/azure_outer_tower/final/azure_outer_tower-attack.png"),
    destroyed: assetUrl("assets/sprites/buildings/azure/azure_outer_tower/final/azure_outer_tower-destroyed.png"),
  },
  crimson_outer_tower: {
    idle: assetUrl("assets/sprites/buildings/crimson/crimson_outer_tower/final/crimson_outer_tower-idle.png"),
    attack: assetUrl("assets/sprites/buildings/crimson/crimson_outer_tower/final/crimson_outer_tower-attack.png"),
    destroyed: assetUrl("assets/sprites/buildings/crimson/crimson_outer_tower/final/crimson_outer_tower-destroyed.png"),
  },
  azure_core: {
    idle: assetUrl("assets/sprites/buildings/azure/azure_core/final/azure_core-idle.png"),
    damaged: assetUrl("assets/sprites/buildings/azure/azure_core/final/azure_core-damaged.png"),
    destroyed: assetUrl("assets/sprites/buildings/azure/azure_core/final/azure_core-destroyed.png"),
  },
  crimson_core: {
    idle: assetUrl("assets/sprites/buildings/crimson/crimson_core/final/crimson_core-idle.png"),
    damaged: assetUrl("assets/sprites/buildings/crimson/crimson_core/final/crimson_core-damaged.png"),
    destroyed: assetUrl("assets/sprites/buildings/crimson/crimson_core/final/crimson_core-destroyed.png"),
  },
} as const;

export const VFX_ASSETS = {
  astra_skill_vfx: {
    url: assetUrl("assets/sprites/effects/astra_skill_vfx/final/astra_skill_vfx-atlas.png"),
    rows: {
      q_slash_arc: 0,
      w_shield_pulse: 1,
      e_dash_trail: 2,
      r_shockwave: 3,
    },
  },
  crimson_skill_vfx: {
    url: assetUrl("assets/sprites/effects/crimson_skill_vfx/final/crimson_skill_vfx-atlas.png"),
    rows: {
      q_spear_thrust: 0,
      basic_attack_arc: 1,
    },
  },
} as const;

export const UI_ICON_URLS = {
  skills: {
    astra_q: assetUrl("assets/sprites/ui/moba_ui_icons/final/skill-icons-astra_q.png"),
    astra_w: assetUrl("assets/sprites/ui/moba_ui_icons/final/skill-icons-astra_w.png"),
    astra_e: assetUrl("assets/sprites/ui/moba_ui_icons/final/skill-icons-astra_e.png"),
    astra_r: assetUrl("assets/sprites/ui/moba_ui_icons/final/skill-icons-astra_r.png"),
    crimson_q: assetUrl("assets/sprites/ui/moba_ui_icons/final/skill-icons-crimson_q.png"),
  },
  items: {
    bronze_sword: assetUrl("assets/sprites/ui/moba_ui_icons/final/item-icons-bronze_sword.png"),
    plated_boots: assetUrl("assets/sprites/ui/moba_ui_icons/final/item-icons-plated_boots.png"),
    focus_crystal: assetUrl("assets/sprites/ui/moba_ui_icons/final/item-icons-focus_crystal.png"),
    guard_shield: assetUrl("assets/sprites/ui/moba_ui_icons/final/item-icons-guard_shield.png"),
    haste_talisman: assetUrl("assets/sprites/ui/moba_ui_icons/final/item-icons-haste_talisman.png"),
    siege_hammer: assetUrl("assets/sprites/ui/moba_ui_icons/final/item-icons-siege_hammer.png"),
  },
  minimap: {
    azure_hero: assetUrl("assets/sprites/ui/moba_ui_icons/final/minimap-icons-azure_hero.png"),
    crimson_hero: assetUrl("assets/sprites/ui/moba_ui_icons/final/minimap-icons-crimson_hero.png"),
    azure_minion: assetUrl("assets/sprites/ui/moba_ui_icons/final/minimap-icons-azure_minion.png"),
    crimson_minion: assetUrl("assets/sprites/ui/moba_ui_icons/final/minimap-icons-crimson_minion.png"),
    azure_tower: assetUrl("assets/sprites/ui/moba_ui_icons/final/minimap-icons-azure_tower.png"),
    crimson_tower: assetUrl("assets/sprites/ui/moba_ui_icons/final/minimap-icons-crimson_tower.png"),
    azure_core: assetUrl("assets/sprites/ui/moba_ui_icons/final/minimap-icons-azure_core.png"),
    crimson_core: assetUrl("assets/sprites/ui/moba_ui_icons/final/minimap-icons-crimson_core.png"),
  },
  status: {
    gold: assetUrl("assets/sprites/ui/moba_ui_icons/final/status-icons-gold.png"),
    level_up: assetUrl("assets/sprites/ui/moba_ui_icons/final/status-icons-level_up.png"),
    skill_point: assetUrl("assets/sprites/ui/moba_ui_icons/final/status-icons-skill_point.png"),
    recall: assetUrl("assets/sprites/ui/moba_ui_icons/final/status-icons-recall.png"),
    death_timer: assetUrl("assets/sprites/ui/moba_ui_icons/final/status-icons-death_timer.png"),
    shop: assetUrl("assets/sprites/ui/moba_ui_icons/final/status-icons-shop.png"),
  },
} as const;
