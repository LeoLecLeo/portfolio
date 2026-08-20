import {
  appliedScenarioToSimulationConfig,
  isAppliedScenario,
  type AppliedScenario,
} from "../core/scenario";
import type {
  NewtonianDiagnostics,
  SimulationStatus,
  SimulationStopEvent,
} from "../core/types";
import type { GravityModelId } from "../physics/gravityModel";
import type { NewtonianValidityReport } from "../physics/newtonianValidity";
import {
  FixedStepScheduler,
  type FixedStepSchedulerConfig,
  type SchedulerTickResult,
} from "./FixedStepScheduler";
import { Rk4SimulationEngine } from "./Rk4SimulationEngine";

export type ComparisonBranchSnapshot = Readonly<{
  modelId: GravityModelId;
  integratorId: "fixed-rk4";
  timeStepSeconds: number;
  stepCount: number;
  timeSeconds: number;
  positionsM: Float64Array;
  velocitiesMps: Float64Array;
}>;

export type SynchronizedComparisonSnapshot = Readonly<{
  status: SimulationStatus;
  newtonian: ComparisonBranchSnapshot;
  firstPostNewtonian: ComparisonBranchSnapshot;
}>;

function snapshotBranch(
  engine: Rk4SimulationEngine
): ComparisonBranchSnapshot {
  const positionsM = new Float64Array(engine.bodyCount * 3);
  const velocitiesMps = new Float64Array(engine.bodyCount * 3);
  engine.copyPositionsTo(positionsM);
  engine.copyVelocitiesTo(velocitiesMps);

  return Object.freeze({
    modelId: engine.modelId,
    integratorId: engine.integratorId,
    timeStepSeconds: engine.timeStepSeconds,
    stepCount: engine.state.stepCount,
    timeSeconds: engine.state.timeSeconds,
    positionsM,
    velocitiesMps,
  });
}

export class SynchronizedGravityComparisonEngine {
  readonly #newtonian: Rk4SimulationEngine;
  readonly #firstPostNewtonian: Rk4SimulationEngine;
  #status: SimulationStatus = "paused";

