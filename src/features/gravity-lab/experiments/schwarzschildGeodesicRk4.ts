import {
  SCHWARZSCHILD_GEODESIC_INDEX,
  SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  assertSchwarzschildPhaseSpaceDomain,
  computeSchwarzschildGeodesicDiagnostics,
  evaluateSchwarzschildHamiltonianDerivative,
  type SchwarzschildGeodesicDiagnostics,
  type SchwarzschildTwoHamiltonianConstraint,
} from "../physics/schwarzschildGeodesic";

export const DEFAULT_SCHWARZSCHILD_HORIZON_GUARD_RADIUS_RATIO = 1 + 1e-6;

export type SchwarzschildHorizonGuard = Readonly<{
  /** Numerical exterior boundary, explicitly outside the coordinate horizon. */
  minimumRadiusRatio: number;
}>;

export type SchwarzschildGeodesicRk4Workspace = Readonly<{
  stage: Float64Array;
  k1: Float64Array;
  k2: Float64Array;
  k3: Float64Array;
  k4: Float64Array;
  candidate: Float64Array;
}>;

export type SchwarzschildGeodesicStepRejectionReason =
  | "horizon-approach"
  | "invalid-state"
  | "non-finite-candidate";

export type SchwarzschildGeodesicCandidateResult =
  | Readonly<{
      accepted: true;
      diagnostics: SchwarzschildGeodesicDiagnostics;
    }>
  | Readonly<{
      accepted: false;
      reason: SchwarzschildGeodesicStepRejectionReason;
      message: string;
      observedRadiusRatio: number | null;
    }>;

type SchwarzschildGeodesicStepRejection = Extract<
  SchwarzschildGeodesicCandidateResult,
  Readonly<{ accepted: false }>
>;

function createPhaseSpaceBuffer(): Float64Array {
  return new Float64Array(SCHWARZSCHILD_PHASE_SPACE_LENGTH);
}

export function createSchwarzschildGeodesicRk4Workspace(): SchwarzschildGeodesicRk4Workspace {
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

function assertWorkspace(
  workspace: SchwarzschildGeodesicRk4Workspace,
  currentPhaseSpace: Float64Array
): void {
  const buffers = Object.entries(workspace);

  for (const [label, buffer] of buffers) {
    if (buffer.length !== SCHWARZSCHILD_PHASE_SPACE_LENGTH) {
      throw new RangeError(
        `Schwarzschild RK4 ${label} buffer has an invalid length.`
      );
    }

    if (buffer.buffer === currentPhaseSpace.buffer) {
      throw new RangeError(
        "Schwarzschild RK4 workspace must not alias the current state."
      );
    }
  }

  const uniqueBuffers = new Set(buffers.map(([, buffer]) => buffer.buffer));

  if (uniqueBuffers.size !== buffers.length) {
    throw new RangeError(
      "Schwarzschild RK4 workspace buffers must not alias one another."
    );
  }
}

function rejectStage(
  phaseSpace: Float64Array,
  horizonGuard: SchwarzschildHorizonGuard,
  label: string
): SchwarzschildGeodesicStepRejection | null {
  const radiusRatio = phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.radius];

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
    assertSchwarzschildPhaseSpaceDomain(phaseSpace, label);
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

export function assertSchwarzschildStateOutsideHorizonGuard(
  phaseSpace: Float64Array,
  horizonGuard: SchwarzschildHorizonGuard,
  label = "Schwarzschild initial state"
): void {
  const rejection = rejectStage(phaseSpace, horizonGuard, label);

  if (rejection !== null) {
    throw new RangeError(rejection.message);
  }
}

function evaluateStage(
  phaseSpace: Float64Array,
  outputDerivative: Float64Array,
  horizonGuard: SchwarzschildHorizonGuard,
  label: string
): SchwarzschildGeodesicStepRejection | null {
  const rejection = rejectStage(phaseSpace, horizonGuard, label);

  if (rejection !== null) {
    return rejection;
  }

  try {
    evaluateSchwarzschildHamiltonianDerivative(phaseSpace, outputDerivative);
  } catch (error) {
    return Object.freeze({
      accepted: false as const,
      reason: "non-finite-candidate" as const,
      message:
        error instanceof Error
          ? error.message
          : `${label} derivative is invalid.`,
      observedRadiusRatio: phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.radius],
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
 * Shared fixed RK4 candidate for massive and null Schwarzschild geodesics.
 * The step is dimensionless (c*tau/r_s for massive states, affine lambda/r_s
 * for null states). No current-state buffer is mutated before an explicit
 * caller commit.
 */
export function prepareSchwarzschildGeodesicRk4Candidate(
  currentPhaseSpace: Float64Array,
  dimensionlessStep: number,
  twoHamiltonianConstraint: SchwarzschildTwoHamiltonianConstraint,
  horizonGuard: SchwarzschildHorizonGuard,
  workspace: SchwarzschildGeodesicRk4Workspace
): SchwarzschildGeodesicCandidateResult {
  assertWorkspace(workspace, currentPhaseSpace);

  if (!Number.isFinite(dimensionlessStep) || dimensionlessStep <= 0) {
    throw new RangeError(
      "Schwarzschild normalized RK4 step must be finite and strictly positive."
    );
  }

  if (
    !Number.isFinite(horizonGuard.minimumRadiusRatio) ||
    horizonGuard.minimumRadiusRatio <= 1
  ) {
    throw new RangeError(
      "Schwarzschild horizon guard must remain strictly outside rho=1."
    );
  }

  let rejection = evaluateStage(
    currentPhaseSpace,
    workspace.k1,
    horizonGuard,
    "RK4 initial state"
  );

  if (rejection !== null) {
    return rejection;
  }

  prepareStage(
    currentPhaseSpace,
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
    currentPhaseSpace,
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
    currentPhaseSpace,
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

  for (let index = 0; index < currentPhaseSpace.length; index += 1) {
    workspace.candidate[index] =
      currentPhaseSpace[index] +
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

  try {
    return Object.freeze({
      accepted: true as const,
      diagnostics: computeSchwarzschildGeodesicDiagnostics(
        workspace.candidate,
        twoHamiltonianConstraint
      ),
    });
  } catch (error) {
    return Object.freeze({
      accepted: false as const,
      reason: "non-finite-candidate" as const,
      message:
        error instanceof Error
          ? error.message
          : "RK4 candidate diagnostics are invalid.",
      observedRadiusRatio:
        workspace.candidate[SCHWARZSCHILD_GEODESIC_INDEX.radius],
    });
  }
}
