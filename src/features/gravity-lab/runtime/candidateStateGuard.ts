import type {
  EncounterDetection,
  EncounterThresholds,
  NewtonianState,
  NumericalCandidateBuffer,
  ScientificMetric,
  ScientificResponsibility,
  ScientificVelocityFrame,
} from "../core/types";
import {
  findFirstNonFiniteFloat64Index,
  type VelocityVerletWorkspace,
} from "../integrators/velocityVerlet";
import {
  createEncounterInspectionWorkspace,
  inspectEncounterAcrossStep,
  materializeEncounterDetection,
  type EncounterInspectionWorkspace,
} from "../physics/encounters";
import {
  BETA_HARD_ERROR_THRESHOLD,
  createNewtonianValidityWorkspace,
  evaluateNewtonianValidityInto,
  hasNewtonianDomainViolation,
  materializeNewtonianValidityReport,
  WEAK_FIELD_HARD_ERROR_THRESHOLD,
  type NewtonianValidityReport,
  type NewtonianValidityWorkspace,
} from "../physics/newtonianValidity";

export type CandidateGuardRejectionKind =
  | "numerical-error"
  | "collision"
  | "unresolved-encounter"
  | "newtonian-domain-violation";

export type CandidateNumericalBuffer = NumericalCandidateBuffer;

export type CandidateStateGuardWorkspace = {
  readonly encounter: EncounterInspectionWorkspace;
  readonly newtonianValidity: NewtonianValidityWorkspace;
  rejectionKind: CandidateGuardRejectionKind | null;
  numericalBuffer: CandidateNumericalBuffer | null;
  numericalIndex: number;
};

export type CandidateNumericalRejection = Readonly<{
  kind: "numerical-error";
  buffer: CandidateNumericalBuffer;
  vectorIndex: number;
  bodyIndex: number;
  axis: "x" | "y" | "z";
}>;

export type CandidateEncounterRejection = Readonly<{
  kind: "encounter";
  encounter: EncounterDetection;
}>;

export type CandidateNewtonianDomainRejection = Readonly<{
  kind: "newtonian-domain-violation";
  report: NewtonianValidityReport;
  violation: Readonly<{
    metric: ScientificMetric;
    value: number;
    limit: number;
    responsibility: ScientificResponsibility;
    velocityFrame?: ScientificVelocityFrame;
  }>;
}>;

export type CandidateStateRejection =
  | CandidateNumericalRejection
  | CandidateEncounterRejection
  | CandidateNewtonianDomainRejection;

export function createCandidateStateGuardWorkspace(
  bodyCount: number
): CandidateStateGuardWorkspace {
  return {
    encounter: createEncounterInspectionWorkspace(),
    newtonianValidity: createNewtonianValidityWorkspace(bodyCount),
    rejectionKind: null,
    numericalBuffer: null,
    numericalIndex: -1,
  };
}

function resetRejection(workspace: CandidateStateGuardWorkspace): void {
  workspace.rejectionKind = null;
  workspace.numericalBuffer = null;
  workspace.numericalIndex = -1;
}

function rejectFirstNonFinite(
  values: Float64Array,
  buffer: CandidateNumericalBuffer,
  workspace: CandidateStateGuardWorkspace
): boolean {
  const invalidIndex = findFirstNonFiniteFloat64Index(values);

  if (invalidIndex === -1) {
    return false;
  }

  workspace.rejectionKind = "numerical-error";
  workspace.numericalBuffer = buffer;
  workspace.numericalIndex = invalidIndex;
  return true;
}

/**
 * Checks the drift before force evaluation. Collision and q guards deliberately
 * precede candidate acceleration evaluation so an exact contact is classified
 * as a collision instead of being obscured by a singular force calculation.
 */
