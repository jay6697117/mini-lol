import { LANE_END, LANE_START } from "../data/game-config";
import type { LaneTacticalPointId } from "../types";
import type { Point, Unit } from "./types";

type LaneUnit = Pick<Unit, "team" | "x" | "y"> & Partial<Pick<Unit, "id" | "kind">>;

export const LANE_WAYPOINTS: readonly Point[] = [
  LANE_START,
  { x: 500, y: 574 },
  { x: 805, y: 455 },
  { x: 1100, y: 338 },
  LANE_END,
];

export const LANE_TACTICAL_POINTS: readonly { id: LaneTacticalPointId; progress: number }[] = [
  { id: "azure_outer", progress: 0.16 },
  { id: "mid_lane", progress: 0.5 },
  { id: "crimson_outer", progress: 0.86 },
];

const LANE_LOOK_AHEAD_PROGRESS = 0.08;
const LANE_RETURN_DISTANCE = 74;
const LANE_FORMATION_OFFSETS = [-34, -18, 0, 18, 34] as const;

interface LaneSegment {
  start: Point;
  end: Point;
  length: number;
  lengthSquared: number;
  cumulativeStart: number;
}

const laneSegments = LANE_WAYPOINTS.slice(0, -1).map((start, index) => {
  const end = LANE_WAYPOINTS[index + 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    start,
    end,
    length: Math.hypot(dx, dy),
    lengthSquared: dx * dx + dy * dy,
    cumulativeStart: 0,
  };
});

let accumulatedLength = 0;
for (const segment of laneSegments) {
  segment.cumulativeStart = accumulatedLength;
  accumulatedLength += segment.length;
}

const lanePathLength = Math.max(1, accumulatedLength);

export const lanePathProgress = (point: Point) => {
  return lanePathProjection(point).progress;
};

export const lanePathProjection = (point: Point) => {
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  let bestPoint = LANE_WAYPOINTS[0];

  for (const segment of laneSegments) {
    if (segment.lengthSquared <= 0) continue;
    const projected = projectPointToSegment(point, segment);
    const dx = point.x - projected.point.x;
    const dy = point.y - projected.point.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= bestDistanceSquared) continue;
    bestDistanceSquared = distanceSquared;
    bestProgress = (segment.cumulativeStart + projected.t * segment.length) / lanePathLength;
    bestPoint = projected.point;
  }

  return {
    progress: clamp(bestProgress, 0, 1),
    point: bestPoint,
    distance: Math.sqrt(bestDistanceSquared),
  };
};

export const lanePointAtProgress = (progress: number, lateralOffset = 0): Point => {
  const targetDistance = clamp(progress, 0, 1) * lanePathLength;
  const segment = laneSegments.find((candidate) => targetDistance <= candidate.cumulativeStart + candidate.length) ?? laneSegments[laneSegments.length - 1];
  const distanceOnSegment = targetDistance - segment.cumulativeStart;
  const t = segment.length <= 0 ? 0 : clamp(distanceOnSegment / segment.length, 0, 1);
  const x = segment.start.x + (segment.end.x - segment.start.x) * t;
  const y = segment.start.y + (segment.end.y - segment.start.y) * t;
  if (Math.abs(lateralOffset) <= 0.001 || segment.length <= 0) return { x, y };
  const normal = laneSegmentNormal(segment);
  return {
    x: x + normal.x * lateralOffset,
    y: y + normal.y * lateralOffset,
  };
};

export const lanePathTargetForUnit = (unit: LaneUnit, lookAheadProgress = LANE_LOOK_AHEAD_PROGRESS) => {
  const progress = lanePathProgress(unit);
  const nextProgress = unit.team === "azure" ? progress + lookAheadProgress : progress - lookAheadProgress;
  return lanePointAtProgress(nextProgress, laneFormationOffsetForUnit(unit));
};

export const laneReturnTargetForUnit = (unit: LaneUnit, returnDistance = LANE_RETURN_DISTANCE) => {
  const projection = lanePathProjection(unit);
  if (projection.distance > returnDistance) return projection.point;
  const nextProgress = unit.team === "azure" ? projection.progress + LANE_LOOK_AHEAD_PROGRESS : projection.progress - LANE_LOOK_AHEAD_PROGRESS;
  return lanePointAtProgress(nextProgress, laneFormationOffsetForUnit(unit));
};

export const laneFormationOffsetForUnit = (unit: LaneUnit) => {
  if (!unit.id || !unit.kind || unit.kind === "hero") return 0;
  const baseOffset = LANE_FORMATION_OFFSETS[stableHash(unit.id) % LANE_FORMATION_OFFSETS.length];
  const kindOffset = unit.kind === "caster" ? 8 : unit.kind === "siege" ? -8 : 0;
  return baseOffset + kindOffset;
};

export const laneTacticalPointForProgress = (progress: number | null): LaneTacticalPointId | null => {
  if (progress === null) return null;
  return [...LANE_TACTICAL_POINTS].sort((a, b) => Math.abs(a.progress - progress) - Math.abs(b.progress - progress))[0]?.id ?? null;
};

export const nextLaneTacticalPointForTeam = (team: Unit["team"], progress: number): LaneTacticalPointId => {
  const points = team === "azure" ? LANE_TACTICAL_POINTS : [...LANE_TACTICAL_POINTS].reverse();
  const next = points.find((point) => (team === "azure" ? point.progress > progress : point.progress < progress));
  return next?.id ?? (team === "azure" ? "crimson_outer" : "azure_outer");
};

export const laneTacticalPointProgress = (id: LaneTacticalPointId) => LANE_TACTICAL_POINTS.find((point) => point.id === id)?.progress ?? 0.5;

export const laneTacticalPointTarget = (id: LaneTacticalPointId, lateralOffset = 0) => lanePointAtProgress(laneTacticalPointProgress(id), lateralOffset);

const projectPointToSegment = (point: Point, segment: LaneSegment) => {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const offsetX = point.x - segment.start.x;
  const offsetY = point.y - segment.start.y;
  const t = clamp((offsetX * dx + offsetY * dy) / segment.lengthSquared, 0, 1);
  return {
    t,
    point: {
      x: segment.start.x + dx * t,
      y: segment.start.y + dy * t,
    },
  };
};

const laneSegmentNormal = (segment: LaneSegment) => ({
  x: -(segment.end.y - segment.start.y) / segment.length,
  y: (segment.end.x - segment.start.x) / segment.length,
});

const stableHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
