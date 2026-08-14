import { describe, expect, it } from "vitest";

import {
  TIME_DRAFT_UNIT_CONVERTER,
  createDraftNumberFromSi,
} from "../core/scenario";
import { compileScenarioDraft } from "../core/scenarioCompiler";
import {
  HYPERBOLIC_FLYBY_PRESET,
} from "../presets/hyperbolicFlyby";
import {
  INCLINED_BINARY_SCHEDULER_CONFIG,
  createInclinedBinaryAppliedScenario,
} from "../presets/inclinedBinary";
import { assessTimeStepBudget } from "../physics/timeStepRecommendation";
import { GravityLabSessionHost } from "../runtime/GravityLabSession";
import { createGravityLabSchedulerConfig } from "../runtime/schedulerPolicy";
import { applyGravityLabDraft } from "./gravityLabApplication";
import {
  createGravityLabState,
  gravityLabReducer,
  type DraftNumericField,
  type GravityLabState,
} from "./gravityLabReducer";
import { preparePresetDraftLoad } from "./presetDraftLoading";

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

function applyState(
  state: GravityLabState,
  host: GravityLabSessionHost
): GravityLabState {
  const result = applyGravityLabDraft(state, host);

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected the user scenario to apply.");
  }

  return gravityLabReducer(state, result.action);
}

function oneBodyState(
  state: GravityLabState,
  physicalTimeStepSeconds: number
): GravityLabState {
  const body = state.draft.bodies[0];

  return {
    ...state,
    draft: {
      ...state.draft,
      bodies: [body],
      maximumTimeStep: createDraftNumberFromSi(
        physicalTimeStepSeconds,
        "s",
        TIME_DRAFT_UNIT_CONVERTER
      ),
    },
    selectedDraftBodyId: body.id,
    draftPreferredSimulatedSecondsPerRealSecond: null,
  };
}

describe("user-scenario scheduler policy", () => {
  it.each([10_000, 0.001])(
    "applies an automatic safe cadence for a %s-second physical step",
    (physicalTimeStepSeconds) => {
      const { host, state: initial } = setup();
      const applied = applyState(
        oneBodyState(initial, physicalTimeStepSeconds),
        host
      );
      const config = applied.activeSession.schedulerConfig;

      expect(applied.appliedScenario.numericalPolicy.timeStepSeconds).toBe(
        physicalTimeStepSeconds
      );
      expect(config).toEqual(
        createGravityLabSchedulerConfig(physicalTimeStepSeconds)
      );
      expect(
        assessTimeStepBudget(physicalTimeStepSeconds, config)
          .exceedsBudget
      ).toBe(false);
    }
  );

  it("does not inherit the previous hyperbolic cadence", () => {
    const { host, state: initial } = setup();
    const prepared = preparePresetDraftLoad(
      HYPERBOLIC_FLYBY_PRESET,
      false,
      () => true
    );

    if (prepared.kind !== "ready") {
      throw new Error("Expected the hyperbolic preset to load.");
    }

    const hyperbolic = applyState(
      gravityLabReducer(initial, prepared.action),
      host
    );
    expect(
      hyperbolic.activeSession.schedulerConfig
        .simulatedSecondsPerRealSecond
    ).toBe(7_200);

    const userScenario = applyState(
      oneBodyState(hyperbolic, 0.001),
      host
    );

    expect(
      userScenario.activeSession.schedulerConfig
        .simulatedSecondsPerRealSecond
    ).toBe(0.096);
    expect(
      userScenario.activeSession.schedulerConfig
        .simulatedSecondsPerRealSecond
    ).not.toBe(7_200);
  });

  it.each([
    ["mass", "0.5"],
    ["position-x", "0.2"],
    ["velocity-z", "500000"],
  ] as const)(
    "recalculates after changing %s",
    (field, rawText) => {
      const { host, state: initial } = setup();
      let uncapped: GravityLabState = {
        ...initial,
        draft: { ...initial.draft, maximumTimeStep: null },
        draftPreferredSimulatedSecondsPerRealSecond: null,
      };

      if (field === "mass") {
        for (const body of uncapped.draft.bodies) {
          for (const velocityField of [
            "velocity-x",
            "velocity-y",
            "velocity-z",
          ] as const) {
            uncapped = gravityLabReducer(uncapped, {
              type: "edit-number-raw",
              bodyId: body.id,
              field: velocityField,
              rawText: "0",
            });
          }
        }
      }

      const baseline = compileScenarioDraft(uncapped.draft);

      expect(baseline.ok).toBe(true);
      if (!baseline.ok) {
        throw new Error("Expected the baseline draft to compile.");
      }

      const edited = gravityLabReducer(uncapped, {
        type: "edit-number-raw",
        bodyId: uncapped.selectedDraftBodyId,
        field: field as DraftNumericField,
        rawText,
      });
      const applied = applyState(edited, host);
      const nextStep =
        applied.appliedScenario.numericalPolicy.timeStepSeconds;
      const baselineStep =
        baseline.scenario.numericalPolicy.timeStepSeconds;

      expect(nextStep).not.toBe(baselineStep);
      expect(applied.activeSession.schedulerConfig).toEqual(
        createGravityLabSchedulerConfig(nextStep)
      );
      expect(
        applied.sessionTelemetry.timeStepBudgetAssessment
          .exceedsBudget
      ).toBe(false);
    }
  );

  it("preserves pause, atomic application, reset and resume", () => {
    const { host, state: initial } = setup();
    const applied = applyState(oneBodyState(initial, 10), host);
    const runtime = applied.activeSession.runtime;
    const frameDeltaSeconds = 1 / 60;

    expect(applied.sessionTelemetry.status).toBe("paused");
    expect(applied.sessionTelemetry.timeSeconds).toBe(0);
    expect(host.reset().telemetry.status).toBe("paused");
    expect(host.snapshot.telemetry.timeSeconds).toBe(0);

    expect(host.resume().telemetry.status).toBe("running");
    expect(runtime.advanceFrame(frameDeltaSeconds)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBe(0);
    expect(runtime.advanceFrame(frameDeltaSeconds)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBeGreaterThan(0);
    expect(runtime.telemetry().schedulerMessage).toBeNull();
  });
});
