import { assessTimeStepBudget } from "../physics/timeStepRecommendation";
import type { FixedStepSchedulerConfig } from "./FixedStepScheduler";

export const GRAVITY_LAB_MAX_FRAME_DELTA_SECONDS = 0.25;
export const GRAVITY_LAB_MAX_SUBSTEPS_PER_FRAME = 32;
export const GRAVITY_LAB_SCHEDULER_SAFETY_MARGIN_FRACTION = 0.25;

export type SchedulerPolicyInput = Readonly<{
  physicalTimeStepSeconds: number;
  maxFrameDeltaSeconds: number;
  maxSubStepsPerFrame: number;
  safetyMarginFraction: number;
  preferredSimulatedSecondsPerRealSecond?: number | null;
}>;

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and greater than zero.`);
  }
}

export function createSafeSchedulerConfig(
  input: SchedulerPolicyInput
): FixedStepSchedulerConfig {
  assertPositiveFinite(
    input.physicalTimeStepSeconds,
    "Physical time step"
  );
  assertPositiveFinite(
    input.maxFrameDeltaSeconds,
    "Maximum frame delta"
  );

  if (
    !Number.isInteger(input.maxSubStepsPerFrame) ||
    input.maxSubStepsPerFrame <= 0
  ) {
    throw new RangeError(
      "Maximum substeps per frame must be a positive integer."
    );
  }

  if (
    !Number.isFinite(input.safetyMarginFraction) ||
    input.safetyMarginFraction <= 0 ||
    input.safetyMarginFraction >= 1
  ) {
    throw new RangeError(
      "Scheduler safety margin must be finite and strictly between zero and one."
    );
  }

  const preferred =
    input.preferredSimulatedSecondsPerRealSecond ?? null;

  if (preferred !== null) {
    assertPositiveFinite(preferred, "Preferred simulation cadence");
  }

  // Reserving a fixed fraction of the hard substep budget leaves explicit
  // headroom for frame jitter and a pre-existing fractional accumulator.
  const safeMaximumCadence =
    (input.physicalTimeStepSeconds *
      input.maxSubStepsPerFrame *
      (1 - input.safetyMarginFraction)) /
    input.maxFrameDeltaSeconds;

  assertPositiveFinite(safeMaximumCadence, "Safe simulation cadence");

  const simulatedSecondsPerRealSecond =
    preferred === null
      ? safeMaximumCadence
      : Math.min(preferred, safeMaximumCadence);
  const config = Object.freeze({
    simulatedSecondsPerRealSecond,
    maxSubStepsPerTick: input.maxSubStepsPerFrame,
    maxFrameDeltaSeconds: input.maxFrameDeltaSeconds,
  });
  const assessment = assessTimeStepBudget(
    input.physicalTimeStepSeconds,
    config
  );

  if (assessment.exceedsBudget) {
    throw new RangeError(
      "The calculated scheduler cadence exceeds its explicit substep budget."
    );
  }

  return config;
}

export function createGravityLabSchedulerConfig(
  physicalTimeStepSeconds: number,
  preferredSimulatedSecondsPerRealSecond: number | null = null
): FixedStepSchedulerConfig {
  return createSafeSchedulerConfig({
    physicalTimeStepSeconds,
    maxFrameDeltaSeconds: GRAVITY_LAB_MAX_FRAME_DELTA_SECONDS,
    maxSubStepsPerFrame: GRAVITY_LAB_MAX_SUBSTEPS_PER_FRAME,
    safetyMarginFraction:
      GRAVITY_LAB_SCHEDULER_SAFETY_MARGIN_FRACTION,
    preferredSimulatedSecondsPerRealSecond,
  });
}
