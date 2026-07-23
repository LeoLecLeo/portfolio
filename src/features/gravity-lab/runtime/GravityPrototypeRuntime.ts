import type {
  NewtonianSimulationConfig,
  SimulationStatus,
} from "../core/types";
import { magnitudeVector3 } from "../core/vector3";
import {
  createInclinedBinaryConfig,
  INCLINED_BINARY_PERIOD_SECONDS,
} from "../presets/inclinedBinary";
import {
  FixedStepScheduler,
  type FixedStepSchedulerConfig,
} from "./FixedStepScheduler";
import { SimulationEngine } from "./SimulationEngine";
import { SimulationReadView } from "./SimulationReadView";

export const TELEMETRY_INTERVAL_SECONDS = 0.2;

const DEFAULT_SCHEDULER_CONFIG: FixedStepSchedulerConfig = {
  simulatedSecondsPerRealSecond: INCLINED_BINARY_PERIOD_SECONDS / 24,
  maxSubStepsPerTick: 32,
  maxFrameDeltaSeconds: 0.25,
};

export type PrototypeTelemetry = Readonly<{
  timeSeconds: number;
  status: SimulationStatus;
  totalEnergyJ: number;
  relativeEnergyDrift: number | null;
  angularMomentumNormKgM2ps: number;
  collisionMessage: string | null;
  unresolvedEncounterMessage: string | null;
  numericalErrorMessage: string | null;
  schedulerMessage: string | null;
}>;

export class GravityPrototypeRuntime {
  readonly #engine: SimulationEngine;
  readonly #scheduler: FixedStepScheduler;
  readonly #readView: SimulationReadView;
  readonly #initialTotalEnergyJ: number;
  #schedulerMessage: string | null = null;

  constructor(
    config: NewtonianSimulationConfig = createInclinedBinaryConfig(),
    schedulerConfig: FixedStepSchedulerConfig = DEFAULT_SCHEDULER_CONFIG
  ) {
    this.#engine = new SimulationEngine(config);
    this.#scheduler = new FixedStepScheduler(
      this.#engine,
      schedulerConfig
    );
    this.#readView = new SimulationReadView(this.#engine);
    this.#initialTotalEnergyJ = this.#engine.diagnostics().totalEnergyJ;
  }

  get positions(): SimulationReadView {
    return this.#readView;
  }

  get bodyCount(): number {
    return this.#readView.bodyCount;
  }

  get isRunning(): boolean {
    return this.#engine.status === "running";
  }

  resume(): boolean {
    const started = this.#engine.start();

    if (started) {
      this.#scheduler.rebaseFrameClock();
      this.#schedulerMessage = null;
    }

    return started;
  }

  pause(): void {
    this.#engine.pause();
  }

  reset(): void {
    this.#engine.reset();
    this.#scheduler.reset();
    this.#readView.sync();
    this.#schedulerMessage = null;
  }

  advanceFrame(realDeltaSeconds: number): boolean {
    if (!this.isRunning) {
      return false;
    }

    const previousStatus = this.#engine.status;
    const result = this.#scheduler.tick(realDeltaSeconds);

    if (
      result.stopReason === "frame-gap" ||
      result.stopReason === "substep-budget"
    ) {
      this.#schedulerMessage = result.message;
    }

    this.#readView.sync();

    return (
      previousStatus !== this.#engine.status ||
      result.stopReason === "frame-gap" ||
      result.stopReason === "substep-budget" ||
      result.stopReason === "engine-stopped"
    );
  }

  telemetry(): PrototypeTelemetry {
    const diagnostics = this.#engine.diagnostics();
    const relativeEnergyDrift =
      this.#initialTotalEnergyJ === 0
        ? null
        : Math.abs(
            (diagnostics.totalEnergyJ - this.#initialTotalEnergyJ) /
              this.#initialTotalEnergyJ
          );
    const stopEvent = this.#engine.stopEvent;

    return {
      timeSeconds: this.#engine.state.timeSeconds,
      status: this.#engine.status,
      totalEnergyJ: diagnostics.totalEnergyJ,
      relativeEnergyDrift,
      angularMomentumNormKgM2ps: magnitudeVector3(
        diagnostics.angularMomentumKgM2ps
      ),
      collisionMessage:
        stopEvent?.kind === "collision" ? stopEvent.message : null,
      unresolvedEncounterMessage:
        stopEvent?.kind === "unresolved-encounter"
          ? stopEvent.message
          : null,
      numericalErrorMessage:
        stopEvent?.kind === "numerical-error" ? stopEvent.message : null,
      schedulerMessage: this.#schedulerMessage,
    };
  }
}
