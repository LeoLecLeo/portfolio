import { describe, expect, it } from "vitest";

import { assessTimeStepBudget } from "../physics/timeStepRecommendation";
import {
  GRAVITY_LAB_MAX_FRAME_DELTA_SECONDS,
  GRAVITY_LAB_MAX_SUBSTEPS_PER_FRAME,
  createGravityLabSchedulerConfig,
  createSafeSchedulerConfig,
} from "./schedulerPolicy";

describe("gravity-lab scheduler policy", () => {
  it.each([10_000, 0.001])(
    "derives a safe cadence for a physical step of %s seconds",
    (physicalTimeStepSeconds) => {
      const config = createGravityLabSchedulerConfig(
        physicalTimeStepSeconds
      );
      const assessment = assessTimeStepBudget(
        physicalTimeStepSeconds,
        config
      );

      expect(config.simulatedSecondsPerRealSecond).toBe(
        (physicalTimeStepSeconds * 32 * 0.75) / 0.25
      );
      expect(assessment.exceedsBudget).toBe(false);
      expect(assessment.requiredSubStepsAtMaximumFrame).toBeLessThanOrEqual(
        GRAVITY_LAB_MAX_SUBSTEPS_PER_FRAME
      );
    }
  );

  it("caps a preferred cadence by the calculated safe maximum", () => {
    const physicalTimeStepSeconds = 1;
    const config = createGravityLabSchedulerConfig(
      physicalTimeStepSeconds,
      10_000
    );

    expect(config.simulatedSecondsPerRealSecond).toBe(96);
    expect(
      assessTimeStepBudget(physicalTimeStepSeconds, config)
        .exceedsBudget
    ).toBe(false);
  });

  it("is deterministic for identical policy inputs", () => {
    const input = {
      physicalTimeStepSeconds: 240,
      maxFrameDeltaSeconds: GRAVITY_LAB_MAX_FRAME_DELTA_SECONDS,
      maxSubStepsPerFrame: GRAVITY_LAB_MAX_SUBSTEPS_PER_FRAME,
      safetyMarginFraction: 0.25,
      preferredSimulatedSecondsPerRealSecond: 7_200,
    } as const;

    expect(createSafeSchedulerConfig(input)).toEqual(
      createSafeSchedulerConfig(input)
    );
    expect(Object.isFrozen(createSafeSchedulerConfig(input))).toBe(true);
  });
});
