import {
  EARTH_MASS_KG,
  EARTH_RADIUS_M,
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
} from "../core/units";
import { vector3 } from "../core/vector3";
import { defineGravityPreset } from "./gravityPreset";
import { STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE } from "./presetSchedulerPolicies";
import {
  compilePresetScenario,
  createBarycentricTwoBodyDefinitions,
} from "./presetScenario";

export const CIRCULAR_TWO_BODY_PRESET_ID = "circular-two-body";
export const CIRCULAR_TWO_BODY_SEPARATION_M = 1e9;
export const CIRCULAR_TWO_BODY_TOTAL_MASS_KG = 2 * EARTH_MASS_KG;
export const CIRCULAR_TWO_BODY_RELATIVE_SPEED_MPS = Math.sqrt(
  (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
    CIRCULAR_TWO_BODY_TOTAL_MASS_KG) /
    CIRCULAR_TWO_BODY_SEPARATION_M
);
export const CIRCULAR_TWO_BODY_PERIOD_SECONDS =
  2 *
  Math.PI *
  Math.sqrt(
    CIRCULAR_TWO_BODY_SEPARATION_M ** 3 /
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
        CIRCULAR_TWO_BODY_TOTAL_MASS_KG)
  );
export const CIRCULAR_TWO_BODY_STEPS_PER_PERIOD = 2_048;
export const CIRCULAR_TWO_BODY_TIME_STEP_SECONDS =
  CIRCULAR_TWO_BODY_PERIOD_SECONDS /
  CIRCULAR_TWO_BODY_STEPS_PER_PERIOD;

const CIRCULAR_TWO_BODY_DEFINITIONS =
  createBarycentricTwoBodyDefinitions(
    {
      id: "circular-a",
      name: "Corps circulaire A",
      massKg: EARTH_MASS_KG,
      physicalRadiusM: EARTH_RADIUS_M,
    },
    {
      id: "circular-b",
      name: "Corps circulaire B",
      massKg: EARTH_MASS_KG,
      physicalRadiusM: EARTH_RADIUS_M,
    },
    vector3(CIRCULAR_TWO_BODY_SEPARATION_M, 0, 0),
    vector3(0, CIRCULAR_TWO_BODY_RELATIVE_SPEED_MPS, 0)
  );

export function createCircularTwoBodyAppliedScenario() {
  return compilePresetScenario(
    CIRCULAR_TWO_BODY_PRESET_ID,
    CIRCULAR_TWO_BODY_DEFINITIONS,
    ["#67e8f9", "#f0abfc"],
    "balanced",
    CIRCULAR_TWO_BODY_TIME_STEP_SECONDS
  );
}

export const CIRCULAR_TWO_BODY_PRESET = defineGravityPreset({
  id: CIRCULAR_TWO_BODY_PRESET_ID,
  name: "Orbite circulaire à deux corps",
  shortDescription:
    "Deux masses terrestres égales décrivent une orbite circulaire autour de leur barycentre.",
  category: "binary-system",
  educationalLevel: "introductory",
  bodyCount: 2,
  expectedPhysicalDomain: "newtonian-n-body",
  pedagogy: {
    learningObjective:
      "Comprendre l’équilibre entre vitesse tangentielle et attraction gravitationnelle.",
    observedPhenomenon:
      "Deux masses égales décrivent des cercles opposés autour du barycentre.",
    keyParameters: [
      "Masses : 1 masse terrestre chacune",
      "Séparation : 1,0 × 10⁹ m",
      "Pas : période divisée par 2 048",
    ],
    interestingParametersToModify: [
      "Augmenter ou réduire la vitesse tangentielle",
      "Changer la séparation initiale",
    ],
    expectedResult:
      "Une séparation presque constante et deux trajectoires circulaires symétriques.",
    limitationOrWarning:
      "L’orbite circulaire suppose des conditions initiales idéales et aucun perturbateur externe.",
  },
  preferredSimulatedSecondsPerRealSecond:
    STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE,
  createScenario: createCircularTwoBodyAppliedScenario,
});
