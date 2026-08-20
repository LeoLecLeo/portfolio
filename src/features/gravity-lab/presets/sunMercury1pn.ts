import { SOLAR_RADIUS_M } from "../core/units";
import { vector3 } from "../core/vector3";
import {
  MERCURY_MASS_KG,
  MERCURY_RADIUS_M,
  MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS,
  createMercuryValidationInitialState,
} from "../experiments/mercuryPerihelionExperiment";
import { defineGravityPreset } from "./gravityPreset";
import { compilePresetScenario } from "./presetScenario";

export const SUN_MERCURY_1PN_PRESET_ID = "sun-mercury-1pn";

export function createSunMercury1pnAppliedScenario() {
  const initialState = createMercuryValidationInitialState();

  return compilePresetScenario(
    SUN_MERCURY_1PN_PRESET_ID,
    [
      {
        id: "sun",
        name: "Soleil",
        massKg: initialState.massesKg[0],
        physicalRadiusM: SOLAR_RADIUS_M,
        fixed: false,
        initialPositionM: vector3(
          initialState.positionsM[0],
          initialState.positionsM[1],
          initialState.positionsM[2]
        ),
        initialVelocityMps: vector3(
          initialState.velocitiesMps[0],
          initialState.velocitiesMps[1],
          initialState.velocitiesMps[2]
        ),
      },
      {
        id: "mercury",
        name: "Mercure",
        massKg: MERCURY_MASS_KG,
        physicalRadiusM: MERCURY_RADIUS_M,
        fixed: false,
        initialPositionM: vector3(
          initialState.positionsM[3],
          initialState.positionsM[4],
          initialState.positionsM[5]
        ),
        initialVelocityMps: vector3(
          initialState.velocitiesMps[3],
          initialState.velocitiesMps[4],
          initialState.velocitiesMps[5]
        ),
      },
    ],
    ["#fbbf24", "#a8a29e"],
    "balanced",
    MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS,
    "first-post-newtonian"
  );
}

export const SUN_MERCURY_1PN_PRESET = defineGravityPreset({
  id: SUN_MERCURY_1PN_PRESET_ID,
  name: "Soleil–Mercure · précession 1PN",
  shortDescription:
    "Mercure au périhélie dans un système barycentrique à deux corps, intégré avec les corrections EIH 1PN.",
  category: "planetary-system",
  educationalLevel: "advanced",
  bodyCount: 2,
  expectedPhysicalDomain: "first-post-newtonian-weak-field",
  pedagogy: {
    learningObjective:
      "Observer l’accumulation de la correction relativiste sur l’orientation du périhélie de Mercure.",
    observedPhenomenon:
      "Le périhélie avance légèrement à chaque orbite ; Newton seul ne reproduit pas cette composante relativiste.",
    keyParameters: [
      "Soleil et Mercure seuls, référentiel barycentrique",
      "Pas RK4 fixe : 3 600 s",
      "Référence relativiste : environ 43 secondes d’arc par siècle",
    ],
    interestingParametersToModify: [
      "Basculer le modèle vers Newtonien avant application",
      "Observer plusieurs passages successifs au périhélie",
    ],
    expectedResult:
      "Le modèle 1PN reproduit la première correction de précession prédite par la relativité générale.",
    limitationOrWarning:
      "1PN est une approximation conservative en champ faible et à faible vitesse, pas la relativité générale complète ; les autres planètes sont absentes.",
  },
  preferredSimulatedSecondsPerRealSecond: null,
  createScenario: createSunMercury1pnAppliedScenario,
});
