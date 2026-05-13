import { distance } from "./rules";
import type { Building, BuildingState, Unit } from "./types";

const blockingTowerId = (building: Building) => (building.team === "azure" ? "azure_outer_tower" : "crimson_outer_tower");

export const isBuildingVulnerable = (building: Building, buildings: Building[]) => {
  if (building.type === "tower") return true;
  const blockingTower = buildings.find((candidate) => candidate.id === blockingTowerId(building));
  return Boolean(blockingTower && blockingTower.hp <= 0);
};

export const findNearestAttackableBuilding = (source: Unit, buildings: Building[], range: number) =>
  buildings
    .filter((building) => building.team !== source.team && building.hp > 0 && isBuildingVulnerable(building, buildings))
    .map((building) => ({ building, gap: distance(source, building) - building.radius - source.radius }))
    .filter(({ gap }) => gap <= range)
    .sort((a, b) => a.gap - b.gap)[0]?.building;

export const buildingState = (building: Building): BuildingState => {
  if (building.hp <= 0) return "destroyed";
  if (building.type === "tower") return building.attackFlash > 0 ? "attack" : "idle";
  return building.hp < building.maxHp * 0.55 ? "damaged" : "idle";
};
