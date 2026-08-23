import { SPEED_OF_LIGHT_MPS } from "../core/units";
import {
  SCHWARZSCHILD_MINIMUM_TIMELIKE_CIRCULAR_RADIUS_RATIO,
  schwarzschildRadiusM,
} from "./schwarzschildMetric";

export const MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH = 8;
export const MASSIVE_SCHWARZSCHILD_CONSTRAINT_TOLERANCE = 1e-10;

export const MASSIVE_GEODESIC_INDEX = Object.freeze({
  time: 0,
  radius: 1,
  polar: 2,
  azimuthal: 3,
  timeMomentum: 4,
  radialMomentum: 5,
  polarMomentum: 6,
  azimuthalMomentum: 7,
} as const);

export type MassiveSchwarzschildState = Readonly<{
  /** Dimensionless (T=ct/r_s, rho=r/r_s, theta, phi, p_T, p_rho, p_theta, p_phi). */
  phaseSpace: Float64Array;
  /** Massive affine parameter: particle proper time in SI seconds. */
  properTimeSeconds: number;
  stepCount: number;
}>;

export type MassiveSchwarzschildDiagnostics = Readonly<{
  hamiltonian: number;
  constraintResidual: number;
  specificEnergy: number;
  specificAngularMomentum: number;
}>;

export type CircularMassiveSchwarzschildStateOptions = Readonly<{
  centralMassKg: number;
  radiusM: number;
  azimuthalAngleRad?: number;
}>;

function assertFinitePhaseSpaceLength(
  phaseSpace: Float64Array,
  label: string
): void {
  if (phaseSpace.length !== MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH) {
    throw new RangeError(
      `${label} must contain exactly ${MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH} values.`
    );
  }

  for (let index = 0; index < phaseSpace.length; index += 1) {
    if (!Number.isFinite(phaseSpace[index])) {
      throw new RangeError(
        `${label} contains a non-finite value at index ${index}.`
      );
    }
  }
}

export function assertMassiveSchwarzschildPhaseSpaceDomain(
  phaseSpace: Float64Array,
  label = "Massive Schwarzschild phase space"
): void {
  assertFinitePhaseSpaceLength(phaseSpace, label);
  const radiusRatio = phaseSpace[MASSIVE_GEODESIC_INDEX.radius];
  const polarAngleRad = phaseSpace[MASSIVE_GEODESIC_INDEX.polar];

  if (radiusRatio <= 1) {
    throw new RangeError(
      `${label} requires an exterior areal radius ratio rho=r/r_s strictly greater than one.`
    );
  }

  if (polarAngleRad <= 0 || polarAngleRad >= Math.PI) {
    throw new RangeError(
      `${label} requires a polar angle strictly between zero and pi in this coordinate chart.`
    );
  }
}

/**
 * Dimensionless Schwarzschild Hamiltonian with signature (-,+,+,+).
 * The affine parameter is sigma=c*tau/r_s, and a massive normalized state obeys
 * 2H=-1. This is distinct from both coordinate time and proper radial distance.
 */
export function evaluateMassiveSchwarzschildHamiltonian(
  phaseSpace: Float64Array
): number {
  assertMassiveSchwarzschildPhaseSpaceDomain(phaseSpace);
  const radiusRatio = phaseSpace[MASSIVE_GEODESIC_INDEX.radius];
  const polarAngleRad = phaseSpace[MASSIVE_GEODESIC_INDEX.polar];
  const timeMomentum = phaseSpace[MASSIVE_GEODESIC_INDEX.timeMomentum];
  const radialMomentum = phaseSpace[MASSIVE_GEODESIC_INDEX.radialMomentum];
  const polarMomentum = phaseSpace[MASSIVE_GEODESIC_INDEX.polarMomentum];
  const azimuthalMomentum =
    phaseSpace[MASSIVE_GEODESIC_INDEX.azimuthalMomentum];
  const factor = 1 - 1 / radiusRatio;
  const sine = Math.sin(polarAngleRad);
  const radiusSquared = radiusRatio * radiusRatio;
  const hamiltonian =
    0.5 *
    (-(timeMomentum * timeMomentum) / factor +
      factor * radialMomentum * radialMomentum +
      (polarMomentum * polarMomentum) / radiusSquared +
      (azimuthalMomentum * azimuthalMomentum) /
        (radiusSquared * sine * sine));

  if (!Number.isFinite(hamiltonian)) {
    throw new RangeError(
      "Massive Schwarzschild Hamiltonian must remain finite."
    );
  }

  return hamiltonian;
}

