import {
  SCHWARZSCHILD_GEODESIC_INDEX,
  SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  assertSchwarzschildPhaseSpaceDomain,
  computeSchwarzschildGeodesicDiagnostics,
  type SchwarzschildGeodesicDiagnostics,
} from "./schwarzschildGeodesic";
import {
  SCHWARZSCHILD_PHOTON_SPHERE_RADIUS_RATIO,
  schwarzschildCriticalNullImpactParameterM,
  schwarzschildRadiusM,
} from "./schwarzschildMetric";

export const NULL_SCHWARZSCHILD_CONSTRAINT_TOLERANCE = 1e-10;
export const NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH =
  SCHWARZSCHILD_PHASE_SPACE_LENGTH;
export const NULL_GEODESIC_INDEX = SCHWARZSCHILD_GEODESIC_INDEX;

export type NullSchwarzschildState = Readonly<{
  phaseSpace: Float64Array;
  /** Dimensionless affine parameter lambda/r_s; its overall scale is conventional. */
  affineParameter: number;
  stepCount: number;
}>;

export type NullSchwarzschildDiagnostics = SchwarzschildGeodesicDiagnostics;

export type NullRadialDirection = "inward" | "outward" | "circular";

export type EquatorialNullStateFromConstantsOptions = Readonly<{
  centralMassKg: number;
  radiusM: number;
  specificEnergy?: number;
  dimensionlessAngularMomentum: number;
  radialDirection: NullRadialDirection;
  azimuthalAngleRad?: number;
}>;

export type IncomingNullStateOptions = Readonly<{
  centralMassKg: number;
  initialRadiusM: number;
  impactParameterM: number;
  azimuthalAngleRad?: number;
}>;

export function computeNullSchwarzschildDiagnostics(
  phaseSpace: Float64Array
): NullSchwarzschildDiagnostics {
  return computeSchwarzschildGeodesicDiagnostics(phaseSpace, 0);
}

export function createNullSchwarzschildState(
  phaseSpace: Float64Array,
  affineParameter = 0,
  stepCount = 0
): NullSchwarzschildState {
  assertSchwarzschildPhaseSpaceDomain(
    phaseSpace,
    "Null Schwarzschild phase space"
  );

  if (!Number.isFinite(affineParameter) || affineParameter < 0) {
    throw new RangeError(
      "Null Schwarzschild affine parameter must be finite and non-negative."
    );
  }

  if (!Number.isSafeInteger(stepCount) || stepCount < 0) {
    throw new RangeError(
      "Null Schwarzschild step count must be a non-negative safe integer."
    );
  }

  const diagnostics = computeNullSchwarzschildDiagnostics(phaseSpace);

  if (diagnostics.specificEnergy <= 0) {
    throw new RangeError(
      "Null Schwarzschild state must be future-directed with E=-p_T strictly positive."
    );
  }

  if (
    Math.abs(diagnostics.constraintResidual) >
    NULL_SCHWARZSCHILD_CONSTRAINT_TOLERANCE
  ) {
    throw new RangeError(
      `Null Schwarzschild initial state must satisfy 2H=0 within ${NULL_SCHWARZSCHILD_CONSTRAINT_TOLERANCE}.`
    );
  }

  return {
    phaseSpace: phaseSpace.slice(),
    affineParameter,
    stepCount,
  };
}

/**
 * Builds an equatorial null state from the conserved E and L. The radial
 * momentum is solved analytically from H=0; no post-construction
 * renormalization is performed.
 */
