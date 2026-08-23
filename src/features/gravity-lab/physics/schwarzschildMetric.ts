import {
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SPEED_OF_LIGHT_MPS,
} from "../core/units";

export const SCHWARZSCHILD_HORIZON_RADIUS_RATIO = 1;
export const SCHWARZSCHILD_MINIMUM_TIMELIKE_CIRCULAR_RADIUS_RATIO = 1.5;
export const SCHWARZSCHILD_ISCO_RADIUS_RATIO = 3;

export type SchwarzschildDiagonalMetric = readonly [
  time: number,
  radial: number,
  polar: number,
  azimuthal: number,
];

export type SchwarzschildMetricSample = Readonly<{
  coordinateConvention: "x0=ct,r,theta,phi";
  radiusM: number;
  polarAngleRad: number;
  schwarzschildRadiusM: number;
  metricFactor: number;
  covariantDiagonal: SchwarzschildDiagonalMetric;
  contravariantDiagonal: SchwarzschildDiagonalMetric;
}>;

export type MassiveCircularOrbitStability =
  | "stable"
  | "marginally-stable"
  | "unstable";

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and strictly positive.`);
  }
}

function assertExteriorRadius(
  centralMassKg: number,
  radiusM: number
): number {
  assertFinitePositive(centralMassKg, "Schwarzschild central mass");
  assertFinitePositive(radiusM, "Schwarzschild areal radius");
  const horizonRadiusM = schwarzschildRadiusM(centralMassKg);

  if (radiusM <= horizonRadiusM) {
    throw new RangeError(
      "Schwarzschild exterior coordinates require an areal radius strictly greater than r_s."
    );
  }

  return horizonRadiusM;
}

function assertRegularPolarAngle(polarAngleRad: number): void {
  if (
    !Number.isFinite(polarAngleRad) ||
    polarAngleRad <= 0 ||
    polarAngleRad >= Math.PI
  ) {
    throw new RangeError(
      "Schwarzschild polar angle must be finite and strictly between 0 and pi in this coordinate chart."
    );
  }
}

/** Exact Schwarzschild radius 2GM/c², returned in SI metres. */
export function schwarzschildRadiusM(centralMassKg: number): number {
  assertFinitePositive(centralMassKg, "Schwarzschild central mass");
  const radiusM =
    (2 * GRAVITATIONAL_CONSTANT_M3_KG_S2 * centralMassKg) /
    (SPEED_OF_LIGHT_MPS * SPEED_OF_LIGHT_MPS);

  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    throw new RangeError("Schwarzschild radius must remain finite and positive.");
  }

  return radiusM;
}

/** f(r) = 1 - r_s/r in the exterior Schwarzschild chart. */
export function schwarzschildMetricFactor(
  centralMassKg: number,
  radiusM: number
): number {
  const horizonRadiusM = assertExteriorRadius(centralMassKg, radiusM);
  const factor = 1 - horizonRadiusM / radiusM;

  if (!Number.isFinite(factor) || factor <= 0 || factor > 1) {
    throw new RangeError(
      "Schwarzschild metric factor must remain finite, positive, and no greater than one."
    );
  }

  return factor;
}

/**
 * Diagonal Schwarzschild metric for coordinates (x0=ct, r, theta, phi).
 * r is the areal radius in metres; theta and phi are angles in radians.
 * Angular coefficients therefore carry the coordinate-basis metre² factors.
 */
export function sampleExteriorSchwarzschildMetric(
  centralMassKg: number,
  radiusM: number,
  polarAngleRad: number
): SchwarzschildMetricSample {
  const horizonRadiusM = assertExteriorRadius(centralMassKg, radiusM);
  assertRegularPolarAngle(polarAngleRad);
  const factor = 1 - horizonRadiusM / radiusM;
  const radiusSquaredM2 = radiusM * radiusM;
  const sine = Math.sin(polarAngleRad);
  const azimuthalCoefficient = radiusSquaredM2 * sine * sine;
  const covariantDiagonal = Object.freeze([
    -factor,
    1 / factor,
    radiusSquaredM2,
    azimuthalCoefficient,
  ]) as SchwarzschildDiagonalMetric;
  const contravariantDiagonal = Object.freeze([
    -1 / factor,
    factor,
    1 / radiusSquaredM2,
    1 / azimuthalCoefficient,
  ]) as SchwarzschildDiagonalMetric;

  for (const coefficient of [
    ...covariantDiagonal,
    ...contravariantDiagonal,
  ]) {
    if (!Number.isFinite(coefficient)) {
      throw new RangeError("Schwarzschild metric coefficients must be finite.");
    }
  }

  return Object.freeze({
    coordinateConvention: "x0=ct,r,theta,phi" as const,
    radiusM,
    polarAngleRad,
    schwarzschildRadiusM: horizonRadiusM,
    metricFactor: factor,
    covariantDiagonal,
    contravariantDiagonal,
  });
}

/** dτ/dt for a static exterior observer relative to Schwarzschild time. */
export function schwarzschildStaticLapse(
  centralMassKg: number,
  radiusM: number
): number {
  return Math.sqrt(schwarzschildMetricFactor(centralMassKg, radiusM));
}

/** R_abcd R^abcd in m^-4. */
export function schwarzschildKretschmannM4(
  centralMassKg: number,
  radiusM: number
): number {
  const horizonRadiusM = assertExteriorRadius(centralMassKg, radiusM);
  const invariantM4 =
    (12 * horizonRadiusM * horizonRadiusM) / radiusM ** 6;

  if (!Number.isFinite(invariantM4) || invariantM4 < 0) {
    throw new RangeError(
      "Schwarzschild Kretschmann invariant must remain finite and non-negative."
    );
  }

  return invariantM4;
}

/**
 * Proper radial distance on the t=constant Schwarzschild slice, measured from
 * the horizon to an exterior areal radius. This is not the areal radius itself.
 */
export function schwarzschildProperRadialDistanceFromHorizonM(
  centralMassKg: number,
  radiusM: number
): number {
  const horizonRadiusM = assertExteriorRadius(centralMassKg, radiusM);
  const radialGapM = radiusM - horizonRadiusM;
  const distanceM =
    Math.sqrt(radiusM * radialGapM) +
    horizonRadiusM *
      Math.log(
        (Math.sqrt(radiusM) + Math.sqrt(radialGapM)) /
          Math.sqrt(horizonRadiusM)
      );

  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    throw new RangeError(
      "Schwarzschild proper radial distance must remain finite and positive."
    );
  }

  return distanceM;
}

export function schwarzschildIscoRadiusM(centralMassKg: number): number {
  return SCHWARZSCHILD_ISCO_RADIUS_RATIO * schwarzschildRadiusM(centralMassKg);
}

/** Exact Schwarzschild-coordinate angular frequency sqrt(GM/r³). */
export function massiveCircularCoordinateAngularFrequencyRadPerSecond(
  centralMassKg: number,
  radiusM: number
): number {
  assertExteriorRadius(centralMassKg, radiusM);
  const angularFrequency = Math.sqrt(
    (GRAVITATIONAL_CONSTANT_M3_KG_S2 * centralMassKg) / radiusM ** 3
  );

  if (!Number.isFinite(angularFrequency) || angularFrequency <= 0) {
    throw new RangeError(
      "Massive circular-orbit angular frequency must remain finite and positive."
    );
  }

  return angularFrequency;
}

/**
 * Radial epicyclic frequency squared in Schwarzschild coordinate time.
 * Its sign changes at r=6GM/c²=3r_s, giving the ISCO stability boundary.
 */
export function massiveCircularRadialEpicyclicFrequencySquaredPerSecond2(
  centralMassKg: number,
  radiusM: number
): number {
  const horizonRadiusM = assertExteriorRadius(centralMassKg, radiusM);
  const orbitalFrequency =
    massiveCircularCoordinateAngularFrequencyRadPerSecond(
      centralMassKg,
      radiusM
    );
  const frequencySquared =
    orbitalFrequency *
    orbitalFrequency *
    (1 - (3 * horizonRadiusM) / radiusM);

  if (!Number.isFinite(frequencySquared)) {
    throw new RangeError(
      "Massive circular radial epicyclic frequency must remain finite."
    );
  }

  return frequencySquared;
}

export function classifyMassiveCircularOrbitStability(
  centralMassKg: number,
  radiusM: number
): MassiveCircularOrbitStability {
  const iscoRadiusM = schwarzschildIscoRadiusM(centralMassKg);
  const horizonRadiusM = assertExteriorRadius(centralMassKg, radiusM);

  if (
    radiusM <=
    SCHWARZSCHILD_MINIMUM_TIMELIKE_CIRCULAR_RADIUS_RATIO * horizonRadiusM
  ) {
    throw new RangeError(
      "Massive circular Schwarzschild geodesics require r/r_s strictly greater than 3/2."
    );
  }

  if (radiusM > iscoRadiusM) {
    return "stable";
  }

  if (radiusM === iscoRadiusM) {
    return "marginally-stable";
  }

  return "unstable";
}
