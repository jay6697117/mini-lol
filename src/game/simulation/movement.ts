import { WORLD_HEIGHT, WORLD_WIDTH } from "../data/game-config";
import { clamp, directionFromVector } from "./rules";
import type { Unit } from "./types";

export const moveUnit = (unit: Unit, dx: number, dy: number, speed: number, dt: number) => {
  if (unit.rootTimer > 0) {
    if (unit.actionTimer <= 0) unit.action = "idle";
    return false;
  }

  const adjustedSpeed = speed * unit.slowMultiplier * unit.hasteMultiplier;
  unit.x = clamp(unit.x + dx * adjustedSpeed * dt, 72, WORLD_WIDTH - 72);
  unit.y = clamp(unit.y + dy * adjustedSpeed * dt, 80, WORLD_HEIGHT - 76);
  unit.lastDirection = directionFromVector(dx, dy);
  if (unit.actionTimer <= 0) unit.action = "move";
  return true;
};
