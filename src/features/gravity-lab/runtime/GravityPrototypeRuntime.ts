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
  isValidatedSunMercuryScenario,
  PublicMercuryPrecessionTracker,
  type PublicMercuryPrecessionMeasurement,
} from "../experiments/publicMercuryPrecessionMeasurement";
import {
  classifyFirstPostNewtonianDomain,
  productionIntegratorForModel,
  type FirstPostNewtonianDomain,
  type GravityIntegratorId,
  type GravityModelId,
} from "../physics/gravityModel";
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
import { Rk4SimulationEngine } from "./Rk4SimulationEngine";
import { SimulationReadView } from "./SimulationReadView";
import { SynchronizedGravityComparisonSession } from "./SynchronizedGravityComparison";

export const TELEMETRY_INTERVAL_SECONDS = 0.2;
const UNAVAILABLE_MERCURY_PRECESSION_MEASUREMENT = Object.freeze({
  kind: "unavailable" as const,
  reason: "scenario-not-validated" as const,
});

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
  modelId: GravityModelId;
  integratorId: GravityIntegratorId;
  firstPostNewtonianDomain: FirstPostNewtonianDomain | null;
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
  readonly #engine: SimulationEngine | Rk4SimulationEngine;
  readonly #scheduler: FixedStepScheduler;
  readonly #readView: SimulationReadView;
  readonly #initialTotalEnergyJ: number;
  readonly #precisionProfile: PrecisionProfile | null;
  readonly #recommendedTimeStepSeconds: number | null;
  readonly #timeStepBudgetAssessment: TimeStepBudgetAssessment;
  readonly #modelId: GravityModelId;
  readonly #integratorId: GravityIntegratorId;
  readonly #appliedScenario: AppliedScenario | null;
  readonly #schedulerConfig: FixedStepSchedulerConfig;
  #comparison: SynchronizedGravityComparisonSession | null = null;
  #comparisonPrimaryReadView: SimulationReadView | null = null;
  #comparisonReferenceReadView: SimulationReadView | null = null;
  #comparisonMeasurementTracker: PublicMercuryPrecessionTracker | null = null;
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
    this.#modelId = applied
      ? scenario.physics.modelId
      : "newtonian";
    this.#appliedScenario = applied ? scenario : null;
    this.#integratorId = productionIntegratorForModel(this.#modelId);
    const resolvedSchedulerConfig =
      schedulerConfig ??
      createGenericSchedulerConfig(config.timeStepSeconds);
    this.#schedulerConfig = Object.freeze({
      ...resolvedSchedulerConfig,
    });

    this.#engine =
      this.#modelId === "newtonian"
        ? new SimulationEngine(config)
        : new Rk4SimulationEngine(config, this.#modelId);
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
    return this.#comparisonPrimaryReadView ?? this.#readView;
  }

  get newtonianComparisonPositions(): SimulationReadView | null {
    return this.#comparisonReferenceReadView;
  }

  get comparisonActive(): boolean {
    return this.#comparison !== null;
  }

  get status(): SimulationStatus {
    return this.#comparison?.status ?? this.#engine.status;
  }

  get timeSeconds(): number {
    return this.#comparison?.timeSeconds ?? this.#engine.state.timeSeconds;
  }

  get bodyCount(): number {
    return this.#readView.bodyCount;
  }

  get isRunning(): boolean {
    return (
      !this.#disposed &&
      (this.#comparison?.isRunning ?? this.#engine.status === "running")
    );
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  resume(): boolean {
    if (this.#disposed) {
      return false;
    }

    if (this.#comparison !== null) {
      return this.#comparison.resume();
    }

    const started = this.#engine.start();

    if (started) {
      this.#scheduler.rebaseFrameClock();
      this.#schedulerMessage = null;
    }

    return started;
  }

  pause(): void {
    if (this.#comparison !== null) {
      this.#comparison.pause();
      return;
    }

    this.#engine.pause();
  }

  reset(): void {
    if (this.#disposed) {
      return;
    }

    if (this.#comparison !== null) {
      this.#comparison.reset();
      this.#comparisonMeasurementTracker?.reset();
      this.#comparisonPrimaryReadView?.sync();
      this.#comparisonReferenceReadView?.sync();
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

    if (this.#comparison !== null) {
      const previousStatus = this.#comparison.status;
      const result = this.#comparison.advanceFrame(realDeltaSeconds);
      this.#comparisonPrimaryReadView?.sync();
      this.#comparisonReferenceReadView?.sync();

      return (
        previousStatus !== this.#comparison.status ||
        result.stopReason === "frame-gap" ||
        result.stopReason === "substep-budget" ||
        result.stopReason === "engine-stopped"
      );
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
    const comparison = this.#comparison;
    const diagnostics = comparison
      ? comparison.firstPostNewtonianDiagnostics()
      : this.#engine.diagnostics();
    const newtonianValidity = comparison
      ? comparison.firstPostNewtonianValidity()
      : this.#engine.newtonianValidity();
    const relativeEnergyDrift =
      this.#modelId !== "newtonian" || this.#initialTotalEnergyJ === 0
        ? null
        : Math.abs(
            (diagnostics.totalEnergyJ - this.#initialTotalEnergyJ) /
              this.#initialTotalEnergyJ
          );
    const stopEvent = comparison?.stopEvent ?? this.#engine.stopEvent;

    return {
      modelId: this.#modelId,
      integratorId: this.#integratorId,
      firstPostNewtonianDomain:
        this.#modelId === "first-post-newtonian"
          ? classifyFirstPostNewtonianDomain(newtonianValidity)
          : null,
      timeSeconds: this.timeSeconds,
      status: this.status,
      precisionProfile: this.#precisionProfile,
      timeStepSeconds: this.#engine.timeStepSeconds,
      recommendedTimeStepSeconds: this.#recommendedTimeStepSeconds,
      timeStepBudgetAssessment: this.#timeStepBudgetAssessment,
      newtonianValidity,
      rejectedNewtonianValidity:
        comparison?.rejectedNewtonianValidity ??
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
      schedulerMessage:
        comparison?.schedulerMessage ?? this.#schedulerMessage,
    };
  }

  enableSynchronizedComparison(): boolean {
    if (
      this.#disposed ||
      this.#comparison !== null ||
      this.#modelId !== "first-post-newtonian" ||
      this.#appliedScenario === null ||
      this.#engine.status !== "paused" ||
      this.#engine.state.timeSeconds !== 0
    ) {
      return false;
    }

    const measurementTracker = isValidatedSunMercuryScenario(
      this.#appliedScenario
    )
      ? new PublicMercuryPrecessionTracker(this.#appliedScenario)
      : null;
    const comparison = new SynchronizedGravityComparisonSession({
      appliedScenario: this.#appliedScenario,
      schedulerConfig: this.#schedulerConfig,
      onSynchronizedStep:
        measurementTracker === null
          ? undefined
          : (...step) =>
              measurementTracker.observeSynchronizedStep(...step),
    });
    this.#comparison = comparison;
    this.#comparisonMeasurementTracker = measurementTracker;
    this.#comparisonPrimaryReadView = new SimulationReadView({
      bodyCount: comparison.bodyCount,
      copyBodyIds: () => comparison.copyBodyIds(),
      copyPositionsTo: (target) =>
        comparison.copyFirstPostNewtonianPositionsTo(target),
    });
    this.#comparisonReferenceReadView = new SimulationReadView({
      bodyCount: comparison.bodyCount,
      copyBodyIds: () => comparison.copyBodyIds(),
      copyPositionsTo: (target) =>
        comparison.copyNewtonianPositionsTo(target),
    });
    return true;
  }

  comparisonPrecessionMeasurement(): PublicMercuryPrecessionMeasurement | null {
    if (this.#comparison === null) {
      return null;
    }

    return (
      this.#comparisonMeasurementTracker?.snapshot() ??
      UNAVAILABLE_MERCURY_PRECESSION_MEASUREMENT
    );
  }

  disableSynchronizedComparison(): boolean {
    const comparison = this.#comparison;

    if (
      comparison === null ||
      comparison.isRunning ||
      comparison.timeSeconds !== 0
    ) {
      return false;
    }

    comparison.dispose();
    this.#comparison = null;
    this.#comparisonPrimaryReadView = null;
    this.#comparisonReferenceReadView = null;
    this.#comparisonMeasurementTracker = null;
    this.#readView.sync();
    return true;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#comparison?.dispose();
    this.#comparison = null;
    this.#comparisonPrimaryReadView = null;
    this.#comparisonReferenceReadView = null;
    this.#comparisonMeasurementTracker = null;
    this.#engine.pause();
    this.#scheduler.reset();
    this.#disposed = true;
  }
}
