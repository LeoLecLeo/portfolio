import {
  isAppliedScenario,
  type AppliedScenario,
} from "../core/scenario";
import { MAX_NEWTONIAN_BODIES } from "../core/types";

export type GravityPresetCategory =
  | "binary-system"
  | "planetary-system"
  | "multi-body"
  | "spaceflight";

export type GravityPresetEducationalLevel =
  | "introductory"
  | "intermediate"
  | "advanced";

export type GravityPresetPhysicalDomain = "newtonian-n-body";

export type GravityPresetPedagogy = Readonly<{
  learningObjective: string;
  observedPhenomenon: string;
  keyParameters: readonly string[];
  interestingParametersToModify: readonly string[];
  expectedResult: string;
  limitationOrWarning: string;
}>;

export type GravityPreset = Readonly<{
  id: string;
  name: string;
  shortDescription: string;
  category: GravityPresetCategory;
  educationalLevel: GravityPresetEducationalLevel;
  bodyCount: number;
  expectedPhysicalDomain: GravityPresetPhysicalDomain;
  pedagogy: GravityPresetPedagogy;
  preferredSimulatedSecondsPerRealSecond: number | null;
  createScenario: () => AppliedScenario;
}>;

export type GravityPresetDefinition = GravityPreset;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }
}

function freezeNonEmptyList(
  values: readonly string[],
  label: string
): readonly string[] {
  if (values.length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }

  for (const value of values) {
    assertNonEmpty(value, label);
  }

  return Object.freeze([...values]);
}

export function isValidPresetCadencePreference(
  value: unknown
): value is number | null {
  return value === null || (Number.isFinite(value) && Number(value) > 0);
}

export function defineGravityPreset(
  definition: GravityPresetDefinition
): GravityPreset {
  assertNonEmpty(definition.id, "Preset identifier");
  assertNonEmpty(definition.name, "Preset name");
  assertNonEmpty(definition.shortDescription, "Preset description");

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
    throw new TypeError(
      "A preset identifier must use stable lowercase kebab-case."
    );
  }

  if (
    !Number.isInteger(definition.bodyCount) ||
    definition.bodyCount < 1 ||
    definition.bodyCount > MAX_NEWTONIAN_BODIES
  ) {
    throw new RangeError(
      `Preset body count must be an integer between 1 and ${MAX_NEWTONIAN_BODIES}.`
    );
  }

  const presetId = definition.id;
  const bodyCount = definition.bodyCount;
  const pedagogy = Object.freeze({
    learningObjective: definition.pedagogy.learningObjective,
    observedPhenomenon: definition.pedagogy.observedPhenomenon,
    keyParameters: freezeNonEmptyList(
      definition.pedagogy.keyParameters,
      "Preset key parameters"
    ),
    interestingParametersToModify: freezeNonEmptyList(
      definition.pedagogy.interestingParametersToModify,
      "Preset interesting parameters"
    ),
    expectedResult: definition.pedagogy.expectedResult,
    limitationOrWarning: definition.pedagogy.limitationOrWarning,
  });

  assertNonEmpty(
    pedagogy.learningObjective,
    "Preset learning objective"
  );
  assertNonEmpty(
    pedagogy.observedPhenomenon,
    "Preset observed phenomenon"
  );
  assertNonEmpty(pedagogy.expectedResult, "Preset expected result");
  assertNonEmpty(
    pedagogy.limitationOrWarning,
    "Preset limitation or warning"
  );
  if (
    !isValidPresetCadencePreference(
      definition.preferredSimulatedSecondsPerRealSecond
    )
  ) {
    throw new RangeError(
      `Preset "${presetId}" has an invalid cadence preference.`
    );
  }

  const scenarioFactory = definition.createScenario;
  const createScenario = (): AppliedScenario => {
    const scenario = scenarioFactory();

    if (!isAppliedScenario(scenario)) {
      throw new TypeError(
        `Preset "${presetId}" did not produce a valid immutable AppliedScenario.`
      );
    }

    if (scenario.physics.bodies.length !== bodyCount) {
      throw new RangeError(
        `Preset "${presetId}" declares ${bodyCount} bodies but produced ${scenario.physics.bodies.length}.`
      );
    }

    return scenario;
  };

  Object.freeze(createScenario);

  return Object.freeze({
    id: presetId,
    name: definition.name,
    shortDescription: definition.shortDescription,
    category: definition.category,
    educationalLevel: definition.educationalLevel,
    bodyCount,
    expectedPhysicalDomain: definition.expectedPhysicalDomain,
    pedagogy,
    preferredSimulatedSecondsPerRealSecond:
      definition.preferredSimulatedSecondsPerRealSecond,
    createScenario,
  });
}
