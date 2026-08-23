import { SPEED_OF_LIGHT_MPS } from "../core/units";
import {
  MASSIVE_GEODESIC_INDEX,
  MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  assertMassiveSchwarzschildPhaseSpaceDomain,
  computeMassiveSchwarzschildDiagnostics,
  createMassiveSchwarzschildState,
  evaluateMassiveSchwarzschildHamiltonianDerivative,
  type MassiveSchwarzschildDiagnostics,
  type MassiveSchwarzschildState,
} from "../physics/massiveSchwarzschildGeodesic";
import { schwarzschildRadiusM } from "../physics/schwarzschildMetric";

export const DEFAULT_SCHWARZSCHILD_HORIZON_GUARD_RADIUS_RATIO = 1 + 1e-6;

export type SchwarzschildHorizonGuard = Readonly<{
  /** Numerical exterior boundary, explicitly outside the coordinate horizon. */
  minimumRadiusRatio: number;
}>;

export type MassiveSchwarzschildRk4Workspace = Readonly<{
  stage: Float64Array;
  k1: Float64Array;
  k2: Float64Array;
  k3: Float64Array;
  k4: Float64Array;
  candidate: Float64Array;
}>;

export type MassiveSchwarzschildStepRejectionReason =
  | "horizon-approach"
  | "invalid-state"
  | "non-finite-candidate";

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

type MassiveSchwarzschildStepRejection = Extract<
  MassiveSchwarzschildStepResult,
  Readonly<{ accepted: false }>
>;

export type HeadlessMassiveSchwarzschildOptions = Readonly<{
  centralMassKg: number;
  properTimeStepSeconds: number;
  initialState: MassiveSchwarzschildState;
  horizonGuard?: SchwarzschildHorizonGuard;
}>;

function createPhaseSpaceBuffer(): Float64Array {
  return new Float64Array(MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH);
}

export function createMassiveSchwarzschildRk4Workspace(): MassiveSchwarzschildRk4Workspace {
  return {
    stage: createPhaseSpaceBuffer(),
    k1: createPhaseSpaceBuffer(),
    k2: createPhaseSpaceBuffer(),
    k3: createPhaseSpaceBuffer(),
    k4: createPhaseSpaceBuffer(),
    candidate: createPhaseSpaceBuffer(),
  };
}

export function createSchwarzschildHorizonGuard(
  minimumRadiusRatio = DEFAULT_SCHWARZSCHILD_HORIZON_GUARD_RADIUS_RATIO
): SchwarzschildHorizonGuard {
  if (!Number.isFinite(minimumRadiusRatio) || minimumRadiusRatio <= 1) {
    throw new RangeError(
      "Schwarzschild horizon guard must be finite and explicitly outside rho=1."
    );
  }

  return Object.freeze({ minimumRadiusRatio });
}

function assertWorkspace(workspace: MassiveSchwarzschildRk4Workspace): void {
  const buffers = Object.entries(workspace);

  for (const [label, buffer] of buffers) {
    if (buffer.length !== MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH) {
      throw new RangeError(
        `Massive Schwarzschild RK4 ${label} buffer has an invalid length.`
      );
    }
  }

  const uniqueBuffers = new Set(buffers.map(([, buffer]) => buffer.buffer));

  if (uniqueBuffers.size !== buffers.length) {
    throw new RangeError(
      "Massive Schwarzschild RK4 workspace buffers must not alias one another."
    );
  }
}

function rejectStage(
  phaseSpace: Float64Array,
  horizonGuard: SchwarzschildHorizonGuard,
  label: string
): MassiveSchwarzschildStepRejection | null {
  const radiusRatio = phaseSpace[MASSIVE_GEODESIC_INDEX.radius];

  if (!Number.isFinite(radiusRatio)) {
    return Object.freeze({
      accepted: false as const,
      reason: "non-finite-candidate" as const,
      message: `${label} produced a non-finite Schwarzschild radius.`,
      observedRadiusRatio: null,
    });
  }

  if (radiusRatio <= horizonGuard.minimumRadiusRatio) {
    return Object.freeze({
      accepted: false as const,
      reason: "horizon-approach" as const,
      message: `${label} reached the explicit exterior guard rho <= ${horizonGuard.minimumRadiusRatio}; Schwarzschild coordinates were not continued through the horizon.`,
      observedRadiusRatio: radiusRatio,
    });
  }

  try {
    assertMassiveSchwarzschildPhaseSpaceDomain(phaseSpace, label);
  } catch (error) {
    return Object.freeze({
      accepted: false as const,
      reason: "invalid-state" as const,
      message: error instanceof Error ? error.message : `${label} is invalid.`,
      observedRadiusRatio: radiusRatio,
    });
  }

  return null;
}