export function createEquatorialNullSchwarzschildStateFromConstants(
  options: EquatorialNullStateFromConstantsOptions
): NullSchwarzschildState {
  const horizonRadiusM = schwarzschildRadiusM(options.centralMassKg);

  if (!Number.isFinite(options.radiusM) || options.radiusM <= horizonRadiusM) {
    throw new RangeError(
      "Equatorial null state requires a finite areal radius strictly outside r_s."
    );
  }

  const specificEnergy = options.specificEnergy ?? 1;

  if (!Number.isFinite(specificEnergy) || specificEnergy <= 0) {
    throw new RangeError(
      "Equatorial null-state energy scale must be finite and strictly positive."
    );
  }

  if (!Number.isFinite(options.dimensionlessAngularMomentum)) {
    throw new RangeError(
      "Equatorial null-state angular momentum must be finite."
    );
  }

  const radiusRatio = options.radiusM / horizonRadiusM;
  const factor = 1 - 1 / radiusRatio;
  const angularMomentum = options.dimensionlessAngularMomentum;
  const radialMomentumSquared =
    (specificEnergy * specificEnergy) / (factor * factor) -
    (angularMomentum * angularMomentum) /
      (factor * radiusRatio * radiusRatio);
  const roundingScale = Math.max(
    1,
    (specificEnergy * specificEnergy) / (factor * factor),
    (angularMomentum * angularMomentum) /
      (factor * radiusRatio * radiusRatio)
  );
  const roundingTolerance = 32 * Number.EPSILON * roundingScale;

  if (radialMomentumSquared < -roundingTolerance) {
    throw new RangeError(
      "The requested null constants do not permit a real radial momentum at this radius."
    );
  }

  const radialMagnitude = Math.sqrt(Math.max(0, radialMomentumSquared));

  if (
    options.radialDirection === "circular" &&
    radialMagnitude > Math.sqrt(roundingTolerance)
  ) {
    throw new RangeError(
      "A circular null state requires a radial turning point at the requested radius."
    );
  }

  const radialMomentum =
    options.radialDirection === "inward"
      ? -radialMagnitude
      : options.radialDirection === "outward"
        ? radialMagnitude
        : 0;

  return createNullSchwarzschildState(
    new Float64Array([
      0,
      radiusRatio,
      Math.PI / 2,
      options.azimuthalAngleRad ?? 0,
      -specificEnergy,
      radialMomentum,
      0,
      angularMomentum,
    ])
  );
}

export function createCircularPhotonSphereState(
  centralMassKg: number,
  azimuthalAngleRad = 0
): NullSchwarzschildState {
  const horizonRadiusM = schwarzschildRadiusM(centralMassKg);
  const criticalImpactRatio =
    schwarzschildCriticalNullImpactParameterM(centralMassKg) /
    horizonRadiusM;

  return createEquatorialNullSchwarzschildStateFromConstants({
    centralMassKg,
    radiusM:
      SCHWARZSCHILD_PHOTON_SPHERE_RADIUS_RATIO * horizonRadiusM,
    specificEnergy: 1,
    dimensionlessAngularMomentum: criticalImpactRatio,
    radialDirection: "circular",
    azimuthalAngleRad,
  });
}

export function createIncomingEquatorialNullSchwarzschildState(
  options: IncomingNullStateOptions
): NullSchwarzschildState {
  if (!Number.isFinite(options.impactParameterM) || options.impactParameterM <= 0) {
    throw new RangeError(
      "Incoming null impact parameter must be finite and strictly positive."
    );
  }

  const horizonRadiusM = schwarzschildRadiusM(options.centralMassKg);
  return createEquatorialNullSchwarzschildStateFromConstants({
    centralMassKg: options.centralMassKg,
    radiusM: options.initialRadiusM,
    specificEnergy: 1,
    dimensionlessAngularMomentum:
      options.impactParameterM / horizonRadiusM,
    radialDirection: "inward",
    azimuthalAngleRad: options.azimuthalAngleRad,
  });
}

export function nullImpactParameterM(
  centralMassKg: number,
  phaseSpace: Float64Array
): number {
  const diagnostics = computeNullSchwarzschildDiagnostics(phaseSpace);
  const impactParameterM =
    (diagnostics.specificAngularMomentum / diagnostics.specificEnergy) *
    schwarzschildRadiusM(centralMassKg);

  if (!Number.isFinite(impactParameterM) || impactParameterM < 0) {
    throw new RangeError("Null impact parameter must remain finite.");
  }

  return impactParameterM;
}

export function weakFieldSchwarzschildDeflectionRad(
  centralMassKg: number,
  impactParameterM: number
): number {
  if (!Number.isFinite(impactParameterM) || impactParameterM <= 0) {
    throw new RangeError(
      "Weak-field impact parameter must be finite and strictly positive."
    );
  }

  return (2 * schwarzschildRadiusM(centralMassKg)) / impactParameterM;
}