  constructor(appliedScenario: AppliedScenario) {
    if (!isAppliedScenario(appliedScenario)) {
      throw new TypeError(
        "A synchronized comparison requires a valid applied scenario."
      );
    }

    const config = appliedScenarioToSimulationConfig(appliedScenario);
    this.#newtonian = new Rk4SimulationEngine(config, "newtonian");
    this.#firstPostNewtonian = new Rk4SimulationEngine(
      config,
      "first-post-newtonian"
    );
  }

  get status(): SimulationStatus {
    return this.#status;
  }

  get timeStepSeconds(): number {
    return this.#newtonian.timeStepSeconds;
  }

  get bodyCount(): number {
    return this.#firstPostNewtonian.bodyCount;
  }

  get timeSeconds(): number {
    return this.#firstPostNewtonian.state.timeSeconds;
  }

  get rejectedNewtonianValidity(): NewtonianValidityReport | null {
    return this.#firstPostNewtonian.rejectedNewtonianValidity;
  }

  get stopEvent(): SimulationStopEvent | null {
    return (
      this.#newtonian.stopEvent ??
      this.#firstPostNewtonian.stopEvent
    );
  }

  start(): boolean {
    if (this.#status !== "paused") {
      return false;
    }

    const newtonianStarted = this.#newtonian.start();
    const firstPostNewtonianStarted = this.#firstPostNewtonian.start();

    if (!newtonianStarted || !firstPostNewtonianStarted) {
      this.#newtonian.pause();
      this.#firstPostNewtonian.pause();
      return false;
    }

    this.#status = "running";
    return true;
  }

  pause(): void {
    this.#newtonian.pause();
    this.#firstPostNewtonian.pause();

    if (this.#status === "running") {
      this.#status = "paused";
    }
  }

  reset(): void {
    this.#newtonian.reset();
    this.#firstPostNewtonian.reset();
    this.#status = "paused";
  }

  copyBodyIds(): readonly string[] {
    return this.#firstPostNewtonian.copyBodyIds();
  }

  copyFirstPostNewtonianPositionsTo(
    targetPositionsM: Float64Array
  ): void {
    this.#firstPostNewtonian.copyPositionsTo(targetPositionsM);
  }

  copyNewtonianPositionsTo(targetPositionsM: Float64Array): void {
    this.#newtonian.copyPositionsTo(targetPositionsM);
  }

  firstPostNewtonianDiagnostics(): NewtonianDiagnostics {
    return this.#firstPostNewtonian.diagnostics();
  }

  firstPostNewtonianValidity(): NewtonianValidityReport {
    return this.#firstPostNewtonian.newtonianValidity();
  }

  advanceOneStep(): boolean {
    if (this.#status !== "running") {
      return false;
    }

    if (!this.#newtonian.prepareOneStep()) {
      this.#firstPostNewtonian.pause();
      this.#status = this.#newtonian.status;
      return false;
    }

    if (!this.#firstPostNewtonian.prepareOneStep()) {
      this.#newtonian.discardPreparedStep();
      this.#newtonian.pause();
      this.#status = this.#firstPostNewtonian.status;
      return false;
    }

    const newtonianCommitted = this.#newtonian.commitPreparedStep();
    const firstPostNewtonianCommitted =
      this.#firstPostNewtonian.commitPreparedStep();

    if (!newtonianCommitted || !firstPostNewtonianCommitted) {
      throw new Error(
        "A synchronized comparison lost an accepted RK4 candidate before commit."
      );
    }

    if (
      this.#newtonian.state.stepCount !==
        this.#firstPostNewtonian.state.stepCount ||
      this.#newtonian.state.timeSeconds !==
        this.#firstPostNewtonian.state.timeSeconds
    ) {
      throw new Error(
        "Synchronized gravity branches committed different simulated times."
      );
    }

    return true;
  }

  snapshot(): SynchronizedComparisonSnapshot {
    return Object.freeze({
      status: this.#status,
      newtonian: snapshotBranch(this.#newtonian),
      firstPostNewtonian: snapshotBranch(this.#firstPostNewtonian),
    });
  }
}

export type SynchronizedGravityComparisonRequest = Readonly<{
  appliedScenario: AppliedScenario;
  schedulerConfig: FixedStepSchedulerConfig;
}>;

export class SynchronizedGravityComparisonSession {
  readonly #engine: SynchronizedGravityComparisonEngine;
  readonly #scheduler: FixedStepScheduler;
  #schedulerMessage: string | null = null;
  #disposed = false;

  constructor(request: SynchronizedGravityComparisonRequest) {
    this.#engine = new SynchronizedGravityComparisonEngine(
      request.appliedScenario
    );
    this.#scheduler = new FixedStepScheduler(
      this.#engine,
      request.schedulerConfig
    );
  }

  get isRunning(): boolean {
    return !this.#disposed && this.#engine.status === "running";
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  get status(): SimulationStatus {
    return this.#engine.status;
  }

  get timeSeconds(): number {
    return this.#engine.timeSeconds;
  }

  get timeStepSeconds(): number {
    return this.#engine.timeStepSeconds;
  }

  get bodyCount(): number {
    return this.#engine.bodyCount;
  }

  get stopEvent(): SimulationStopEvent | null {
    return this.#engine.stopEvent;
  }

  get rejectedNewtonianValidity(): NewtonianValidityReport | null {
    return this.#engine.rejectedNewtonianValidity;
  }

  get schedulerMessage(): string | null {
    return this.#schedulerMessage;
  }

  resume(): boolean {
    if (this.#disposed) {
      return false;
    }

    const started = this.#engine.start();
    if (started) {
      this.#scheduler.rebaseFrameClock();
      this.#schedulerMessage = null;
    }
    return started;
  }

  pause(): void {
    if (this.#disposed) {
      return;
    }

    this.#engine.pause();
  }

  reset(): void {
    if (this.#disposed) {
      return;
    }

    this.#engine.reset();
    this.#scheduler.reset();
    this.#schedulerMessage = null;
  }

  advanceFrame(realDeltaSeconds: number): SchedulerTickResult {
    if (this.#disposed) {
      return {
        stepsAdvanced: 0,
        simulatedSecondsAdvanced: 0,
        stopReason: "engine-not-running",
        message: null,
      };
    }

    const result = this.#scheduler.tick(realDeltaSeconds);
    if (result.message !== null) {
      this.#schedulerMessage = result.message;
    }
    return result;
  }

  snapshot(): SynchronizedComparisonSnapshot {
    return this.#engine.snapshot();
  }

  copyBodyIds(): readonly string[] {
    return this.#engine.copyBodyIds();
  }

  copyFirstPostNewtonianPositionsTo(
    targetPositionsM: Float64Array
  ): void {
    this.#engine.copyFirstPostNewtonianPositionsTo(targetPositionsM);
  }

  copyNewtonianPositionsTo(targetPositionsM: Float64Array): void {
    this.#engine.copyNewtonianPositionsTo(targetPositionsM);
  }

  firstPostNewtonianDiagnostics(): NewtonianDiagnostics {
    return this.#engine.firstPostNewtonianDiagnostics();
  }

  firstPostNewtonianValidity(): NewtonianValidityReport {
    return this.#engine.firstPostNewtonianValidity();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#engine.pause();
    this.#scheduler.reset();
    this.#schedulerMessage = null;
    this.#disposed = true;
  }
}
