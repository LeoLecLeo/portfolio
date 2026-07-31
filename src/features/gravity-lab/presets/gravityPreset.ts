import {
  isAppliedScenario,
  type AppliedScenario,
} from "../core/scenario";
import { MAX_NEWTONIAN_BODIES } from "../core/types";
import type { FixedStepSchedulerConfig } from "../runtime/FixedStepScheduler";

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

export type GravityPreset = Readonly<{
  id: string;
  name: string;
  shortDescription: string;
  category: GravityPresetCategory;
  educationalLevel: GravityPresetEducationalLevel;
  bodyCount: number;
  expectedPhysicalDomain: GravityPresetPhysicalDomain;
  schedulerConfig?: FixedStepSchedulerConfig;
  createScenario: () => AppliedScenario;
}>;

export type GravityPresetDefinition = GravityPreset;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }
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
  const schedulerConfig =
    definition.schedulerConfig === undefined
      ? undefined
      : Object.freeze({ ...definition.schedulerConfig });

  if (schedulerConfig !== undefined) {
    if (
      !Number.isFinite(
        schedulerConfig.simulatedSecondsPerRealSecond
      ) ||
      schedulerConfig.simulatedSecondsPerRealSecond <= 0 ||
      !Number.isInteger(schedulerConfig.maxSubStepsPerTick) ||
      schedulerConfig.maxSubStepsPerTick <= 0 ||
      !Number.isFinite(schedulerConfig.maxFrameDeltaSeconds) ||
      schedulerConfig.maxFrameDeltaSeconds <= 0
    ) {
      throw new RangeError(
        `Preset "${presetId}" has an invalid scheduler configuration.`
      );
    }
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
    ...(schedulerConfig === undefined ? {} : { schedulerConfig }),
    createScenario,
  });
}