function evaluateStage(
  phaseSpace: Float64Array,
  outputDerivative: Float64Array,
  horizonGuard: SchwarzschildHorizonGuard,
  label: string
): MassiveSchwarzschildStepRejection | null {
  const rejection = rejectStage(phaseSpace, horizonGuard, label);

  if (rejection !== null) {
    return rejection;
  }

  try {
    evaluateMassiveSchwarzschildHamiltonianDerivative(
      phaseSpace,
      outputDerivative
    );
  } catch (error) {
    return Object.freeze({
      accepted: false as const,
      reason: "non-finite-candidate" as const,
      message:
        error instanceof Error
          ? error.message
          : `${label} derivative is invalid.`,
      observedRadiusRatio: phaseSpace[MASSIVE_GEODESIC_INDEX.radius],
    });
  }

  return null;
}

function prepareStage(
  initial: Float64Array,
  derivative: Float64Array,
  multiplier: number,
  target: Float64Array
): void {
  for (let index = 0; index < initial.length; index += 1) {
    target[index] = initial[index] + multiplier * derivative[index];
  }
}

/**
 * Prepares one fixed RK4 candidate in normalized affine time sigma=c*tau/r_s.
 * The supplied SI step is particle proper time. The current state is never
 * mutated; callers commit workspace.candidate only after an accepted result.
 */
export function prepareMassiveSchwarzschildRk4Candidate(
  centralMassKg: number,
  currentState: MassiveSchwarzschildState,
  properTimeStepSeconds: number,
  horizonGuard: SchwarzschildHorizonGuard,
  workspace: MassiveSchwarzschildRk4Workspace
): MassiveSchwarzschildStepResult {
  const horizonRadiusM = schwarzschildRadiusM(centralMassKg);
  assertWorkspace(workspace);

  for (const buffer of Object.values(workspace)) {
    if (buffer.buffer === currentState.phaseSpace.buffer) {
      throw new RangeError(
        "Massive Schwarzschild RK4 workspace must not alias the current state."
      );
    }
  }

  if (
    !Number.isFinite(properTimeStepSeconds) ||
    properTimeStepSeconds <= 0
  ) {
    throw new RangeError(
      "Massive Schwarzschild proper-time step must be finite and strictly positive."
    );
  }

  if (
    !Number.isFinite(horizonGuard.minimumRadiusRatio) ||
    horizonGuard.minimumRadiusRatio <= 1
  ) {
    throw new RangeError(
      "Massive Schwarzschild horizon guard must remain strictly outside rho=1."
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

  let rejection = evaluateStage(
    currentState.phaseSpace,
    workspace.k1,
    horizonGuard,
    "RK4 initial state"
  );

  if (rejection !== null) {
    return rejection;
  }

  prepareStage(
    currentState.phaseSpace,
    workspace.k1,
    dimensionlessStep * 0.5,
    workspace.stage
  );
  rejection = evaluateStage(
    workspace.stage,
    workspace.k2,
    horizonGuard,
    "RK4 midpoint k2"
  );

  if (rejection !== null) {
    return rejection;
  }

  prepareStage(
    currentState.phaseSpace,
    workspace.k2,
    dimensionlessStep * 0.5,
    workspace.stage
  );
  rejection = evaluateStage(
    workspace.stage,
    workspace.k3,
    horizonGuard,
    "RK4 midpoint k3"
  );

  if (rejection !== null) {
    return rejection;
  }

  prepareStage(
    currentState.phaseSpace,
    workspace.k3,
    dimensionlessStep,
    workspace.stage
  );
  rejection = evaluateStage(
    workspace.stage,
    workspace.k4,
    horizonGuard,
    "RK4 endpoint k4"
  );

  if (rejection !== null) {
    return rejection;
  }

  const sixthStep = dimensionlessStep / 6;

  for (let index = 0; index < currentState.phaseSpace.length; index += 1) {
    workspace.candidate[index] =
      currentState.phaseSpace[index] +
      sixthStep *
        (workspace.k1[index] +
          2 * workspace.k2[index] +
          2 * workspace.k3[index] +
          workspace.k4[index]);
  }

  rejection = rejectStage(workspace.candidate, horizonGuard, "RK4 candidate");

  if (rejection !== null) {
    return rejection;
  }

  let diagnostics: MassiveSchwarzschildDiagnostics;

  try {
    diagnostics = computeMassiveSchwarzschildDiagnostics(workspace.candidate);
  } catch (error) {
    return Object.freeze({
      accepted: false as const,
      reason: "non-finite-candidate" as const,
      message:
        error instanceof Error
          ? error.message
          : "RK4 candidate diagnostics are invalid.",
      observedRadiusRatio:
        workspace.candidate[MASSIVE_GEODESIC_INDEX.radius],
    });
  }

  return Object.freeze({
    accepted: true as const,
    nextProperTimeSeconds,
    nextStepCount,
    diagnostics,
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

    const initialRejection = rejectStage(
      this.#phaseSpace,
      this.#horizonGuard,
      "Headless Schwarzschild initial state"
    );

    if (initialRejection !== null) {
      throw new RangeError(initialRejection.message);
    }
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
    const currentState: MassiveSchwarzschildState = {
      phaseSpace: this.#phaseSpace,
      properTimeSeconds: this.#properTimeSeconds,
      stepCount: this.#stepCount,
    };
    const result = prepareMassiveSchwarzschildRk4Candidate(
      this.#centralMassKg,
      currentState,
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
