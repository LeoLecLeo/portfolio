import type { Vector3 } from "./vector3";

export const MAX_NEWTONIAN_BODIES = 16;

export type CelestialBodyDefinition = Readonly<{
  id: string;
  name: string;
  massKg: number;
  physicalRadiusM: number;
  fixed: boolean;
  initialPositionM: Vector3;
  initialVelocityMps: Vector3;
}>;

export type EncounterThresholds = Readonly<{
  maxRelativeDisplacementPerStep: number;
  maxDynamicalStep: number;
}>;

export type NewtonianSimulationConfig = Readonly<{
  bodies: readonly CelestialBodyDefinition[];
  timeStepSeconds: number;
  encounterThresholds: EncounterThresholds;
}>;

export type NewtonianState = {
  readonly bodyIds: readonly string[];
  readonly massesKg: Float64Array;
  readonly physicalRadiiM: Float64Array;
  readonly fixed: Uint8Array;
  readonly positionsM: Float64Array;
  readonly velocitiesMps: Float64Array;
  readonly accelerationsMps2: Float64Array;
  stepCount: number;
  timeSeconds: number;
};

export type NewtonianDiagnostics = Readonly<{
  kineticEnergyJ: number;
  potentialEnergyJ: number;
  totalEnergyJ: number;
  linearMomentumKgMps: Vector3;
  angularMomentumKgM2ps: Vector3;
  centerOfMassM: Vector3;
  hasFixedBodies: boolean;
}>;

export type EncounterDetection =
  | Readonly<{
      kind: "collision";
      firstBodyIndex: number;
      secondBodyIndex: number;
      minimumSeparationM: number;
      contactDistanceM: number;
      relativeDisplacementRatio: number;
      dynamicalStepRatio: number;
    }>
  | Readonly<{
      kind: "unresolved-encounter";
      firstBodyIndex: number;
      secondBodyIndex: number;
      minimumSeparationM: number;
      contactDistanceM: number;
      relativeDisplacementRatio: number;
      dynamicalStepRatio: number;
      exceededRelativeDisplacement: boolean;
      exceededDynamicalStep: boolean;
    }>;

export type SimulationStatus =
  | "paused"
  | "running"
  | "collision"
  | "unresolved-encounter"
  | "error";

export type SimulationStopEvent =
  | Readonly<{
      kind: "collision";
      timeSeconds: number;
      attemptedTimeSeconds: number;
      firstBodyId: string;
      secondBodyId: string;
      minimumSeparationM: number;
      contactDistanceM: number;
      message: string;
    }>
  | Readonly<{
      kind: "unresolved-encounter";
      timeSeconds: number;
      attemptedTimeSeconds: number;
      firstBodyId: string;
      secondBodyId: string;
      minimumSeparationM: number;
      relativeDisplacementRatio: number;
      dynamicalStepRatio: number;
      message: string;
    }>
  | Readonly<{
      kind: "numerical-error";
      timeSeconds: number;
      attemptedTimeSeconds: number;
      message: string;
    }>;

export type IntegratorStepResult =
  | Readonly<{ advanced: true }>
  | Readonly<{ advanced: false; encounter: EncounterDetection }>;
