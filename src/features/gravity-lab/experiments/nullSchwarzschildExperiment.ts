import {
  NULL_GEODESIC_INDEX,
  NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  computeNullSchwarzschildDiagnostics,
  createIncomingEquatorialNullSchwarzschildState,
  createNullSchwarzschildState,
  type NullSchwarzschildDiagnostics,
  type NullSchwarzschildState,
} from "../physics/nullSchwarzschildGeodesic";
import { schwarzschildRadiusM } from "../physics/schwarzschildMetric";
import {
  assertSchwarzschildStateOutsideHorizonGuard,
  createSchwarzschildGeodesicRk4Workspace,
  createSchwarzschildHorizonGuard,
  prepareSchwarzschildGeodesicRk4Candidate,
  type SchwarzschildGeodesicStepRejectionReason,
  type SchwarzschildHorizonGuard,
} from "./schwarzschildGeodesicRk4";

export type NullSchwarzschildStepResult =
  | Readonly<{
      accepted: true;
      nextAffineParameter: number;
      nextStepCount: number;
      diagnostics: NullSchwarzschildDiagnostics;
    }>
  | Readonly<{
      accepted: false;
      reason: SchwarzschildGeodesicStepRejectionReason;
      message: string;
      observedRadiusRatio: number | null;
    }>;

export type HeadlessNullSchwarzschildOptions = Readonly<{
  affineStep: number;
  initialState: NullSchwarzschildState;
  horizonGuard?: SchwarzschildHorizonGuard;
}>;

export type NullScatteringClassification =
  | "scattered"
  | "captured"
  | "max-steps";

export const NULL_SCHWARZSCHILD_REFERENCE_AFFINE_STEP = 0.01;
export const NULL_SCHWARZSCHILD_REFERENCE_RAYS = Object.freeze([
  Object.freeze({
    id: "scattered",
    impactParameterCriticalFactor: 1.1,
    expectedClassification: "scattered" as const,
  }),
  Object.freeze({
    id: "near-critical",
    impactParameterCriticalFactor: 1.001,
    expectedClassification: "scattered" as const,
  }),
  Object.freeze({
    id: "captured",
    impactParameterCriticalFactor: 0.999,
    expectedClassification: "captured" as const,
  }),
] as const);

export type NullScatteringExperimentOptions = Readonly<{
  centralMassKg: number;
  initialRadiusM: number;
  impactParameterM: number;
  affineStep: number;
  maxSteps: number;
  horizonGuard?: SchwarzschildHorizonGuard;
}>;

export type NullScatteringExperimentResult = Readonly<{
  classification: NullScatteringClassification;
  deflectionRad: number | null;
  periapsisRadiusRatio: number;
  stepCount: number;
  maxConstraintResidual: number;
  relativeEnergyDrift: number;
  relativeAngularMomentumDrift: number;
  termination: "return-radius" | "horizon-guard" | "step-budget";
}>;

function assertAffineStep(affineStep: number): void {
  if (!Number.isFinite(affineStep) || affineStep <= 0) {
    throw new RangeError(
      "Null Schwarzschild affine step must be finite and strictly positive."
    );
  }
}

export class HeadlessNullSchwarzschildSimulation {
  readonly #affineStep: number;
  readonly #horizonGuard: SchwarzschildHorizonGuard;
  readonly #workspace = createSchwarzschildGeodesicRk4Workspace();
  readonly #phaseSpace: Float64Array;
  #affineParameter: number;
  #stepCount: number;
  #diagnostics: NullSchwarzschildDiagnostics;

  constructor(options: HeadlessNullSchwarzschildOptions) {
    assertAffineStep(options.affineStep);
    this.#affineStep = options.affineStep;
    this.#horizonGuard =
      options.horizonGuard ?? createSchwarzschildHorizonGuard();
    const validatedInitialState = createNullSchwarzschildState(
      options.initialState.phaseSpace,
      options.initialState.affineParameter,
      options.initialState.stepCount
    );
    this.#phaseSpace = validatedInitialState.phaseSpace;
    this.#affineParameter = validatedInitialState.affineParameter;
    this.#stepCount = validatedInitialState.stepCount;
    this.#diagnostics = computeNullSchwarzschildDiagnostics(this.#phaseSpace);
    assertSchwarzschildStateOutsideHorizonGuard(
      this.#phaseSpace,
      this.#horizonGuard,
      "Headless null Schwarzschild initial state"
    );
  }

  get affineParameter(): number {
    return this.#affineParameter;
  }

