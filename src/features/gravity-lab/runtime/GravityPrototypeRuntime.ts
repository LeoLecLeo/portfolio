import type {
  NewtonianSimulationConfig,
  NumericalCandidateFailure,
  SimulationStatus,
  SimulationStopEvent,
} from "../core/types";
import {
  appliedScenarioToSimulationConfig,
  isAppliedScenario,
  type AppliedScenario,
} from "../core/scenario";
import { magnitudeVector3 } from "../core/vector3";
import type { NewtonianValidityReport } from "../physics/newtonianValidity";
import {
  assessTimeStepBudget,
  type PrecisionProfile,
  type TimeStepBudgetAssessment,
} from "../physics/timeStepRecommendation";
import {
  FixedStepScheduler,
  type FixedStepSchedulerConfig,
} from "./FixedStepScheduler";
import { SimulationEngine } from "./SimulationEngine";
import { SimulationReadView } from "./SimulationReadView";

export const TELEMETRY_INTERVAL_SECONDS = 0.2;

function createGenericSchedulerConfig(
  timeStepSeconds: number
): FixedStepSchedulerConfig {
  const scaled = timeStepSeconds * 60;

  return {
    simulatedSecondsPerRealSecond: Number.isFinite(scaled)
      ? scaled
      : timeStepSeconds,
    maxSubStepsPerTick: 32,
    maxFrameDeltaSeconds: 0.25,
  };
}

export type PrototypeTelemetry = Readonly<{
  timeSeconds: number;
  status: SimulationStatus;
  precisionProfile: PrecisionProfile | null;
  timeStepSeconds: number;
  recommendedTimeStepSeconds: number | null;
  timeStepBudgetAssessment: TimeStepBudgetAssessment;
  newtonianValidity: NewtonianValidityReport;
  rejectedNewtonianValidity: NewtonianValidityReport | null;
  totalEnergyJ: number;
  relativeEnergyDrift: number | null;
  angularMomentumNormKgM2ps: number;
  collisionMessage: string | null;
  unresolvedEncounterMessage: string | null;
  newtonianDomainMessage: string | null;
  newtonianDomainViolation:
    | Extract<
        SimulationStopEvent,
        { kind: "newtonian-domain-violation" }
      >["violation"]
    | null;
  numericalErrorMessage: string | null;
  numericalErrorCause: NumericalCandidateFailure | null;
  schedulerMessage: string | null;
}>;

export class GravityPrototypeRuntime {
  readonly #engine: SimulationEngine;
  readonly #scheduler: FixedStepScheduler;
  readonly #readView: SimulationReadView;
  readonly #initialTotalEnergyJ: number;
  readonly #precisionProfile: PrecisionProfile | null;
  readonly #recommendedTimeStepSeconds: number | null;
  readonly #timeStepBudgetAssessment: TimeStepBudgetAssessment;
  #schedulerMessage: string | null = null;
  #disposed = false;

  /**
   * AppliedScenario is the normal product path. The raw SI configuration
   * overload remains only for the validated phase-1/test compatibility path;
   * it intentionally exposes no inferred precision profile.
   */
  constructor(
    source: NewtonianSimulationConfig | AppliedScenario,
    schedulerConfig?: FixedStepSchedulerConfig
  ) {
    const scenario = source;
    const applied = isAppliedScenario(scenario);
    const config = applied
      ? appliedScenarioToSimulationConfig(scenario)
      : scenario;
    const resolvedSchedulerConfig =
      schedulerConfig ??
      createGenericSchedulerConfig(config.timeStepSeconds);

    this.#engine = new SimulationEngine(config);
    const recommendation = applied
      ? scenario.numericalPolicy.timeStepRecommendation
      : null;
    this.#precisionProfile = applied
      ? scenario.numericalPolicy.precisionProfile
      : null;
    this.#recommendedTimeStepSeconds =
      recommendation?.recommendedTimeStepSeconds ?? null;
    this.#timeStepBudgetAssessment = assessTimeStepBudget(
      config.timeStepSeconds,
      resolvedSchedulerConfig
    );
    this.#scheduler = new FixedStepScheduler(
      this.#engine,
      resolvedSchedulerConfig
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
    return !this.#disposed && this.#engine.status === "running";
  }

  get isDisposed(): boolean {
    return this.#disposed;
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
    this.#engine.pause();
  }

  reset(): void {
    if (this.#disposed) {
      return;
    }

    this.#engine.reset();
    this.#scheduler.reset();
    this.#readView.sync();
    this.#schedulerMessage = null;
  }

  advanceFrame(realDeltaSeconds: number): boolean {
    if (this.#disposed || !this.isRunning) {
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
      precisionProfile: this.#precisionProfile,
      timeStepSeconds: this.#engine.timeStepSeconds,
      recommendedTimeStepSeconds: this.#recommendedTimeStepSeconds,
      timeStepBudgetAssessment: this.#timeStepBudgetAssessment,
      newtonianValidity: this.#engine.newtonianValidity(),
      rejectedNewtonianValidity:
        this.#engine.rejectedNewtonianValidity,
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
      newtonianDomainMessage:
        stopEvent?.kind === "newtonian-domain-violation"
          ? stopEvent.message
          : null,
      newtonianDomainViolation:
        stopEvent?.kind === "newtonian-domain-violation"
          ? stopEvent.violation
          : null,
      numericalErrorMessage:
        stopEvent?.kind === "numerical-error" ? stopEvent.message : null,
      numericalErrorCause:
        stopEvent?.kind === "numerical-error"
          ? (stopEvent.cause ?? null)
          : null,
      schedulerMessage: this.#schedulerMessage,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#engine.pause();
    this.#scheduler.reset();
    this.#disposed = true;
  }
}
