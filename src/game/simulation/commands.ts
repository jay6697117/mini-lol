import { isBuildingVulnerable } from "./objectives";
import { distance, normalize } from "./rules";
import type { Building, Point, Unit } from "./types";

export type PlayerAttackCommandDecision =
  | { kind: "none" }
  | { kind: "clearUnitTarget" }
  | { kind: "clearBuildingTarget" }
  | { kind: "attackUnit"; target: Unit }
  | { kind: "attackBuilding"; building: Building }
  | { kind: "move"; target: Point }
  | { kind: "attackMoveTarget"; target: Unit };

interface PlayerAttackCommandHandlers {
  attackUnit: (target: Unit) => void;
  attackBuilding: (building: Building) => void;
  attackMoveTarget: (target: Unit) => void;
  move: (direction: Point) => void;
}

export const clearUnitCommands = (unit: Unit) => {
  unit.targetUnitId = undefined;
  unit.targetBuildingId = undefined;
  unit.targetPoint = undefined;
  unit.attackMovePoint = undefined;
};

export const applyMoveCommand = (unit: Unit, point: Point, attackMove: boolean) => {
  unit.targetUnitId = undefined;
  unit.targetBuildingId = undefined;
  unit.targetPoint = point;
  unit.attackMovePoint = attackMove ? point : undefined;
  return attackMove ? "Attack move" : "Move command";
};

export const applyAttackUnitCommand = (unit: Unit, target: Unit) => {
  unit.targetUnitId = target.id;
  unit.targetBuildingId = undefined;
  unit.targetPoint = undefined;
  unit.attackMovePoint = undefined;
  return `${target.kind} targeted`;
};

export const applyAttackBuildingCommand = (unit: Unit, building: Building) => {
  unit.targetUnitId = undefined;
  unit.targetBuildingId = building.id;
  unit.targetPoint = undefined;
  unit.attackMovePoint = undefined;
  return `${building.id.split("_").join(" ")} targeted`;
};

export const resolvePlayerAttackCommand = (player: Unit, units: Unit[], buildings: Building[]): PlayerAttackCommandDecision => {
  if (player.targetUnitId) {
    const target = units.find((unit) => unit.id === player.targetUnitId && unit.alive);
    if (!target) return { kind: "clearUnitTarget" };
    const gap = distance(player, target) - player.radius - target.radius;
    return gap <= player.attackRange + 10 ? { kind: "attackUnit", target } : { kind: "move", target };
  }

  if (player.targetBuildingId) {
    const building = buildings.find((candidate) => candidate.id === player.targetBuildingId && candidate.hp > 0);
    if (!building || !isBuildingVulnerable(building, buildings)) return { kind: "clearBuildingTarget" };
    const gap = distance(player, building) - player.radius - building.radius;
    return gap <= player.attackRange + 18 ? { kind: "attackBuilding", building } : { kind: "move", target: building };
  }

  if (player.attackMovePoint) {
    const target = units
      .filter((unit) => unit.alive && unit.team !== player.team)
      .map((unit) => ({ unit, gap: distance(player, unit) - unit.radius - player.radius }))
      .filter(({ gap }) => gap <= player.attackRange + 96)
      .sort((a, b) => a.gap - b.gap)[0]?.unit;
    if (target) return { kind: "attackMoveTarget", target };
  }

  return { kind: "none" };
};

export const applyPlayerAttackCommandDecision = (player: Unit, decision: PlayerAttackCommandDecision, handlers: PlayerAttackCommandHandlers) => {
  if (decision.kind === "none") return false;
  if (decision.kind === "clearUnitTarget") {
    player.targetUnitId = undefined;
    return false;
  }
  if (decision.kind === "clearBuildingTarget") {
    player.targetBuildingId = undefined;
    return false;
  }
  if (decision.kind === "attackUnit") {
    handlers.attackUnit(decision.target);
    return true;
  }
  if (decision.kind === "attackBuilding") {
    handlers.attackBuilding(decision.building);
    return true;
  }
  if (decision.kind === "attackMoveTarget") {
    handlers.attackMoveTarget(decision.target);
    return true;
  }
  handlers.move(normalize(decision.target.x - player.x, decision.target.y - player.y));
  return true;
};
