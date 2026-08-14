import { describe, expect, it } from "vitest";

import {
  CIRCULAR_TWO_BODY_PRESET,
  CIRCULAR_TWO_BODY_TIME_STEP_SECONDS,
} from "../presets/circularTwoBody";
import type { GravityPreset } from "../presets/gravityPreset";
import {
  HYPERBOLIC_FLYBY_PRESET,
  HYPERBOLIC_FLYBY_TIME_STEP_SECONDS,
} from "../presets/hyperbolicFlyby";
import {
  INCLINED_BINARY_PRESET,
  INCLINED_BINARY_SCHEDULER_CONFIG,
  INCLINED_BINARY_TIME_STEP_SECONDS,
  createInclinedBinaryAppliedScenario,
} from "../presets/inclinedBinary";
import { STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE } from "../presets/presetSchedulerPolicies";
import {
  STAR_PLANET_PRESET,
  STAR_PLANET_TIME_STEP_SECONDS,
} from "../presets/starPlanet";
import { assessTimeStepBudget } from "../physics/timeStepRecommendation";
import { GravityLabSessionHost } from "../runtime/GravityLabSession";
import { createGravityLabSchedulerConfig } from "../runtime/schedulerPolicy";
import { applyGravityLabDraft } from "./gravityLabApplication";
import {
  createGravityLabState,
  gravityLabReducer,
  type GravityLabState,
} from "./gravityLabReducer";
import { preparePresetDraftLoad } from "./presetDraftLoading";

const ORBITAL_PRESETS = [
  INCLINED_BINARY_PRESET,
  CIRCULAR_TWO_BODY_PRESET,
  STAR_PLANET_PRESET,
] as const;

const ALL_PRESETS = [
  ...ORBITAL_PRESETS,
  HYPERBOLIC_FLYBY_PRESET,
] as const;

function setup() {
  const host = new GravityLabSessionHost({
    appliedScenario: createInclinedBinaryAppliedScenario(
      INCLINED_BINARY_SCHEDULER_CONFIG
    ),
    schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
  });

  return {
    host,
    state: createGravityLabState(host.snapshot),
  };
}

function applyPreset(
  state: GravityLabState,
  host: GravityLabSessionHost,
  preset: GravityPreset
): GravityLabState {
  const prepared = preparePresetDraftLoad(preset, false, () => {
    throw new Error("A synchronized draft must not ask for confirmation.");
  });

  expect(prepared.kind).toBe("ready");
  if (prepared.kind !== "ready") {
    throw new Error(`Expected preset "${preset.id}" to load.`);
  }

  const loaded = gravityLabReducer(state, prepared.action);

  expect(
    loaded.draftPreferredSimulatedSecondsPerRealSecond
  ).toBe(
    preset.preferredSimulatedSecondsPerRealSecond
  );

  const result = applyGravityLabDraft(loaded, host);

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected preset "${preset.id}" to apply.`);
  }

  const applied = gravityLabReducer(loaded, result.action);

  expect(applied.activeSession.schedulerConfig).toEqual(
    createGravityLabSchedulerConfig(
      applied.appliedScenario.numericalPolicy.timeStepSeconds,
      preset.preferredSimulatedSecondsPerRealSecond
    )
  );
  return applied;
}

describe("preset scheduler transitions", () => {
  it.each(ORBITAL_PRESETS)(
    "restores $id after the hyperbolic preset",
    (targetPreset) => {
      const { host, state: initial } = setup();
      const hyperbolic = applyPreset(
        initial,
        host,
        HYPERBOLIC_FLYBY_PRESET
      );
      const target = applyPreset(hyperbolic, host, targetPreset);

      expect(
        target.activeSession.schedulerConfig
          .simulatedSecondsPerRealSecond
      ).toBe(
        STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE
      );
    }
  );

  it.each(ORBITAL_PRESETS)(
    "applies the hyperbolic cadence after $id",
    (sourcePreset) => {
      const { host, state: initial } = setup();
      const orbital = applyPreset(initial, host, sourcePreset);
      const hyperbolic = applyPreset(
        orbital,
        host,
        HYPERBOLIC_FLYBY_PRESET
      );

      expect(
        hyperbolic.activeSession.schedulerConfig
          .simulatedSecondsPerRealSecond
      ).toBe(7_200);
    }
  );

  it.each(ALL_PRESETS)(
    "keeps $id stable when loaded repeatedly",
    (preset) => {
      const { host, state: initial } = setup();
      const first = applyPreset(initial, host, preset);
      const second = applyPreset(first, host, preset);

      expect(second.activeSession.schedulerConfig).toEqual(
        createGravityLabSchedulerConfig(
          second.appliedScenario.numericalPolicy.timeStepSeconds,
          preset.preferredSimulatedSecondsPerRealSecond
        )
      );
    }
  );

  it("makes the final cadence independent of every previous preset", () => {
    for (const previousPreset of ALL_PRESETS) {
      for (const targetPreset of ALL_PRESETS) {
        const { host, state: initial } = setup();
        const previous = applyPreset(
          initial,
          host,
          previousPreset
        );
        const target = applyPreset(previous, host, targetPreset);

        expect(target.activeSession.schedulerConfig).toEqual(
          createGravityLabSchedulerConfig(
            target.appliedScenario.numericalPolicy.timeStepSeconds,
            targetPreset.preferredSimulatedSecondsPerRealSecond
          )
        );
      }
    }
  });

  it.each([
    [INCLINED_BINARY_PRESET, INCLINED_BINARY_TIME_STEP_SECONDS, 22],
    [CIRCULAR_TWO_BODY_PRESET, CIRCULAR_TWO_BODY_TIME_STEP_SECONDS, 7],
    [STAR_PLANET_PRESET, STAR_PLANET_TIME_STEP_SECONDS, 3],
    [HYPERBOLIC_FLYBY_PRESET, HYPERBOLIC_FLYBY_TIME_STEP_SECONDS, 8],
  ] as const)(
    "keeps $0.id within its substep budget",
    (preset, expectedTimeStepSeconds, expectedRequiredSubSteps) => {
      const scenario = preset.createScenario();

      expect(scenario.numericalPolicy.timeStepSeconds).toBe(
        expectedTimeStepSeconds
      );
      expect(
        assessTimeStepBudget(
          scenario.numericalPolicy.timeStepSeconds,
          createGravityLabSchedulerConfig(
            scenario.numericalPolicy.timeStepSeconds,
            preset.preferredSimulatedSecondsPerRealSecond
          )
        )
      ).toEqual({
        requiredSubStepsAtMaximumFrame: expectedRequiredSubSteps,
        exceedsBudget: false,
      });
    }
  );
});
