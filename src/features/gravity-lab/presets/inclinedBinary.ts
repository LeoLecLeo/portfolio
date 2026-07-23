import type { NewtonianSimulationConfig } from "../core/types";
import {
  ASTRONOMICAL_UNIT_M,
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SOLAR_MASS_KG,
  SOLAR_RADIUS_M,
} from "../core/units";
import { vector3, type Vector3 } from "../core/vector3";

export const INCLINED_BINARY_STEPS_PER_PERIOD = 2_048;
export const INCLINED_BINARY_SEPARATION_M = 0.2 * ASTRONOMICAL_UNIT_M;
export const INCLINED_BINARY_ORBITAL_RADIUS_M =
  INCLINED_BINARY_SEPARATION_M * 0.5;
export const INCLINED_BINARY_ORBITAL_SPEED_MPS = Math.sqrt(
  (GRAVITATIONAL_CONSTANT_M3_KG_S2 * SOLAR_MASS_KG) /
    (2 * INCLINED_BINARY_SEPARATION_M)
);
export const INCLINED_BINARY_PERIOD_SECONDS =
  (2 * Math.PI * INCLINED_BINARY_ORBITAL_RADIUS_M) /
  INCLINED_BINARY_ORBITAL_SPEED_MPS;
export const INCLINED_BINARY_TIME_STEP_SECONDS =
  INCLINED_BINARY_PERIOD_SECONDS / INCLINED_BINARY_STEPS_PER_PERIOD;

const ORBITAL_PHASE_RADIANS = (35 * Math.PI) / 180;
const INCLINATION_RADIANS = (30 * Math.PI) / 180;

export const INCLINED_BINARY_PLANE_NORMAL: Vector3 = vector3(
  0,
  -Math.sin(INCLINATION_RADIANS),
  Math.cos(INCLINATION_RADIANS)
);

function rotateAroundXAxis(value: Vector3, angleRadians: number): Vector3 {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);

  return vector3(
    value.x,
    value.y * cosine - value.z * sine,
    value.y * sine + value.z * cosine
  );
}

export function createInclinedBinaryConfig(
  stepsPerPeriod = INCLINED_BINARY_STEPS_PER_PERIOD
): NewtonianSimulationConfig {
  if (!Number.isInteger(stepsPerPeriod) || stepsPerPeriod <= 0) {
    throw new RangeError("Steps per orbital period must be a positive integer.");
  }

  const basePosition = vector3(
    INCLINED_BINARY_ORBITAL_RADIUS_M *
      Math.cos(ORBITAL_PHASE_RADIANS),
    INCLINED_BINARY_ORBITAL_RADIUS_M *
      Math.sin(ORBITAL_PHASE_RADIANS),
    0
  );
  const baseVelocity = vector3(
    -INCLINED_BINARY_ORBITAL_SPEED_MPS *
      Math.sin(ORBITAL_PHASE_RADIANS),
    INCLINED_BINARY_ORBITAL_SPEED_MPS *
      Math.cos(ORBITAL_PHASE_RADIANS),
    0
  );
  const firstPosition = rotateAroundXAxis(
    basePosition,
    INCLINATION_RADIANS
  );
  const firstVelocity = rotateAroundXAxis(
    baseVelocity,
    INCLINATION_RADIANS
  );

  return {
    bodies: [
      {
        id: "binary-a",
        name: "Binary star A",
        massKg: SOLAR_MASS_KG,
        physicalRadiusM: SOLAR_RADIUS_M,
        fixed: false,
        initialPositionM: firstPosition,
        initialVelocityMps: firstVelocity,
      },
      {
        id: "binary-b",
        name: "Binary star B",
        massKg: SOLAR_MASS_KG,
        physicalRadiusM: SOLAR_RADIUS_M,
        fixed: false,
        initialPositionM: vector3(
          -firstPosition.x,
          -firstPosition.y,
          -firstPosition.z
        ),
        initialVelocityMps: vector3(
          -firstVelocity.x,
          -firstVelocity.y,
          -firstVelocity.z
        ),
      },
    ],
    timeStepSeconds: INCLINED_BINARY_PERIOD_SECONDS / stepsPerPeriod,
    encounterThresholds: {
      maxRelativeDisplacementPerStep: 0.02,
      maxDynamicalStep: 0.02,
    },
  };
}
