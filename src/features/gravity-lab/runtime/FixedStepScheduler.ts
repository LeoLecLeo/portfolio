import { SimulationEngine } from "./SimulationEngine";

export type FixedStepSchedulerConfig = Readonly<{
  simulatedSecondsPerRealSecond: number;
  maxSubStepsPerTick: number;
  maxFrameDeltaSeconds: number;
}>;

export type SchedulerStopReason =
  | "engine-not-running"
  | "frame-gap"
  | "substep-budget"
  | "engine-stopped";

export type SchedulerTickResult = Readonly<{
  stepsAdvanced: number;
  simulatedSecondsAdvanced: number;
  stopReason: SchedulerStopReason | null;
  message: string | null;
}>;

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and greater than zero.`);
  }
}

export class FixedStepScheduler {
  readonly #engine: SimulationEngine;
  readonly #config: FixedStepSchedulerConfig;
  #accumulatorSeconds = 0;

  constructor(
    engine: SimulationEngine,
    config: FixedStepSchedulerConfig
  ) {
    assertPositiveFinite(
      config.simulatedSecondsPerRealSecond,
      "Simulation time scale"
    );
    assertPositiveFinite(config.maxSubStepsPerTick, "Substep budget");
    assertPositiveFinite(
      config.maxFrameDeltaSeconds,
      "Maximum frame delta"
    );

    if (!Number.isInteger(config.maxSubStepsPerTick)) {
      throw new RangeError("Substep budget must be an integer.");
    }

    this.#engine = engine;
    this.#config = { ...config };
  }

  reset(): void {
    this.#accumulatorSeconds = 0;
  }

  tick(realDeltaSeconds: number): SchedulerTickResult {
    if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds < 0) {
      throw new RangeError("Frame delta must be finite and non-negative.");
    }

    if (this.#engine.status !== "running") {
      return {
        stepsAdvanced: 0,
        simulatedSecondsAdvanced: 0,
        stopReason: "engine-not-running",
        message: null,
      };
    }

    if (realDeltaSeconds > this.#config.maxFrameDeltaSeconds) {
      this.#engine.pause();
      this.#accumulatorSeconds = 0;

      return {
        stepsAdvanced: 0,
        simulatedSecondsAdvanced: 0,
        stopReason: "frame-gap",
        message:
          "Simulation paused after an excessive frame gap; no hidden catch-up was attempted.",
      };
    }

    this.#accumulatorSeconds +=
      realDeltaSeconds * this.#config.simulatedSecondsPerRealSecond;

    const stepRatio =
      this.#accumulatorSeconds / this.#engine.timeStepSeconds;
    const roundingAllowance =
      Number.EPSILON * Math.max(1, Math.abs(stepRatio)) * 8;
    const requestedSteps = Math.floor(stepRatio + roundingAllowance);

    if (requestedSteps > this.#config.maxSubStepsPerTick) {
      this.#engine.pause();
      this.#accumulatorSeconds = 0;

      return {
        stepsAdvanced: 0,
        simulatedSecondsAdvanced: 0,
        stopReason: "substep-budget",
        message:
          "Simulation paused because the requested substeps exceeded the explicit per-frame budget.",
      };
    }

    let stepsAdvanced = 0;

    for (let stepIndex = 0; stepIndex < requestedSteps; stepIndex += 1) {
      if (!this.#engine.advanceOneStep()) {
        this.#accumulatorSeconds = 0;

        return {
          stepsAdvanced,
          simulatedSecondsAdvanced:
            stepsAdvanced * this.#engine.timeStepSeconds,
          stopReason: "engine-stopped",
          message: this.#engine.stopEvent?.message ?? null,
        };
      }

      stepsAdvanced += 1;
      this.#accumulatorSeconds -= this.#engine.timeStepSeconds;
    }

    if (this.#accumulatorSeconds < 0) {
      this.#accumulatorSeconds = 0;
    }

    return {
      stepsAdvanced,
      simulatedSecondsAdvanced:
        stepsAdvanced * this.#engine.timeStepSeconds,
      stopReason: null,
      message: null,
    };
  }
}
