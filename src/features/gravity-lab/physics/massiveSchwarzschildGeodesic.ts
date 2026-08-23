import { SPEED_OF_LIGHT_MPS } from "../core/units";
import {
  SCHWARZSCHILD_GEODESIC_INDEX,
  SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  assertSchwarzschildPhaseSpaceDomain,
  computeSchwarzschildGeodesicDiagnostics,
  evaluateSchwarzschildHamiltonian,
  evaluateSchwarzschildHamiltonianDerivative,
  type SchwarzschildGeodesicDiagnostics,
} from "./schwarzschildGeodesic";
import {
  SCHWARZSCHILD_MINIMUM_TIMELIKE_CIRCULAR_RADIUS_RATIO,
  schwarzschildRadiusM,
} from "./schwarzschildMetric";

export const MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH =
  SCHWARZSCHILD_PHASE_SPACE_LENGTH;
export const MASSIVE_SCHWARZSCHILD_CONSTRAINT_TOLERANCE = 1e-10;
export const MASSIVE_GEODESIC_INDEX = SCHWARZSCHILD_GEODESIC_INDEX;

export type MassiveSchwarzschildState = Readonly<{
  /** Dimensionless (T=ct/r_s, rho=r/r_s, theta, phi, p_T, p_rho, p_theta, p_phi). */
  phaseSpace: Float64Array;
  /** Massive affine parameter: particle proper time in SI seconds. */
  properTimeSeconds: number;
  stepCount: number;
}>;

export type MassiveSchwarzschildDiagnostics = SchwarzschildGeodesicDiagnostics;

export type CircularMassiveSchwarzschildStateOptions = Readonly<{
  centralMassKg: number;
  radiusM: number;
  azimuthalAngleRad?: number;
}>;

export function assertMassiveSchwarzschildPhaseSpaceDomain(
  phaseSpace: Float64Array,
  label = "Massive Schwarzschild phase space"
): void {
  assertSchwarzschildPhaseSpaceDomain(phaseSpace, label);
}

export function evaluateMassiveSchwarzschildHamiltonian(
  phaseSpace: Float64Array
): number {
  return evaluateSchwarzschildHamiltonian(phaseSpace);
}

export function computeMassiveSchwarzschildDiagnostics(
  phaseSpace: Float64Array
): MassiveSchwarzschildDiagnostics {
  return computeSchwarzschildGeodesicDiagnostics(phaseSpace, -1);
}

export function createMassiveSchwarzschildState(
  phaseSpace: Float64Array,
  properTimeSeconds = 0,
  stepCount = 0
): MassiveSchwarzschildState {
  assertMassiveSchwarzschildPhaseSpaceDomain(phaseSpace);

  if (!Number.isFinite(properTimeSeconds) || properTimeSeconds < 0) {
    throw new RangeError(
      "Massive Schwarzschild proper time must be finite and non-negative."
    );
  }

  if (!Number.isSafeInteger(stepCount) || stepCount < 0) {
    throw new RangeError(
      "Massive Schwarzschild step count must be a non-negative safe integer."
    );
  }

  const diagnostics = computeMassiveSchwarzschildDiagnostics(phaseSpace);

  if (
    Math.abs(diagnostics.constraintResidual) >
    MASSIVE_SCHWARZSCHILD_CONSTRAINT_TOLERANCE
  ) {
    throw new RangeError(
      `Massive Schwarzschild initial state must satisfy 2H=-1 within ${MASSIVE_SCHWARZSCHILD_CONSTRAINT_TOLERANCE}.`
    );
  }

  return {
    phaseSpace: phaseSpace.slice(),
    properTimeSeconds,
    stepCount,
  };
}

/**
 * Exact future-directed circular timelike state. Circular timelike geodesics
 * exist for rho>3/2; stability is a separate ISCO condition rho>3.
 */
export function createCircularMassiveSchwarzschildState(
  options: CircularMassiveSchwarzschildStateOptions
): MassiveSchwarzschildState {
  const horizonRadiusM = schwarzschildRadiusM(options.centralMassKg);

  if (!Number.isFinite(options.radiusM) || options.radiusM <= 0) {
    throw new RangeError("Circular Schwarzschild radius must be finite and positive.");
  }

  const radiusRatio = options.radiusM / horizonRadiusM;

  if (
    radiusRatio <=
    SCHWARZSCHILD_MINIMUM_TIMELIKE_CIRCULAR_RADIUS_RATIO
  ) {
    throw new RangeError(
      "Circular massive Schwarzschild geodesics require r/r_s strictly greater than 3/2."
    );
  }

  const denominator = Math.sqrt(1 - 3 / (2 * radiusRatio));
  const factor = 1 - 1 / radiusRatio;
  const specificEnergy = factor / denominator;
  const specificAngularMomentum =
    Math.sqrt(radiusRatio / 2) / denominator;
  const phaseSpace = new Float64Array([
    0,
    radiusRatio,
    Math.PI / 2,
    options.azimuthalAngleRad ?? 0,
    -specificEnergy,
    0,
    0,
    specificAngularMomentum,
  ]);

  return createMassiveSchwarzschildState(phaseSpace);
}

export function evaluateMassiveSchwarzschildHamiltonianDerivative(
  phaseSpace: Float64Array,
  outputDerivative: Float64Array
): void {
  evaluateSchwarzschildHamiltonianDerivative(phaseSpace, outputDerivative);
}

export function massiveGeodesicCoordinateTimeSeconds(
  centralMassKg: number,
  phaseSpace: Float64Array
): number {
  assertMassiveSchwarzschildPhaseSpaceDomain(phaseSpace);
  const timeSeconds =
    (phaseSpace[MASSIVE_GEODESIC_INDEX.time] *
      schwarzschildRadiusM(centralMassKg)) /
    SPEED_OF_LIGHT_MPS;

  if (!Number.isFinite(timeSeconds)) {
    throw new RangeError(
      "Massive Schwarzschild coordinate time must remain finite."
    );
  }

  return timeSeconds;
}

export function massiveGeodesicArealRadiusM(
  centralMassKg: number,
  phaseSpace: Float64Array
): number {
  assertMassiveSchwarzschildPhaseSpaceDomain(phaseSpace);
  const radiusM =
    phaseSpace[MASSIVE_GEODESIC_INDEX.radius] *
    schwarzschildRadiusM(centralMassKg);

  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    throw new RangeError(
      "Massive Schwarzschild areal radius must remain finite and positive."
    );
  }

  return radiusM;
}

export function circularMassiveGeodesicProperPeriodSeconds(
  centralMassKg: number,
  radiusM: number
): number {
  const state = createCircularMassiveSchwarzschildState({
    centralMassKg,
    radiusM,
  });
  const radiusRatio = state.phaseSpace[MASSIVE_GEODESIC_INDEX.radius];
  const angularMomentum =
    state.phaseSpace[MASSIVE_GEODESIC_INDEX.azimuthalMomentum];
  const dimensionlessProperPeriod =
    (2 * Math.PI * radiusRatio * radiusRatio) / angularMomentum;
  const periodSeconds =
    (dimensionlessProperPeriod * schwarzschildRadiusM(centralMassKg)) /
    SPEED_OF_LIGHT_MPS;

  if (!Number.isFinite(periodSeconds) || periodSeconds <= 0) {
    throw new RangeError(
      "Circular massive Schwarzschild proper period must remain finite and positive."
    );
  }

  return periodSeconds;
}
