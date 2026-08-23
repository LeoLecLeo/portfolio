import { SPEED_OF_LIGHT_MPS } from "../core/units";
import {
  computeMassiveSchwarzschildDiagnostics,
  createMassiveSchwarzschildState,
  type MassiveSchwarzschildDiagnostics,
  type MassiveSchwarzschildState,
} from "../physics/massiveSchwarzschildGeodesic";
import { schwarzschildRadiusM } from "../physics/schwarzschildMetric";
import {
  assertSchwarzschildStateOutsideHorizonGuard,
  createSchwarzschildGeodesicRk4Workspace,
  createSchwarzschildHorizonGuard,
  prepareSchwarzschildGeodesicRk4Candidate,
  type SchwarzschildGeodesicRk4Workspace,
  type SchwarzschildGeodesicStepRejectionReason,
  type SchwarzschildHorizonGuard,
} from "./schwarzschildGeodesicRk4";

export {
  DEFAULT_SCHWARZSCHILD_HORIZON_GUARD_RADIUS_RATIO,
  createSchwarzschildHorizonGuard,
} from "./schwarzschildGeodesicRk4";
export type { SchwarzschildHorizonGuard } from "./schwarzschildGeodesicRk4";

export type MassiveSchwarzschildRk4Workspace =
  SchwarzschildGeodesicRk4Workspace;
export type MassiveSchwarzschildStepRejectionReason =
  SchwarzschildGeodesicStepRejectionReason;

export type MassiveSchwarzschildStepResult =
  | Readonly<{
      accepted: true;
      nextProperTimeSeconds: number;
      nextStepCount: number;
      diagnostics: MassiveSchwarzschildDiagnostics;
    }>
  | Readonly<{
      accepted: false;
      reason: MassiveSchwarzschildStepRejectionReason;
      message: string;
      observedRadiusRatio: number | null;
    }>;

export type HeadlessMassiveSchwarzschildOptions = Readonly<{
  centralMassKg: number;
  properTimeStepSeconds: number;
  initialState: MassiveSchwarzschildState;
  horizonGuard?: SchwarzschildHorizonGuard;
}>;

export function createMassiveSchwarzschildRk4Workspace(): MassiveSchwarzschildRk4Workspace {
  return createSchwarzschildGeodesicRk4Workspace();
}

/** Compatibility wrapper converting an SI proper-time step to c*tau/r_s. */
export function prepareMassiveSchwarzschildRk4Candidate(
  centralMassKg: number,
  currentState: MassiveSchwarzschildState,
  properTimeStepSeconds: number,
  horizonGuard: SchwarzschildHorizonGuard,
  workspace: MassiveSchwarzschildRk4Workspace
): MassiveSchwarzschildStepResult {
  const horizonRadiusM = schwarzschildRadiusM(centralMassKg);

  if (
    !Number.isFinite(properTimeStepSeconds) ||
    properTimeStepSeconds <= 0
  ) {
    throw new RangeError(
      "Massive Schwarzschild proper-time step must be finite and strictly positive."
    );
  }

  const nextStepCount = currentState.stepCount + 1;
  const nextProperTimeSeconds =
    currentState.properTimeSeconds + properTimeStepSeconds;
  const dimensionlessStep =
    (properTimeStepSeconds * SPEED_OF_LIGHT_MPS) / horizonRadiusM;

  if (!Number.isSafeInteger(nextStepCount)) {
    throw new RangeError(
      "Massive Schwarzschild step count would exceed the safe integer range."
    );
  }

  if (
    !Number.isFinite(nextProperTimeSeconds) ||
    nextProperTimeSeconds <= currentState.properTimeSeconds ||
    !Number.isFinite(dimensionlessStep) ||
    dimensionlessStep <= 0
  ) {
    throw new RangeError(
      "Massive Schwarzschild proper time or normalized RK4 step would become non-finite."
    );
  }

  const candidate = prepareSchwarzschildGeodesicRk4Candidate(
    currentState.phaseSpace,
    dimensionlessStep,
    -1,
    horizonGuard,
    workspace
  );

  if (!candidate.accepted) {
    return candidate;
  }

  return Object.freeze({
    accepted: true as const,
    nextProperTimeSeconds,
    nextStepCount,
    diagnostics: candidate.diagnostics,
  });
}

export class HeadlessMassiveSchwarzschildSimulation {
  readonly #centralMassKg: number;
  readonly #properTimeStepSeconds: number;
  readonly #horizonGuard: SchwarzschildHorizonGuard;
  readonly #workspace = createMassiveSchwarzschildRk4Workspace();
  readonly #phaseSpace: Float64Array;
  #properTimeSeconds: number;
  #stepCount: number;
  #diagnostics: MassiveSchwarzschildDiagnostics;

  constructor(options: HeadlessMassiveSchwarzschildOptions) {
    schwarzschildRadiusM(options.centralMassKg);

    if (
      !Number.isFinite(options.properTimeStepSeconds) ||
      options.properTimeStepSeconds <= 0
    ) {
      throw new RangeError(
        "Headless Schwarzschild proper-time step must be finite and strictly positive."
      );
    }

    this.#centralMassKg = options.centralMassKg;
    this.#properTimeStepSeconds = options.properTimeStepSeconds;
    this.#horizonGuard =
      options.horizonGuard ?? createSchwarzschildHorizonGuard();
    const validatedInitialState = createMassiveSchwarzschildState(
      options.initialState.phaseSpace,
      options.initialState.properTimeSeconds,
      options.initialState.stepCount
    );
    this.#phaseSpace = validatedInitialState.phaseSpace;
    this.#properTimeSeconds = validatedInitialState.properTimeSeconds;
    this.#stepCount = validatedInitialState.stepCount;
    this.#diagnostics = computeMassiveSchwarzschildDiagnostics(
      this.#phaseSpace
    );

    assertSchwarzschildStateOutsideHorizonGuard(
      this.#phaseSpace,
      this.#horizonGuard,
      "Headless Schwarzschild initial state"
    );
  }

  get properTimeSeconds(): number {
    return this.#properTimeSeconds;
  }

  get stepCount(): number {
    return this.#stepCount;
  }

  get diagnostics(): MassiveSchwarzschildDiagnostics {
    return this.#diagnostics;
  }

  advanceOneStep(): MassiveSchwarzschildStepResult {
    const result = prepareMassiveSchwarzschildRk4Candidate(
      this.#centralMassKg,
      {
        phaseSpace: this.#phaseSpace,
        properTimeSeconds: this.#properTimeSeconds,
        stepCount: this.#stepCount,
      },
      this.#properTimeStepSeconds,
      this.#horizonGuard,
      this.#workspace
    );

    if (!result.accepted) {
      return result;
    }

    this.#phaseSpace.set(this.#workspace.candidate);
    this.#properTimeSeconds = result.nextProperTimeSeconds;
    this.#stepCount = result.nextStepCount;
    this.#diagnostics = result.diagnostics;
    return result;
  }

  copyPhaseSpaceTo(target: Float64Array): void {
    if (target.length !== this.#phaseSpace.length) {
      throw new RangeError(
        "Massive Schwarzschild target does not match the phase-space state."
      );
    }

    target.set(this.#phaseSpace);
  }
}
