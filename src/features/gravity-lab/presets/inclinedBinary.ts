import {
  compileScenarioDraft,
  type ScenarioCompilationOptions,
} from "../core/scenarioCompiler";
import {
  createDraftNumberFromSi,
  defaultBodyDraftColor,
  DISTANCE_DRAFT_UNIT_CONVERTER,
  MASS_DRAFT_UNIT_CONVERTER,
  SPEED_DRAFT_UNIT_CONVERTER,
  TIME_DRAFT_UNIT_CONVERTER,
  type AppliedScenario,
  type BodyDraft,
  type ScenarioDraft,
} from "../core/scenario";
import type {
  CelestialBodyDefinition,
  NewtonianSimulationConfig,
} from "../core/types";
import {
  ASTRONOMICAL_UNIT_M,
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SOLAR_MASS_KG,
  SOLAR_RADIUS_M,
} from "../core/units";
import { vector3, type Vector3 } from "../core/vector3";
import type { FixedStepSchedulerConfig } from "../runtime/FixedStepScheduler";
import { defineGravityPreset } from "./gravityPreset";
import { STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE } from "./presetSchedulerPolicies";
import { createGravityLabSchedulerConfig } from "../runtime/schedulerPolicy";

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
export const INCLINED_BINARY_PRECISION_PROFILE = "balanced" as const;
export const INCLINED_BINARY_SCHEDULER_CONFIG: FixedStepSchedulerConfig =
  createGravityLabSchedulerConfig(
    INCLINED_BINARY_TIME_STEP_SECONDS,
    STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE
  );

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

function bodyDefinitionToDraft(
  body: CelestialBodyDefinition,
  bodyIndex: number
): BodyDraft {
  return {
    id: body.id,
    name: body.name,
    color: defaultBodyDraftColor(bodyIndex),
    fixed: body.fixed,
    mass: createDraftNumberFromSi(
      body.massKg,
      "solar-mass",
      MASS_DRAFT_UNIT_CONVERTER
    ),
    physicalRadius: createDraftNumberFromSi(
      body.physicalRadiusM,
      "solar-radius",
      DISTANCE_DRAFT_UNIT_CONVERTER
    ),
    initialPosition: {
      x: createDraftNumberFromSi(
        body.initialPositionM.x,
        "au",
        DISTANCE_DRAFT_UNIT_CONVERTER
      ),
      y: createDraftNumberFromSi(
        body.initialPositionM.y,
        "au",
        DISTANCE_DRAFT_UNIT_CONVERTER
      ),
      z: createDraftNumberFromSi(
        body.initialPositionM.z,
        "au",
        DISTANCE_DRAFT_UNIT_CONVERTER
      ),
    },
    initialVelocity: {
      x: createDraftNumberFromSi(
        body.initialVelocityMps.x,
        "km/s",
        SPEED_DRAFT_UNIT_CONVERTER
      ),
      y: createDraftNumberFromSi(
        body.initialVelocityMps.y,
        "km/s",
        SPEED_DRAFT_UNIT_CONVERTER
      ),
      z: createDraftNumberFromSi(
        body.initialVelocityMps.z,
        "km/s",
        SPEED_DRAFT_UNIT_CONVERTER
      ),
    },
  };
}

export function createInclinedBinaryDraft(
  minimumStepsPerPeriod = INCLINED_BINARY_STEPS_PER_PERIOD
): ScenarioDraft {
  const config = createInclinedBinaryConfig(minimumStepsPerPeriod);

  return {
    modelId: "newtonian",
    bodies: config.bodies.map(bodyDefinitionToDraft),
    precisionProfile: INCLINED_BINARY_PRECISION_PROFILE,
    maximumTimeStep: createDraftNumberFromSi(
      config.timeStepSeconds,
      "s",
      TIME_DRAFT_UNIT_CONVERTER
    ),
  };
}

export function createInclinedBinaryAppliedScenario(
  budget?: ScenarioCompilationOptions["budget"],
  minimumStepsPerPeriod = INCLINED_BINARY_STEPS_PER_PERIOD
): AppliedScenario {
  const result = compileScenarioDraft(
    createInclinedBinaryDraft(minimumStepsPerPeriod),
    budget === undefined ? {} : { budget }
  );

  if (!result.ok) {
    const summary = result.report.errors
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join("; ");

    throw new RangeError(
      `The inclined binary preset did not compile: ${summary}`
    );
  }

  return result.scenario;
}

export const INCLINED_BINARY_PRESET_ID = "inclined-binary";

export const INCLINED_BINARY_PRESET = defineGravityPreset({
  id: INCLINED_BINARY_PRESET_ID,
  name: "Système binaire incliné",
  shortDescription:
    "Deux étoiles de masse solaire égale sur une orbite circulaire inclinée.",
  category: "binary-system",
  educationalLevel: "intermediate",
  bodyCount: 2,
  expectedPhysicalDomain: "newtonian-n-body",
  pedagogy: {
    learningObjective:
      "Relier mouvement barycentrique et orbite tridimensionnelle.",
    observedPhenomenon:
      "Deux étoiles identiques tournent autour de leur barycentre dans un plan incliné.",
    keyParameters: [
      "Masses : 1 masse solaire chacune",
      "Séparation : 0,2 au",
      "Inclinaison : 30°",
    ],
    interestingParametersToModify: [
      "Comparer les composantes z des positions",
      "Modifier symétriquement les vitesses initiales",
    ],
    expectedResult:
      "Une orbite circulaire stable, vue en perspective, centrée sur le barycentre.",
    limitationOrWarning:
      "Système isolé idéalisé ; les rayons affichés ne sont pas à l’échelle physique.",
  },
  preferredSimulatedSecondsPerRealSecond:
    STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE,
  createScenario: () =>
    createInclinedBinaryAppliedScenario(
      INCLINED_BINARY_SCHEDULER_CONFIG
    ),
});