  get affineStep(): number {
    return this.#affineStep;
  }

  get stepCount(): number {
    return this.#stepCount;
  }

  get diagnostics(): NullSchwarzschildDiagnostics {
    return this.#diagnostics;
  }

  advanceOneStep(): NullSchwarzschildStepResult {
    const nextStepCount = this.#stepCount + 1;
    const nextAffineParameter = this.#affineParameter + this.#affineStep;

    if (!Number.isSafeInteger(nextStepCount)) {
      throw new RangeError(
        "Null Schwarzschild step count would exceed the safe integer range."
      );
    }

    if (
      !Number.isFinite(nextAffineParameter) ||
      nextAffineParameter <= this.#affineParameter
    ) {
      throw new RangeError(
        "Null Schwarzschild affine parameter would stop advancing or become non-finite."
      );
    }

    const candidate = prepareSchwarzschildGeodesicRk4Candidate(
      this.#phaseSpace,
      this.#affineStep,
      0,
      this.#horizonGuard,
      this.#workspace
    );

    if (!candidate.accepted) {
      return candidate;
    }

    this.#phaseSpace.set(this.#workspace.candidate);
    this.#affineParameter = nextAffineParameter;
    this.#stepCount = nextStepCount;
    this.#diagnostics = candidate.diagnostics;

    return Object.freeze({
      accepted: true as const,
      nextAffineParameter,
      nextStepCount,
      diagnostics: candidate.diagnostics,
    });
  }

  copyPhaseSpaceTo(target: Float64Array): void {
    if (target.length !== this.#phaseSpace.length) {
      throw new RangeError(
        "Null Schwarzschild target does not match the phase-space state."
      );
    }

    target.set(this.#phaseSpace);
  }
}

function relativeDrift(current: number, initial: number): number {
  return Math.abs(current - initial) / Math.max(Math.abs(initial), Number.MIN_VALUE);
}

function localizeReturnAzimuthalAngle(
  phaseSpaceBeforeCrossing: Float64Array,
  targetRadiusRatio: number,
  affineStep: number,
  horizonGuard: SchwarzschildHorizonGuard
): number {
  const workspace = createSchwarzschildGeodesicRk4Workspace();
  let lowerStep = 0;
  let upperStep = affineStep;
  let upperAzimuthalAngle = Number.NaN;

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const trialStep = (lowerStep + upperStep) * 0.5;
    const result = prepareSchwarzschildGeodesicRk4Candidate(
      phaseSpaceBeforeCrossing,
      trialStep,
      0,
      horizonGuard,
      workspace
    );

    if (!result.accepted) {
      throw new RangeError(
        "Return-radius localization unexpectedly left the exterior domain."
      );
    }

    const trialRadius = workspace.candidate[NULL_GEODESIC_INDEX.radius];

    if (trialRadius < targetRadiusRatio) {
      lowerStep = trialStep;
    } else {
      upperStep = trialStep;
      upperAzimuthalAngle =
        workspace.candidate[NULL_GEODESIC_INDEX.azimuthal];
    }
  }

  if (!Number.isFinite(upperAzimuthalAngle)) {
    const result = prepareSchwarzschildGeodesicRk4Candidate(
      phaseSpaceBeforeCrossing,
      upperStep,
      0,
      horizonGuard,
      workspace
    );

    if (!result.accepted) {
      throw new RangeError("Return-radius localization failed.");
    }

    upperAzimuthalAngle =
      workspace.candidate[NULL_GEODESIC_INDEX.azimuthal];
  }

  return upperAzimuthalAngle;
}

/**
 * Integrates one equatorial ray from a finite exterior radius back to the same
 * radius or to the explicit horizon guard. For scattering, the reported angle
 * subtracts the flat-space chord angle 2*acos(b/r0), removing the known finite
 * launch-radius geometry before comparison with the asymptotic weak-field law.
 */