export function computeMassiveSchwarzschildDiagnostics(
  phaseSpace: Float64Array
): MassiveSchwarzschildDiagnostics {
  const hamiltonian = evaluateMassiveSchwarzschildHamiltonian(phaseSpace);
  const polarAngleRad = phaseSpace[MASSIVE_GEODESIC_INDEX.polar];
  const polarMomentum = phaseSpace[MASSIVE_GEODESIC_INDEX.polarMomentum];
  const azimuthalMomentum =
    phaseSpace[MASSIVE_GEODESIC_INDEX.azimuthalMomentum];
  const sine = Math.sin(polarAngleRad);
  const specificAngularMomentum = Math.hypot(
    polarMomentum,
    azimuthalMomentum / sine
  );
  const diagnostics = {
    hamiltonian,
    constraintResidual: 2 * hamiltonian + 1,
    specificEnergy: -phaseSpace[MASSIVE_GEODESIC_INDEX.timeMomentum],
    specificAngularMomentum,
  };

  for (const value of Object.values(diagnostics)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(
        "Massive Schwarzschild diagnostics must remain finite."
      );
    }
  }

  return Object.freeze(diagnostics);
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

/**
 * Hamilton equations in normalized Schwarzschild coordinates. Input and output
 * must not alias. The output derivative is with respect to sigma=c*tau/r_s.
 */
export function evaluateMassiveSchwarzschildHamiltonianDerivative(
  phaseSpace: Float64Array,
  outputDerivative: Float64Array
): void {
  assertMassiveSchwarzschildPhaseSpaceDomain(phaseSpace);
  assertFinitePhaseSpaceLength(outputDerivative, "Hamiltonian derivative output");

  if (phaseSpace.buffer === outputDerivative.buffer) {
    throw new RangeError(
      "Hamiltonian derivative output must not alias the input phase space."
    );
  }

  const radiusRatio = phaseSpace[MASSIVE_GEODESIC_INDEX.radius];
  const polarAngleRad = phaseSpace[MASSIVE_GEODESIC_INDEX.polar];
  const timeMomentum = phaseSpace[MASSIVE_GEODESIC_INDEX.timeMomentum];
  const radialMomentum = phaseSpace[MASSIVE_GEODESIC_INDEX.radialMomentum];
  const polarMomentum = phaseSpace[MASSIVE_GEODESIC_INDEX.polarMomentum];
  const azimuthalMomentum =
    phaseSpace[MASSIVE_GEODESIC_INDEX.azimuthalMomentum];
  const factor = 1 - 1 / radiusRatio;
  const factorDerivative = 1 / (radiusRatio * radiusRatio);
  const sine = Math.sin(polarAngleRad);
  const cosine = Math.cos(polarAngleRad);
  const radiusSquared = radiusRatio * radiusRatio;
  const radiusCubed = radiusSquared * radiusRatio;
  const sineSquared = sine * sine;
  const sineCubed = sineSquared * sine;

  outputDerivative[MASSIVE_GEODESIC_INDEX.time] = -timeMomentum / factor;
  outputDerivative[MASSIVE_GEODESIC_INDEX.radius] = factor * radialMomentum;
  outputDerivative[MASSIVE_GEODESIC_INDEX.polar] =
    polarMomentum / radiusSquared;
  outputDerivative[MASSIVE_GEODESIC_INDEX.azimuthal] =
    azimuthalMomentum / (radiusSquared * sineSquared);
  outputDerivative[MASSIVE_GEODESIC_INDEX.timeMomentum] = 0;
  outputDerivative[MASSIVE_GEODESIC_INDEX.radialMomentum] =
    -0.5 *
    ((factorDerivative / (factor * factor)) * timeMomentum * timeMomentum +
      factorDerivative * radialMomentum * radialMomentum -
      (2 * polarMomentum * polarMomentum) / radiusCubed -
      (2 * azimuthalMomentum * azimuthalMomentum) /
        (radiusCubed * sineSquared));
  outputDerivative[MASSIVE_GEODESIC_INDEX.polarMomentum] =
    (cosine * azimuthalMomentum * azimuthalMomentum) /
    (radiusSquared * sineCubed);
  outputDerivative[MASSIVE_GEODESIC_INDEX.azimuthalMomentum] = 0;

  for (let index = 0; index < outputDerivative.length; index += 1) {
    if (!Number.isFinite(outputDerivative[index])) {
      throw new RangeError(
        `Hamiltonian derivative contains a non-finite value at index ${index}.`
      );
    }
  }
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
