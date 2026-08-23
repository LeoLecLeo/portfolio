export const SCHWARZSCHILD_PHASE_SPACE_LENGTH = 8;

export const SCHWARZSCHILD_GEODESIC_INDEX = Object.freeze({
  time: 0,
  radius: 1,
  polar: 2,
  azimuthal: 3,
  timeMomentum: 4,
  radialMomentum: 5,
  polarMomentum: 6,
  azimuthalMomentum: 7,
} as const);

export type SchwarzschildGeodesicKind = "massive" | "null";
export type SchwarzschildTwoHamiltonianConstraint = -1 | 0;

export type SchwarzschildGeodesicDiagnostics = Readonly<{
  hamiltonian: number;
  constraintResidual: number;
  specificEnergy: number;
  specificAngularMomentum: number;
}>;

export function constraintForSchwarzschildGeodesicKind(
  kind: SchwarzschildGeodesicKind
): SchwarzschildTwoHamiltonianConstraint {
  return kind === "massive" ? -1 : 0;
}

function assertFinitePhaseSpaceLength(
  phaseSpace: Float64Array,
  label: string
): void {
  if (phaseSpace.length !== SCHWARZSCHILD_PHASE_SPACE_LENGTH) {
    throw new RangeError(
      `${label} must contain exactly ${SCHWARZSCHILD_PHASE_SPACE_LENGTH} values.`
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

export function assertSchwarzschildPhaseSpaceDomain(
  phaseSpace: Float64Array,
  label = "Schwarzschild phase space"
): void {
  assertFinitePhaseSpaceLength(phaseSpace, label);
  const radiusRatio = phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.radius];
  const polarAngleRad = phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.polar];

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
 * Dimensionless Schwarzschild Hamiltonian with signature (-,+,+,+), for
 * coordinates (T=ct/r_s, rho=r/r_s, theta, phi). It is the same canonical
 * Hamiltonian for massive and null geodesics; only the constraint differs.
 */
export function evaluateSchwarzschildHamiltonian(
  phaseSpace: Float64Array
): number {
  assertSchwarzschildPhaseSpaceDomain(phaseSpace);
  const radiusRatio = phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.radius];
  const polarAngleRad = phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.polar];
  const timeMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.timeMomentum];
  const radialMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.radialMomentum];
  const polarMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.polarMomentum];
  const azimuthalMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.azimuthalMomentum];
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
    throw new RangeError("Schwarzschild Hamiltonian must remain finite.");
  }

  return hamiltonian;
}

export function computeSchwarzschildGeodesicDiagnostics(
  phaseSpace: Float64Array,
  twoHamiltonianConstraint: SchwarzschildTwoHamiltonianConstraint
): SchwarzschildGeodesicDiagnostics {
  const hamiltonian = evaluateSchwarzschildHamiltonian(phaseSpace);
  const polarAngleRad = phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.polar];
  const polarMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.polarMomentum];
  const azimuthalMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.azimuthalMomentum];
  const sine = Math.sin(polarAngleRad);
  const diagnostics = {
    hamiltonian,
    constraintResidual: 2 * hamiltonian - twoHamiltonianConstraint,
    specificEnergy:
      -phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.timeMomentum],
    specificAngularMomentum: Math.hypot(
      polarMomentum,
      azimuthalMomentum / sine
    ),
  };

  for (const value of Object.values(diagnostics)) {
    if (!Number.isFinite(value)) {
      throw new RangeError("Schwarzschild diagnostics must remain finite.");
    }
  }

  return Object.freeze(diagnostics);
}

/** Hamilton equations d(x,p)/d(lambda/r_s) for the normalized chart. */
export function evaluateSchwarzschildHamiltonianDerivative(
  phaseSpace: Float64Array,
  outputDerivative: Float64Array
): void {
  assertSchwarzschildPhaseSpaceDomain(phaseSpace);
  assertFinitePhaseSpaceLength(outputDerivative, "Hamiltonian derivative output");

  if (phaseSpace.buffer === outputDerivative.buffer) {
    throw new RangeError(
      "Hamiltonian derivative output must not alias the input phase space."
    );
  }

  const radiusRatio = phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.radius];
  const polarAngleRad = phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.polar];
  const timeMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.timeMomentum];
  const radialMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.radialMomentum];
  const polarMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.polarMomentum];
  const azimuthalMomentum =
    phaseSpace[SCHWARZSCHILD_GEODESIC_INDEX.azimuthalMomentum];
  const factor = 1 - 1 / radiusRatio;
  const factorDerivative = 1 / (radiusRatio * radiusRatio);
  const sine = Math.sin(polarAngleRad);
  const cosine = Math.cos(polarAngleRad);
  const radiusSquared = radiusRatio * radiusRatio;
  const radiusCubed = radiusSquared * radiusRatio;
  const sineSquared = sine * sine;
  const sineCubed = sineSquared * sine;

  outputDerivative[SCHWARZSCHILD_GEODESIC_INDEX.time] =
    -timeMomentum / factor;
  outputDerivative[SCHWARZSCHILD_GEODESIC_INDEX.radius] =
    factor * radialMomentum;
  outputDerivative[SCHWARZSCHILD_GEODESIC_INDEX.polar] =
    polarMomentum / radiusSquared;
  outputDerivative[SCHWARZSCHILD_GEODESIC_INDEX.azimuthal] =
    azimuthalMomentum / (radiusSquared * sineSquared);
  outputDerivative[SCHWARZSCHILD_GEODESIC_INDEX.timeMomentum] = 0;
  outputDerivative[SCHWARZSCHILD_GEODESIC_INDEX.radialMomentum] =
    -0.5 *
    ((factorDerivative / (factor * factor)) * timeMomentum * timeMomentum +
      factorDerivative * radialMomentum * radialMomentum -
      (2 * polarMomentum * polarMomentum) / radiusCubed -
      (2 * azimuthalMomentum * azimuthalMomentum) /
        (radiusCubed * sineSquared));
  outputDerivative[SCHWARZSCHILD_GEODESIC_INDEX.polarMomentum] =
    (cosine * azimuthalMomentum * azimuthalMomentum) /
    (radiusSquared * sineCubed);
  outputDerivative[SCHWARZSCHILD_GEODESIC_INDEX.azimuthalMomentum] = 0;

  for (let index = 0; index < outputDerivative.length; index += 1) {
    if (!Number.isFinite(outputDerivative[index])) {
      throw new RangeError(
        `Hamiltonian derivative contains a non-finite value at index ${index}.`
      );
    }
  }
}