export function runNullSchwarzschildScatteringExperiment(
  options: NullScatteringExperimentOptions
): NullScatteringExperimentResult {
  schwarzschildRadiusM(options.centralMassKg);
  assertAffineStep(options.affineStep);

  if (!Number.isSafeInteger(options.maxSteps) || options.maxSteps < 1) {
    throw new RangeError(
      "Null scattering step budget must be a strictly positive safe integer."
    );
  }

  const initialState = createIncomingEquatorialNullSchwarzschildState({
    centralMassKg: options.centralMassKg,
    initialRadiusM: options.initialRadiusM,
    impactParameterM: options.impactParameterM,
  });
  const horizonGuard =
    options.horizonGuard ?? createSchwarzschildHorizonGuard();
  const simulation = new HeadlessNullSchwarzschildSimulation({
    affineStep: options.affineStep,
    initialState,
    horizonGuard,
  });
  const initialRadiusRatio = initialState.phaseSpace[NULL_GEODESIC_INDEX.radius];
  const impactRatio =
    options.impactParameterM / schwarzschildRadiusM(options.centralMassKg);

  if (impactRatio >= initialRadiusRatio) {
    throw new RangeError(
      "Scattering launch radius must be strictly greater than the impact parameter."
    );
  }

  const initialDiagnostics = simulation.diagnostics;
  const currentPhaseSpace = new Float64Array(
    NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH
  );
  const previousPhaseSpace = new Float64Array(
    NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH
  );
  simulation.copyPhaseSpaceTo(currentPhaseSpace);
  let periapsisRadiusRatio = initialRadiusRatio;
  let maxConstraintResidual = Math.abs(
    initialDiagnostics.constraintResidual
  );
  let turnedOutward = false;

  for (let step = 0; step < options.maxSteps; step += 1) {
    previousPhaseSpace.set(currentPhaseSpace);
    const result = simulation.advanceOneStep();

    if (!result.accepted) {
      if (result.reason === "horizon-approach") {
        return Object.freeze({
          classification: "captured" as const,
          deflectionRad: null,
          periapsisRadiusRatio,
          stepCount: simulation.stepCount,
          maxConstraintResidual,
          relativeEnergyDrift: relativeDrift(
            simulation.diagnostics.specificEnergy,
            initialDiagnostics.specificEnergy
          ),
          relativeAngularMomentumDrift: relativeDrift(
            simulation.diagnostics.specificAngularMomentum,
            initialDiagnostics.specificAngularMomentum
          ),
          termination: "horizon-guard" as const,
        });
      }

      throw new RangeError(result.message);
    }

    simulation.copyPhaseSpaceTo(currentPhaseSpace);
    const currentRadiusRatio = currentPhaseSpace[NULL_GEODESIC_INDEX.radius];
    periapsisRadiusRatio = Math.min(
      periapsisRadiusRatio,
      currentRadiusRatio
    );
    maxConstraintResidual = Math.max(
      maxConstraintResidual,
      Math.abs(simulation.diagnostics.constraintResidual)
    );

    if (currentPhaseSpace[NULL_GEODESIC_INDEX.radialMomentum] > 0) {
      turnedOutward = true;
    }

    if (
      turnedOutward &&
      previousPhaseSpace[NULL_GEODESIC_INDEX.radius] < initialRadiusRatio &&
      currentRadiusRatio >= initialRadiusRatio
    ) {
      const returnAzimuthalAngle = localizeReturnAzimuthalAngle(
        previousPhaseSpace,
        initialRadiusRatio,
        options.affineStep,
        horizonGuard
      );
      const flatFiniteBoundaryAngle = 2 * Math.acos(
        impactRatio / initialRadiusRatio
      );
      const deflectionRad =
        returnAzimuthalAngle -
        initialState.phaseSpace[NULL_GEODESIC_INDEX.azimuthal] -
        flatFiniteBoundaryAngle;

      if (!Number.isFinite(deflectionRad)) {
        throw new RangeError("Null scattering deflection must remain finite.");
      }

      return Object.freeze({
        classification: "scattered" as const,
        deflectionRad,
        periapsisRadiusRatio,
        stepCount: simulation.stepCount,
        maxConstraintResidual,
        relativeEnergyDrift: relativeDrift(
          simulation.diagnostics.specificEnergy,
          initialDiagnostics.specificEnergy
        ),
        relativeAngularMomentumDrift: relativeDrift(
          simulation.diagnostics.specificAngularMomentum,
          initialDiagnostics.specificAngularMomentum
        ),
        termination: "return-radius" as const,
      });
    }
  }

  return Object.freeze({
    classification: "max-steps" as const,
    deflectionRad: null,
    periapsisRadiusRatio,
    stepCount: simulation.stepCount,
    maxConstraintResidual,
    relativeEnergyDrift: relativeDrift(
      simulation.diagnostics.specificEnergy,
      initialDiagnostics.specificEnergy
    ),
    relativeAngularMomentumDrift: relativeDrift(
      simulation.diagnostics.specificAngularMomentum,
      initialDiagnostics.specificAngularMomentum
    ),
    termination: "step-budget" as const,
  });
}
