import { describe, expect, it } from "vitest";

import {
  HYPERBOLIC_FLYBY_PRESET,
  HYPERBOLIC_FLYBY_SCHEDULER_CONFIG,
  HYPERBOLIC_FLYBY_TIME_STEP_SECONDS,
} from "../presets/hyperbolicFlyby";
import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_SCHEDULER_CONFIG,
} from "../presets/inclinedBinary";
import { assessTimeStepBudget } from "../physics/timeStepRecommendation";
import { GravityLabSessionHost } from "../runtime/GravityLabSession";
import { applyGravityLabDraft } from "./gravityLabApplication";
import {
  createGravityLabState,
  gravityLabReducer,
} from "./gravityLabReducer";
import { preparePresetDraftLoad } from "./presetDraftLoading";

function loadAndApplyHyperbolicPreset() {
  const host = new GravityLabSessionHost({
    appliedScenario: createInclinedBinaryAppliedScenario(
      INCLINED_BINARY_SCHEDULER_CONFIG
    ),
    schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
  });
  const initial = createGravityLabState(host.snapshot);
  const prepared = preparePresetDraftLoad(
    HYPERBOLIC_FLYBY_PRESET,
    false,
    () => {
      throw new Error("A synchronized draft must not ask for confirmation.");
    }
  );

  expect(prepared.kind).toBe("ready");
  if (prepared.kind !== "ready") {
    throw new Error("Expected the hyperbolic preset to load.");
  }

  const loaded = gravityLabReducer(initial, prepared.action);
  const previousSession = initial.activeSession;

  expect(loaded.activeSession).toBe(previousSession);
  expect(
    loaded.draftPreferredSimulatedSecondsPerRealSecond
  ).toBe(7_200);
  const afterActiveSessionTelemetry = gravityLabReducer(loaded, {
    type: "session-updated",
    snapshot: host.pause(),
  });

  expect(
    afterActiveSessionTelemetry.draftPreferredSimulatedSecondsPerRealSecond
  ).toBe(7_200);

  const result = applyGravityLabDraft(afterActiveSessionTelemetry, host);

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected the hyperbolic preset to apply.");
  }
  expect(result.report.warnings).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "step.budget-exceeded" }),
    ])
  );

  const applied = gravityLabReducer(
    afterActiveSessionTelemetry,
    result.action
  );

  return { host, initial, loaded, applied, previousSession };
}

describe("hyperbolic preset real-time compatibility", () => {
  it("documents the former 87-substep mismatch and the corrected budget", () => {
    expect(
      assessTimeStepBudget(
        HYPERBOLIC_FLYBY_TIME_STEP_SECONDS,
        INCLINED_BINARY_SCHEDULER_CONFIG
      )
    ).toEqual({
      requiredSubStepsAtMaximumFrame: 87,
      exceedsBudget: true,
    });
    expect(
      assessTimeStepBudget(
        HYPERBOLIC_FLYBY_TIME_STEP_SECONDS,
        HYPERBOLIC_FLYBY_SCHEDULER_CONFIG
      )
    ).toEqual({
      requiredSubStepsAtMaximumFrame: 8,
      exceedsBudget: false,
    });
  });

  it("loads and applies with its explicit scheduler configuration", () => {
    const { applied, previousSession } =
      loadAndApplyHyperbolicPreset();
    const telemetry = applied.activeSession.runtime.telemetry();

    expect(applied.activeSession).not.toBe(previousSession);
    expect(previousSession.runtime.isDisposed).toBe(true);
    expect(applied.activeSession.schedulerConfig).toEqual(
      HYPERBOLIC_FLYBY_SCHEDULER_CONFIG
    );
    expect(telemetry.status).toBe("paused");
    expect(telemetry.timeSeconds).toBe(0);
    expect(telemetry.timeStepSeconds).toBe(
      HYPERBOLIC_FLYBY_TIME_STEP_SECONDS
    );
    expect(telemetry.recommendedTimeStepSeconds).not.toBeNull();
    expect(HYPERBOLIC_FLYBY_TIME_STEP_SECONDS).toBeLessThanOrEqual(
      telemetry.recommendedTimeStepSeconds ?? 0
    );
    expect(telemetry.timeStepBudgetAssessment).toEqual({
      requiredSubStepsAtMaximumFrame: 8,
      exceedsBudget: false,
    });
  });

  it("stays within budget through pause, resume and reset", () => {
    const { host, applied } = loadAndApplyHyperbolicPreset();
    const session = applied.activeSession;
    const runtime = session.runtime;
    const maximumDeltaSeconds =
      HYPERBOLIC_FLYBY_SCHEDULER_CONFIG.maxFrameDeltaSeconds;

    expect(host.resume().telemetry.status).toBe("running");
    expect(runtime.advanceFrame(maximumDeltaSeconds)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBe(0);

    expect(runtime.advanceFrame(maximumDeltaSeconds)).toBe(false);
    const firstAdvancedTime = runtime.telemetry().timeSeconds;
    expect(firstAdvancedTime).toBe(
      7 * HYPERBOLIC_FLYBY_TIME_STEP_SECONDS
    );
    expect(runtime.telemetry().status).toBe("running");
    expect(runtime.telemetry().schedulerMessage).toBeNull();

    expect(host.pause().telemetry.status).toBe("paused");
    expect(host.resume().telemetry.status).toBe("running");
    expect(runtime.advanceFrame(maximumDeltaSeconds)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBe(firstAdvancedTime);
    expect(runtime.advanceFrame(maximumDeltaSeconds)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBeGreaterThan(
      firstAdvancedTime
    );
    expect(runtime.telemetry().schedulerMessage).toBeNull();

    const reset = host.reset();
    expect(reset.telemetry.status).toBe("paused");
    expect(reset.telemetry.timeSeconds).toBe(0);
    expect(reset.telemetry.schedulerMessage).toBeNull();
    expect(reset.session.schedulerConfig).toEqual(
      HYPERBOLIC_FLYBY_SCHEDULER_CONFIG
    );
  });

  it("advances deterministically without accumulating an unbounded debt", () => {
    const first = loadAndApplyHyperbolicPreset().applied.activeSession;
    const second = loadAndApplyHyperbolicPreset().applied.activeSession;
    const maximumDeltaSeconds =
      HYPERBOLIC_FLYBY_SCHEDULER_CONFIG.maxFrameDeltaSeconds;

    expect(first.runtime.resume()).toBe(true);
    expect(second.runtime.resume()).toBe(true);

    for (let frame = 0; frame < 101; frame += 1) {
      expect(first.runtime.advanceFrame(maximumDeltaSeconds)).toBe(
        false
      );
      expect(second.runtime.advanceFrame(maximumDeltaSeconds)).toBe(
        false
      );
    }

    const expectedTimeSeconds =
      750 * HYPERBOLIC_FLYBY_TIME_STEP_SECONDS;
    const firstTelemetry = first.runtime.telemetry();
    const secondTelemetry = second.runtime.telemetry();

    expect(firstTelemetry.timeSeconds).toBe(expectedTimeSeconds);
    expect(secondTelemetry.timeSeconds).toBe(expectedTimeSeconds);
    expect(firstTelemetry.totalEnergyJ).toBe(secondTelemetry.totalEnergyJ);
    expect(firstTelemetry.schedulerMessage).toBeNull();
    expect(secondTelemetry.schedulerMessage).toBeNull();
  });
});
