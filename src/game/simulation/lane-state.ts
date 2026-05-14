import type { LanePressure, LaneSnapshot } from "../types";
import { lanePathProgress, laneTacticalPointForProgress } from "./lane-path";
import type { Unit } from "./types";

interface CreateLaneSnapshotInput {
  units: Unit[];
  waveNumber: number;
}

const CRIMSON_CRASH_PROGRESS = 0.26;
const AZURE_FREEZE_PROGRESS = 0.42;
const RESET_MIN_PROGRESS = 0.46;
const RESET_MAX_PROGRESS = 0.54;
const CRIMSON_FREEZE_PROGRESS = 0.58;
const AZURE_CRASH_PROGRESS = 0.74;

export const createLaneSnapshot = ({ units, waveNumber }: CreateLaneSnapshotInput): LaneSnapshot => {
  const minions = units.filter((unit) => unit.alive && unit.kind !== "hero");
  const azure = minions.filter((unit) => unit.team === "azure");
  const crimson = minions.filter((unit) => unit.team === "crimson");
  const azureFront = furthestProgress(azure, "azure");
  const crimsonFront = furthestProgress(crimson, "crimson");
  const progress = clashProgress(azureFront, crimsonFront);
  const azureAggroMinions = activeAggroMinions(azure);
  const crimsonAggroMinions = activeAggroMinions(crimson);
  const pressure = lanePressure(azure.length, crimson.length, progress, azureAggroMinions + crimsonAggroMinions);
  return {
    waveNumber,
    nextSiegeWave: nextSiegeWave(waveNumber),
    pressure,
    progress: progress === null ? null : Number(progress.toFixed(2)),
    tacticalPoint: laneTacticalPointForProgress(progress),
    azureMinions: azure.length,
    crimsonMinions: crimson.length,
    azureAggroMinions,
    crimsonAggroMinions,
    label: lanePressureLabel(pressure),
  };
};

export const laneProgress = (unit: Unit) => {
  return lanePathProgress(unit);
};

const furthestProgress = (units: Unit[], team: Unit["team"]) => {
  if (units.length === 0) return null;
  const values = units.map(laneProgress);
  return team === "azure" ? Math.max(...values) : Math.min(...values);
};

const clashProgress = (azureFront: number | null, crimsonFront: number | null) => {
  if (azureFront !== null && crimsonFront !== null) return (azureFront + crimsonFront) / 2;
  return azureFront ?? crimsonFront;
};

const lanePressure = (azureMinions: number, crimsonMinions: number, progress: number | null, activeAggroMinions: number): LanePressure => {
  if (azureMinions + crimsonMinions === 0) return "empty";
  if (progress !== null && progress >= AZURE_CRASH_PROGRESS) return "azure_crashing";
  if (progress !== null && progress <= CRIMSON_CRASH_PROGRESS) return "crimson_crashing";
  const minionDelta = azureMinions - crimsonMinions;
  const contestedWave = azureMinions > 0 && crimsonMinions > 0;
  if (contestedWave && activeAggroMinions === 0 && Math.abs(minionDelta) <= 1 && progress !== null && progress >= RESET_MIN_PROGRESS && progress <= RESET_MAX_PROGRESS) {
    return "resetting";
  }
  if (contestedWave && progress !== null && progress <= AZURE_FREEZE_PROGRESS && minionDelta >= -1 && minionDelta <= 0) {
    return "azure_freezing";
  }
  if (contestedWave && progress !== null && progress >= CRIMSON_FREEZE_PROGRESS && minionDelta >= 0 && minionDelta <= 1) {
    return "crimson_freezing";
  }
  if (azureMinions >= crimsonMinions + 2) return "azure_slow_push";
  if (crimsonMinions >= azureMinions + 2) return "crimson_slow_push";
  if (progress !== null && progress >= CRIMSON_FREEZE_PROGRESS) return "azure_slow_push";
  if (progress !== null && progress <= AZURE_FREEZE_PROGRESS) return "crimson_slow_push";
  return "neutral";
};

const lanePressureLabel = (pressure: LanePressure) => {
  if (pressure === "azure_crashing") return "Azure crash";
  if (pressure === "crimson_crashing") return "Crimson crash";
  if (pressure === "azure_freezing") return "Azure freeze";
  if (pressure === "crimson_freezing") return "Crimson freeze";
  if (pressure === "azure_slow_push") return "Azure slow";
  if (pressure === "crimson_slow_push") return "Crimson slow";
  if (pressure === "resetting") return "Wave reset";
  if (pressure === "empty") return "No wave";
  return "Neutral";
};

const activeAggroMinions = (units: Unit[]) => units.filter((unit) => unit.aggroTimer > 0 && unit.aggroTargetId).length;

const nextSiegeWave = (waveNumber: number) => waveNumber + (waveNumber % 3 === 0 ? 3 : 3 - (waveNumber % 3));
