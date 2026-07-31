import {
  EARTH_MASS_KG,
  EARTH_RADIUS_M,
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  JUPITER_MASS_KG,
  JUPITER_RADIUS_M,
} from "../core/units";
import { vector3 } from "../core/vector3";
import { defineGravityPreset } from "./gravityPreset";
import type { FixedStepSchedulerConfig } from "../runtime/FixedStepScheduler";
import {
  compilePresetScenario,
  createBarycentricTwoBodyDefinitions,
} from "./presetScenario";

export const HYPERBOLIC_FLYBY_PRESET_ID = "hyperbolic-two-body-flyby";
export const HYPERBOLIC_FLYBY_INITIAL_X_M = 5e9;
export const HYPERBOLIC_FLYBY_IMPACT_OFFSET_M = 1e9;
export const HYPERBOLIC_FLYBY_EXCESS_SPEED_MPS = 15_000;
export const HYPERBOLIC_FLYBY_TOTAL_MASS_KG =
  JUPITER_MASS_KG + EARTH_MASS_KG;
export const HYPERBOLIC_FLYBY_GRAVITATIONAL_PARAMETER =
  GRAVITATIONAL_CONSTANT_M3_KG_S2 *
  HYPERBOLIC_FLYBY_TOTAL_MASS_KG;
export const HYPERBOLIC_FLYBY_INITIAL_SEPARATION_M = Math.hypot(
  HYPERBOLIC_FLYBY_INITIAL_X_M,
  HYPERBOLIC_FLYBY_IMPACT_OFFSET_M
);
export const HYPERBOLIC_FLYBY_INITIAL_RELATIVE_SPEED_MPS = Math.sqrt(
  HYPERBOLIC_FLYBY_EXCESS_SPEED_MPS ** 2 +
    (2 * HYPERBOLIC_FLYBY_GRAVITATIONAL_PARAMETER) /
      HYPERBOLIC_FLYBY_INITIAL_SEPARATION_M
);
export const HYPERBOLIC_FLYBY_SPECIFIC_ENERGY_J_PER_KG =
  0.5 * HYPERBOLIC_FLYBY_EXCESS_SPEED_MPS ** 2;
export const HYPERBOLIC_FLYBY_SPECIFIC_ANGULAR_MOMENTUM_M2PS =
  HYPERBOLIC_FLYBY_IMPACT_OFFSET_M *
  HYPERBOLIC_FLYBY_INITIAL_RELATIVE_SPEED_MPS;
export const HYPERBOLIC_FLYBY_ECCENTRICITY = Math.sqrt(
  1 +
    (2 *
      HYPERBOLIC_FLYBY_SPECIFIC_ENERGY_J_PER_KG *
      HYPERBOLIC_FLYBY_SPECIFIC_ANGULAR_MOMENTUM_M2PS ** 2) /
      HYPERBOLIC_FLYBY_GRAVITATIONAL_PARAMETER ** 2
);
export const HYPERBOLIC_FLYBY_PERIAPSIS_M =
  HYPERBOLIC_FLYBY_SPECIFIC_ANGULAR_MOMENTUM_M2PS ** 2 /
  (HYPERBOLIC_FLYBY_GRAVITATIONAL_PARAMETER *
    (1 + HYPERBOLIC_FLYBY_ECCENTRICITY));
export const HYPERBOLIC_FLYBY_TIME_STEP_SECONDS = 240;
export const HYPERBOLIC_FLYBY_SCHEDULER_CONFIG: FixedStepSchedulerConfig =
  Object.freeze({
    simulatedSecondsPerRealSecond: 7_200,
    maxSubStepsPerTick: 32,
    maxFrameDeltaSeconds: 0.25,
  });

const HYPERBOLIC_FLYBY_DEFINITIONS =
  createBarycentricTwoBodyDefinitions(
    {
      id: "flyby-primary",
      name: "Corps jovien",
      massKg: JUPITER_MASS_KG,
      physicalRadiusM: JUPITER_RADIUS_M,
    },
    {
      id: "flyby-visitor",
      name: "Visiteur terrestre",
      massKg: EARTH_MASS_KG,
      physicalRadiusM: EARTH_RADIUS_M,
    },
    vector3(
      -HYPERBOLIC_FLYBY_INITIAL_X_M,
      HYPERBOLIC_FLYBY_IMPACT_OFFSET_M,
      0
    ),
    vector3(HYPERBOLIC_FLYBY_INITIAL_RELATIVE_SPEED_MPS, 0, 0)
  );

export function createHyperbolicFlybyAppliedScenario() {
  return compilePresetScenario(
    HYPERBOLIC_FLYBY_PRESET_ID,
    HYPERBOLIC_FLYBY_DEFINITIONS,
    ["#f59e0b", "#60a5fa"],
    "balanced",
    HYPERBOLIC_FLYBY_TIME_STEP_SECONDS
  );
}

export const HYPERBOLIC_FLYBY_PRESET = defineGravityPreset({
  id: HYPERBOLIC_FLYBY_PRESET_ID,
  name: "Survol hyperbolique à deux corps",
  shortDescription:
    "Un visiteur terrestre non lié est dévié lors du passage près d’un corps jovien mobile.",
  category: "multi-body",
  educationalLevel: "intermediate",
  bodyCount: 2,
  expectedPhysicalDomain: "newtonian-n-body",
  schedulerConfig: HYPERBOLIC_FLYBY_SCHEDULER_CONFIG,
  createScenario: createHyperbolicFlybyAppliedScenario,
});
