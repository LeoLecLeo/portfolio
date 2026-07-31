import {
  ASTRONOMICAL_UNIT_M,
  EARTH_MASS_KG,
  EARTH_RADIUS_M,
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SOLAR_MASS_KG,
  SOLAR_RADIUS_M,
} from "../core/units";
import { vector3 } from "../core/vector3";
import { defineGravityPreset } from "./gravityPreset";
import {
  compilePresetScenario,
  createBarycentricTwoBodyDefinitions,
} from "./presetScenario";

export const STAR_PLANET_PRESET_ID = "star-planet-quasi-circular";
export const STAR_PLANET_SEMI_MAJOR_AXIS_M = ASTRONOMICAL_UNIT_M;
export const STAR_PLANET_ECCENTRICITY = 0.0167;
export const STAR_PLANET_TOTAL_MASS_KG =
  SOLAR_MASS_KG + EARTH_MASS_KG;
export const STAR_PLANET_INITIAL_SEPARATION_M =
  STAR_PLANET_SEMI_MAJOR_AXIS_M * (1 - STAR_PLANET_ECCENTRICITY);
export const STAR_PLANET_INITIAL_RELATIVE_SPEED_MPS = Math.sqrt(
  (GRAVITATIONAL_CONSTANT_M3_KG_S2 * STAR_PLANET_TOTAL_MASS_KG *
    (1 + STAR_PLANET_ECCENTRICITY)) /
    STAR_PLANET_INITIAL_SEPARATION_M
);
export const STAR_PLANET_PERIOD_SECONDS =
  2 *
  Math.PI *
  Math.sqrt(
    STAR_PLANET_SEMI_MAJOR_AXIS_M ** 3 /
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
        STAR_PLANET_TOTAL_MASS_KG)
  );
export const STAR_PLANET_STEPS_PER_PERIOD = 4_096;
export const STAR_PLANET_TIME_STEP_SECONDS =
  STAR_PLANET_PERIOD_SECONDS / STAR_PLANET_STEPS_PER_PERIOD;

const STAR_PLANET_DEFINITIONS = createBarycentricTwoBodyDefinitions(
  {
    id: "star",
    name: "Étoile",
    massKg: SOLAR_MASS_KG,
    physicalRadiusM: SOLAR_RADIUS_M,
  },
  {
    id: "planet",
    name: "Planète",
    massKg: EARTH_MASS_KG,
    physicalRadiusM: EARTH_RADIUS_M,
  },
  vector3(STAR_PLANET_INITIAL_SEPARATION_M, 0, 0),
  vector3(0, STAR_PLANET_INITIAL_RELATIVE_SPEED_MPS, 0)
);

export function createStarPlanetAppliedScenario() {
  return compilePresetScenario(
    STAR_PLANET_PRESET_ID,
    STAR_PLANET_DEFINITIONS,
    ["#fcd34d", "#67e8f9"],
    "balanced",
    STAR_PLANET_TIME_STEP_SECONDS
  );
}

export const STAR_PLANET_PRESET = defineGravityPreset({
  id: STAR_PLANET_PRESET_ID,
  name: "Étoile et planète quasi circulaire",
  shortDescription:
    "Une planète légère suit une orbite de faible excentricité autour d’une étoile mobile.",
  category: "planetary-system",
  educationalLevel: "introductory",
  bodyCount: 2,
  expectedPhysicalDomain: "newtonian-n-body",
  createScenario: createStarPlanetAppliedScenario,
});
