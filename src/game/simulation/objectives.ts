import { distance } from "./rules";
import type { Building, BuildingState, Unit } from "./types";

export const STRUCTURE_DAMAGE_UNSUPPORTED_MULTIPLIER = 0.42;
export const STRUCTURE_DAMAGE_MINION_SUPPORT_RADIUS = 420;

const blockingTowerId = (building: Building) => (building.team === "azure" ? "azure_outer_tower" : "crimson_outer_tower");
const inhibitorId = (building: Building) => (building.team === "azure" ? "azure_inhibitor" : "crimson_inhibitor");

const destroyed = (buildings: Building[], id: string) => {
  const building = buildings.find((candidate) => candidate.id === id);
  return !building || building.hp <= 0;
};

export const isBuildingVulnerable = (building: Building, buildings: Building[]) => {
  if (building.type === "tower") return true;
  if (building.type === "inhibitor") return destroyed(buildings, blockingTowerId(building));
  return destroyed(buildings, blockingTowerId(building)) && destroyed(buildings, inhibitorId(building));
};

export const findNearestAttackableBuilding = (source: Unit, buildings: Building[], range: number) =>
  buildings
    .filter((building) => building.team !== source.team && building.hp > 0 && isBuildingVulnerable(building, buildings))
    .map((building) => ({ building, gap: distance(source, building) - building.radius - source.radius }))
    .filter(({ gap }) => gap <= range)
    .sort((a, b) => a.gap - b.gap)[0]?.building;

export const hasAlliedMinionNearBuilding = (sourceTeam: Unit["team"], building: Building, units: Unit[], radius = STRUCTURE_DAMAGE_MINION_SUPPORT_RADIUS) =>
  units.some((unit) => unit.alive && unit.team === sourceTeam && unit.kind !== "hero" && distance(unit, building) <= radius + building.radius + unit.radius);

export const structureDamageMultiplier = (sourceTeam: Unit["team"], building: Building, units: Unit[]) =>
  hasAlliedMinionNearBuilding(sourceTeam, building, units) ? 1 : STRUCTURE_DAMAGE_UNSUPPORTED_MULTIPLIER;

export const buildingState = (building: Building): BuildingState => {
  if (building.hp <= 0) return "destroyed";
  if (building.type === "tower") return building.attackFlash > 0 ? "attack" : "idle";
  return building.hp < building.maxHp * 0.55 ? "damaged" : "idle";
};
