import { BRUSH_ZONES } from "../data/game-config";
import type { Point } from "./types";

export const brushZoneAt = (point: Point) =>
  BRUSH_ZONES.find((zone) => {
    const nx = (point.x - zone.x) / zone.radiusX;
    const ny = (point.y - zone.y) / zone.radiusY;
    return nx * nx + ny * ny <= 1;
  });

export const isPointInBrush = (point: Point) => Boolean(brushZoneAt(point));