export function inspectVelocityVerletDriftCandidate(
  state: NewtonianState,
  timeStepSeconds: number,
  thresholds: EncounterThresholds,
  verletWorkspace: VelocityVerletWorkspace,
  guardWorkspace: CandidateStateGuardWorkspace
): CandidateGuardRejectionKind | null {
  resetRejection(guardWorkspace);

  if (
    rejectFirstNonFinite(
      verletWorkspace.candidatePositionsM,
      "candidate-positions",
      guardWorkspace
    ) ||
    rejectFirstNonFinite(
      verletWorkspace.halfStepVelocitiesMps,
      "half-step-velocities",
      guardWorkspace
    )
  ) {
    return guardWorkspace.rejectionKind;
  }

  const encounter = inspectEncounterAcrossStep(
    state.positionsM,
    verletWorkspace.candidatePositionsM,
    state.massesKg,
    state.physicalRadiiM,
    state.fixed,
    timeStepSeconds,
    thresholds,
    guardWorkspace.encounter
  );

  if (encounter.kind !== "none") {
    guardWorkspace.rejectionKind = encounter.kind;
  }

  return guardWorkspace.rejectionKind;
}

/**
 * Checks the complete candidate after force evaluation and before any commit.
 * The function mutates only preallocated scratch buffers on the accepted path.
 */
export function inspectCompletedVelocityVerletCandidate(
  state: NewtonianState,
  verletWorkspace: VelocityVerletWorkspace,
  guardWorkspace: CandidateStateGuardWorkspace
): CandidateGuardRejectionKind | null {
  resetRejection(guardWorkspace);

  if (
    rejectFirstNonFinite(
      verletWorkspace.candidatePositionsM,
      "candidate-positions",
      guardWorkspace
    ) ||
    rejectFirstNonFinite(
      verletWorkspace.candidateVelocitiesMps,
      "candidate-velocities",
      guardWorkspace
    ) ||
    rejectFirstNonFinite(
      verletWorkspace.candidateAccelerationsMps2,
      "candidate-accelerations",
      guardWorkspace
    )
  ) {
    return guardWorkspace.rejectionKind;
  }

  evaluateNewtonianValidityInto(
    state.massesKg,
    state.physicalRadiiM,
    state.fixed,
    verletWorkspace.candidatePositionsM,
    verletWorkspace.candidateVelocitiesMps,
    guardWorkspace.newtonianValidity
  );

  if (hasNewtonianDomainViolation(guardWorkspace.newtonianValidity)) {
    guardWorkspace.rejectionKind = "newtonian-domain-violation";
  }

  return guardWorkspace.rejectionKind;
}

/**
 * Checks a complete phase-space candidate produced by an integrator that does
 * not expose Velocity Verlet's intermediate drift. The swept encounter check,
 * finiteness checks and scientific-domain guard all run before the caller may
 * commit any candidate buffer.
 */
export function inspectCompletedPhaseSpaceCandidate(
  state: NewtonianState,
  timeStepSeconds: number,
  thresholds: EncounterThresholds,
  candidatePositionsM: Float64Array,
  candidateVelocitiesMps: Float64Array,
  candidateAccelerationsMps2: Float64Array,
  guardWorkspace: CandidateStateGuardWorkspace
): CandidateGuardRejectionKind | null {
  resetRejection(guardWorkspace);

  if (
    rejectFirstNonFinite(
      candidatePositionsM,
      "candidate-positions",
      guardWorkspace
    ) ||
    rejectFirstNonFinite(
      candidateVelocitiesMps,
      "candidate-velocities",
      guardWorkspace
    ) ||
    rejectFirstNonFinite(
      candidateAccelerationsMps2,
      "candidate-accelerations",
      guardWorkspace
    )
  ) {
    return guardWorkspace.rejectionKind;
  }

  const encounter = inspectEncounterAcrossStep(
    state.positionsM,
    candidatePositionsM,
    state.massesKg,
    state.physicalRadiiM,
    state.fixed,
    timeStepSeconds,
    thresholds,
    guardWorkspace.encounter
  );

  if (encounter.kind !== "none") {
    guardWorkspace.rejectionKind = encounter.kind;
    return guardWorkspace.rejectionKind;
  }

  evaluateNewtonianValidityInto(
    state.massesKg,
    state.physicalRadiiM,
    state.fixed,
    candidatePositionsM,
    candidateVelocitiesMps,
    guardWorkspace.newtonianValidity
  );

  if (hasNewtonianDomainViolation(guardWorkspace.newtonianValidity)) {
    guardWorkspace.rejectionKind = "newtonian-domain-violation";
  }

  return guardWorkspace.rejectionKind;
}

