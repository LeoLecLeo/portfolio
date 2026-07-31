import {
  DISTANCE_DRAFT_UNIT_CONVERTER,
  MASS_DRAFT_UNIT_CONVERTER,
  SPEED_DRAFT_UNIT_CONVERTER,
  TIME_DRAFT_UNIT_CONVERTER,
  createDraftNumberFromSi,
  type AppliedScenario,
  type BodyDraft,
  type ScenarioDraft,
} from "../core/scenario";
import { compileScenarioDraft } from "../core/scenarioCompiler";
import type { CelestialBodyDefinition } from "../core/types";
import { vector3, type Vector3 } from "../core/vector3";
import type { PrecisionProfile } from "../physics/timeStepRecommendation";

type BarycentricBodyMetadata = Readonly<{
  id: string;
  name: string;
  massKg: number;
  physicalRadiusM: number;
}>;

export function createBarycentricTwoBodyDefinitions(
  first: BarycentricBodyMetadata,
  second: BarycentricBodyMetadata,
  relativePositionM: Vector3,
  relativeVelocityMps: Vector3
): readonly [CelestialBodyDefinition, CelestialBodyDefinition] {
  const totalMassKg = first.massKg + second.massKg;
  const firstFraction = second.massKg / totalMassKg;
  const secondFraction = first.massKg / totalMassKg;

  return [
    {
      ...first,
      fixed: false,
      initialPositionM: vector3(
        -firstFraction * relativePositionM.x,
        -firstFraction * relativePositionM.y,
        -firstFraction * relativePositionM.z
      ),
      initialVelocityMps: vector3(
        -firstFraction * relativeVelocityMps.x,
        -firstFraction * relativeVelocityMps.y,
        -firstFraction * relativeVelocityMps.z
      ),
    },
    {
      ...second,
      fixed: false,
      initialPositionM: vector3(
        secondFraction * relativePositionM.x,
        secondFraction * relativePositionM.y,
        secondFraction * relativePositionM.z
      ),
      initialVelocityMps: vector3(
        secondFraction * relativeVelocityMps.x,
        secondFraction * relativeVelocityMps.y,
        secondFraction * relativeVelocityMps.z
      ),
    },
  ];
}

function bodyToSiDraft(
  body: CelestialBodyDefinition,
  color: string
): BodyDraft {
  return {
    id: body.id,
    name: body.name,
    color,
    fixed: body.fixed,
    mass: createDraftNumberFromSi(
      body.massKg,
      "kg",
      MASS_DRAFT_UNIT_CONVERTER
    ),
    physicalRadius: createDraftNumberFromSi(
      body.physicalRadiusM,
      "m",
      DISTANCE_DRAFT_UNIT_CONVERTER
    ),
    initialPosition: {
      x: createDraftNumberFromSi(
        body.initialPositionM.x,
        "m",
        DISTANCE_DRAFT_UNIT_CONVERTER
      ),
      y: createDraftNumberFromSi(
        body.initialPositionM.y,
        "m",
        DISTANCE_DRAFT_UNIT_CONVERTER
      ),
      z: createDraftNumberFromSi(
        body.initialPositionM.z,
        "m",
        DISTANCE_DRAFT_UNIT_CONVERTER
      ),
    },
    initialVelocity: {
      x: createDraftNumberFromSi(
        body.initialVelocityMps.x,
        "m/s",
        SPEED_DRAFT_UNIT_CONVERTER
      ),
      y: createDraftNumberFromSi(
        body.initialVelocityMps.y,
        "m/s",
        SPEED_DRAFT_UNIT_CONVERTER
      ),
      z: createDraftNumberFromSi(
        body.initialVelocityMps.z,
        "m/s",
        SPEED_DRAFT_UNIT_CONVERTER
      ),
    },
  };
}

export function compilePresetScenario(
  presetId: string,
  bodies: readonly CelestialBodyDefinition[],
  colors: readonly string[],
  precisionProfile: PrecisionProfile,
  maximumTimeStepSeconds: number
): AppliedScenario {
  if (colors.length !== bodies.length) {
    throw new RangeError(
      `Preset "${presetId}" needs exactly one color per body.`
    );
  }

  const draft: ScenarioDraft = {
    bodies: bodies.map((body, bodyIndex) =>
      bodyToSiDraft(body, colors[bodyIndex])
    ),
    precisionProfile,
    maximumTimeStep: createDraftNumberFromSi(
      maximumTimeStepSeconds,
      "s",
      TIME_DRAFT_UNIT_CONVERTER
    ),
  };
  const result = compileScenarioDraft(draft);

  if (!result.ok) {
    const summary = result.report.errors
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join("; ");

    throw new RangeError(
      `Preset "${presetId}" did not compile: ${summary}`
    );
  }

  return result.scenario;
}
