import { isBuildingVulnerable } from "./objectives";
import { distance } from "./rules";
import type { Building, Point, Unit } from "./types";

export const pickEnemyUnitAtPoint = (units: Unit[], point: Point, team: Unit["team"], extraRadius = 22) =>
  units
    .filter((unit) => unit.alive && unit.team !== team && distance(unit, point) <= unit.radius + extraRadius)
    .sort((a, b) => distance(a, point) - distance(b, point))[0];

export const pickEnemyBuildingAtPoint = (buildings: Building[], point: Point, team: Unit["team"], extraRadius = 42) =>
  buildings
    .filter((building) => building.hp > 0 && building.team !== team && isBuildingVulnerable(building, buildings) && distance(building, point) <= building.radius + extraRadius)
    .sort((a, b) => distance(a, point) - distance(b, point))[0];