function responsibilityWithoutFrame(
  responsible:
    | NewtonianValidityReport["beta"]["responsible"]
    | NonNullable<NewtonianValidityReport["chiPair"]>["responsible"]
    | NonNullable<NewtonianValidityReport["chiSelf"]>["responsible"]
    | NewtonianValidityReport["psi"]["responsible"]
): ScientificResponsibility {
  return responsible.kind === "body"
    ? { kind: "body", bodyId: responsible.bodyId }
    : {
        kind: "pair",
        firstBodyId: responsible.firstBodyId,
        secondBodyId: responsible.secondBodyId,
      };
}

function selectDomainViolation(
  report: NewtonianValidityReport
): CandidateNewtonianDomainRejection["violation"] {
  // The metrics have different meanings and must not be collapsed into a
  // pseudo-score. This stable diagnostic priority only selects the primary
  // stop cause; the complete candidate report remains available separately.
  if (report.beta.level === "hard-error") {
    return {
      metric: "beta",
      value: report.beta.value,
      limit: BETA_HARD_ERROR_THRESHOLD,
      responsibility: responsibilityWithoutFrame(
        report.beta.responsible
      ),
      velocityFrame: report.beta.responsible.frame,
    };
  }

  if (report.chiPair?.level === "hard-error") {
    return {
      metric: "chi-pair",
      value: report.chiPair.value,
      limit: WEAK_FIELD_HARD_ERROR_THRESHOLD,
      responsibility: responsibilityWithoutFrame(
        report.chiPair.responsible
      ),
    };
  }

  if (report.chiSelf?.level === "hard-error") {
    return {
      metric: "chi-self",
      value: report.chiSelf.value,
      limit: WEAK_FIELD_HARD_ERROR_THRESHOLD,
      responsibility: responsibilityWithoutFrame(
        report.chiSelf.responsible
      ),
    };
  }

  if (report.psi.level === "hard-error") {
    return {
      metric: "psi",
      value: report.psi.value,
      limit: WEAK_FIELD_HARD_ERROR_THRESHOLD,
      responsibility: responsibilityWithoutFrame(
        report.psi.responsible
      ),
    };
  }

  throw new RangeError(
    "A Newtonian-domain rejection needs at least one hard-error metric."
  );
}

export function materializeCandidateStateRejection(
  bodyIds: readonly string[],
  workspace: CandidateStateGuardWorkspace
): CandidateStateRejection | null {
  if (workspace.rejectionKind === null) {
    return null;
  }

  if (workspace.rejectionKind === "numerical-error") {
    if (
      workspace.numericalBuffer === null ||
      workspace.numericalIndex < 0
    ) {
      throw new RangeError(
        "Numerical candidate rejection is missing its buffer location."
      );
    }

    const bodyIndex = Math.floor(workspace.numericalIndex / 3);
    const axisIndex = workspace.numericalIndex % 3;

    return {
      kind: "numerical-error",
      buffer: workspace.numericalBuffer,
      vectorIndex: workspace.numericalIndex,
      bodyIndex,
      axis: axisIndex === 0 ? "x" : axisIndex === 1 ? "y" : "z",
    };
  }

  if (
    workspace.rejectionKind === "collision" ||
    workspace.rejectionKind === "unresolved-encounter"
  ) {
    const encounter = materializeEncounterDetection(workspace.encounter);

    if (encounter === null) {
      throw new RangeError(
        "Encounter candidate rejection is missing encounter details."
      );
    }

    return { kind: "encounter", encounter };
  }

  const report = materializeNewtonianValidityReport(
    bodyIds,
    workspace.newtonianValidity
  );

  return {
    kind: "newtonian-domain-violation",
    report,
    violation: selectDomainViolation(report),
  };
}
