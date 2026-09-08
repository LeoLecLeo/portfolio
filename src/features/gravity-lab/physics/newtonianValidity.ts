import {
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SPEED_OF_LIGHT_MPS,
} from "../core/units";

export const BETA_CAUTION_THRESHOLD = 0.01;
export const BETA_STRONG_WARNING_THRESHOLD = 0.03;
export const BETA_HARD_ERROR_THRESHOLD = 0.1;

export const WEAK_FIELD_CAUTION_THRESHOLD = 1e-4;
export const WEAK_FIELD_STRONG_WARNING_THRESHOLD = 1e-3;
export const WEAK_FIELD_HARD_ERROR_THRESHOLD = 1e-2;

const GRAVITATIONAL_LENGTH_PER_KILOGRAM_M =
  GRAVITATIONAL_CONSTANT_M3_KG_S2 /
  (SPEED_OF_LIGHT_MPS * SPEED_OF_LIGHT_MPS);

export type NewtonianValidityLevel =
  | "recommended"
  | "caution"
  | "strong-warning"
  | "hard-error";

export type NewtonianVelocityFrame = "barycentric" | "scenario";

export type NewtonianPairResponsible = Readonly<{
  kind: "pair";
  firstBodyId: string;
  secondBodyId: string;
}>;

export type NewtonianBodyResponsible = Readonly<{
  kind: "body";
  bodyId: string;
}>;

export type NewtonianBetaResponsible =
  | Readonly<{
      kind: "body";
      bodyId: string;
      frame: NewtonianVelocityFrame;
    }>
  | Readonly<{
      kind: "pair";
      firstBodyId: string;
      secondBodyId: string;
      frame: "relative";
    }>;

export type NewtonianValidityMeasurement<TResponsible> = Readonly<{
  value: number;
  level: NewtonianValidityLevel;
  responsible: TResponsible;
}>;

export type NewtonianValidityReport = Readonly<{
  velocityFrame: NewtonianVelocityFrame;
  hasExternalConstraint: boolean;
  beta: NewtonianValidityMeasurement<NewtonianBetaResponsible>;
  chiPair: NewtonianValidityMeasurement<NewtonianPairResponsible> | null;
  chiSelf: NewtonianValidityMeasurement<NewtonianBodyResponsible> | null;
  unknownSelfCompactnessBodyIds: readonly string[];
  psi: NewtonianValidityMeasurement<NewtonianBodyResponsible>;
  overallLevel: NewtonianValidityLevel;
}>;

/**
 * Mutable scratch storage for the hot candidate-state path.
 *
 * Callers create one workspace per engine and reuse it. The evaluator only
 * mutates scalars and preallocated typed arrays; report objects and body-id
 * arrays are produced separately by materializeNewtonianValidityReport.
 */
export type NewtonianValidityWorkspace = {
  readonly bodyCount: number;
  readonly localPotentials: Float64Array;
  readonly localPotentialCompensations: Float64Array;
  readonly unknownSelfCompactness: Uint8Array;
  hasExternalConstraint: boolean;
  maximumBeta: number;
  betaResponsibleKind: 0 | 1;
  betaFirstBodyIndex: number;
  betaSecondBodyIndex: number;
  hasPairCompactness: boolean;
  maximumPairCompactness: number;
  pairCompactnessFirstBodyIndex: number;
  pairCompactnessSecondBodyIndex: number;
  hasKnownSelfCompactness: boolean;
  maximumSelfCompactness: number;
  selfCompactnessBodyIndex: number;
  unknownSelfCompactnessCount: number;
  maximumLocalPotential: number;
  localPotentialBodyIndex: number;
};

function normalizeMetric(value: number): number {
  return Number.isFinite(value) && value >= 0
    ? value
    : Number.POSITIVE_INFINITY;
}

function levelRank(level: NewtonianValidityLevel): number {
  switch (level) {
    case "recommended":
      return 0;
    case "caution":
      return 1;
    case "strong-warning":
      return 2;
    case "hard-error":
      return 3;
  }
}

function worseLevel(
  first: NewtonianValidityLevel,
  second: NewtonianValidityLevel
): NewtonianValidityLevel {
  return levelRank(second) > levelRank(first) ? second : first;
}

function addLocalPotential(
  workspace: NewtonianValidityWorkspace,
  bodyIndex: number,
  contribution: number
): void {
  const normalizedContribution = normalizeMetric(contribution);
  const current = workspace.localPotentials[bodyIndex];

  if (
    !Number.isFinite(normalizedContribution) ||
    !Number.isFinite(current)
  ) {
    workspace.localPotentials[bodyIndex] = Number.POSITIVE_INFINITY;
    workspace.localPotentialCompensations[bodyIndex] = 0;
    return;
  }

  const correctedContribution =
    normalizedContribution -
    workspace.localPotentialCompensations[bodyIndex];
  const next = current + correctedContribution;

  if (!Number.isFinite(next)) {
    workspace.localPotentials[bodyIndex] = Number.POSITIVE_INFINITY;
    workspace.localPotentialCompensations[bodyIndex] = 0;
    return;
  }

  workspace.localPotentialCompensations[bodyIndex] =
    (next - current) - correctedContribution;
  workspace.localPotentials[bodyIndex] = next;
}

function assertCompatibleBuffers(
  massesKg: Float64Array,
  physicalRadiiM: Float64Array,
  fixed: Uint8Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array,
  workspace: NewtonianValidityWorkspace
): void {
  const bodyCount = workspace.bodyCount;
  const vectorLength = bodyCount * 3;

  if (
    massesKg.length !== bodyCount ||
    physicalRadiiM.length !== bodyCount ||
    fixed.length !== bodyCount ||
    positionsM.length !== vectorLength ||
    velocitiesMps.length !== vectorLength ||
    workspace.localPotentials.length !== bodyCount ||
    workspace.localPotentialCompensations.length !== bodyCount ||
    workspace.unknownSelfCompactness.length !== bodyCount
  ) {
    throw new RangeError(
      "Newtonian-validity buffers describe different body counts."
    );
  }
}

export function classifyBeta(value: number): NewtonianValidityLevel {
  if (!Number.isFinite(value) || value < 0) {
    return "hard-error";
  }

  if (value >= BETA_HARD_ERROR_THRESHOLD) {
    return "hard-error";
  }

  if (value >= BETA_STRONG_WARNING_THRESHOLD) {
    return "strong-warning";
  }

  if (value >= BETA_CAUTION_THRESHOLD) {
    return "caution";
  }

  return "recommended";
}

export function classifyWeakField(value: number): NewtonianValidityLevel {
  if (!Number.isFinite(value) || value < 0) {
    return "hard-error";
  }

  if (value >= WEAK_FIELD_HARD_ERROR_THRESHOLD) {
    return "hard-error";
  }

  if (value >= WEAK_FIELD_STRONG_WARNING_THRESHOLD) {
    return "strong-warning";
  }

  if (value >= WEAK_FIELD_CAUTION_THRESHOLD) {
    return "caution";
  }

  return "recommended";
}

export function createNewtonianValidityWorkspace(
  bodyCount: number
): NewtonianValidityWorkspace {
  if (!Number.isInteger(bodyCount) || bodyCount < 1) {
    throw new RangeError(
      "A Newtonian-validity workspace needs a positive integer body count."
    );
  }

  return {
    bodyCount,
    localPotentials: new Float64Array(bodyCount),
    localPotentialCompensations: new Float64Array(bodyCount),
    unknownSelfCompactness: new Uint8Array(bodyCount),
    hasExternalConstraint: false,
    maximumBeta: 0,
    betaResponsibleKind: 0,
    betaFirstBodyIndex: 0,
    betaSecondBodyIndex: -1,
    hasPairCompactness: false,
    maximumPairCompactness: 0,
    pairCompactnessFirstBodyIndex: -1,
    pairCompactnessSecondBodyIndex: -1,
    hasKnownSelfCompactness: false,
    maximumSelfCompactness: 0,
    selfCompactnessBodyIndex: -1,
    unknownSelfCompactnessCount: 0,
    maximumLocalPotential: 0,
    localPotentialBodyIndex: 0,
  };
}

export function evaluateNewtonianValidityInto(
  massesKg: Float64Array,
  physicalRadiiM: Float64Array,
  fixed: Uint8Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array,
  workspace: NewtonianValidityWorkspace
): void {
  assertCompatibleBuffers(
    massesKg,
    physicalRadiiM,
    fixed,
    positionsM,
    velocitiesMps,
    workspace
  );

  const bodyCount = workspace.bodyCount;
  workspace.localPotentials.fill(0);
  workspace.localPotentialCompensations.fill(0);
  workspace.unknownSelfCompactness.fill(0);
  workspace.hasExternalConstraint = false;
  workspace.maximumBeta = 0;
  workspace.betaResponsibleKind = 0;
  workspace.betaFirstBodyIndex = 0;
  workspace.betaSecondBodyIndex = -1;
  workspace.hasPairCompactness = false;
  workspace.maximumPairCompactness = 0;
  workspace.pairCompactnessFirstBodyIndex = -1;
  workspace.pairCompactnessSecondBodyIndex = -1;
  workspace.hasKnownSelfCompactness = false;
  workspace.maximumSelfCompactness = 0;
  workspace.selfCompactnessBodyIndex = -1;
  workspace.unknownSelfCompactnessCount = 0;
  workspace.maximumLocalPotential = 0;
  workspace.localPotentialBodyIndex = 0;

  let totalMassKg = 0;

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    totalMassKg += massesKg[bodyIndex];
    workspace.hasExternalConstraint ||=
      fixed[bodyIndex] === 1;
  }

  if (!Number.isFinite(totalMassKg) || totalMassKg <= 0) {
    throw new RangeError(
      "Newtonian-validity evaluation requires a positive finite total mass."
    );
  }

  let frameVelocityX = 0;
  let frameVelocityY = 0;
  let frameVelocityZ = 0;

  if (!workspace.hasExternalConstraint) {
    for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
      const offset = bodyIndex * 3;
      const massFraction = massesKg[bodyIndex] / totalMassKg;
      frameVelocityX += massFraction * velocitiesMps[offset];
      frameVelocityY += massFraction * velocitiesMps[offset + 1];
      frameVelocityZ += massFraction * velocitiesMps[offset + 2];
    }
  }

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    const offset = bodyIndex * 3;
    const velocityX = velocitiesMps[offset] - frameVelocityX;
    const velocityY = velocitiesMps[offset + 1] - frameVelocityY;
    const velocityZ = velocitiesMps[offset + 2] - frameVelocityZ;
    const beta = normalizeMetric(
      Math.hypot(velocityX, velocityY, velocityZ) /
        SPEED_OF_LIGHT_MPS
    );

    if (beta > workspace.maximumBeta) {
      workspace.maximumBeta = beta;
      workspace.betaResponsibleKind = 0;
      workspace.betaFirstBodyIndex = bodyIndex;
      workspace.betaSecondBodyIndex = -1;
    }

    const radiusM = physicalRadiiM[bodyIndex];

    if (radiusM === 0) {
      workspace.unknownSelfCompactness[bodyIndex] = 1;
      workspace.unknownSelfCompactnessCount += 1;
      continue;
    }

    const selfCompactness = normalizeMetric(
      (GRAVITATIONAL_LENGTH_PER_KILOGRAM_M *
        massesKg[bodyIndex]) /
        radiusM
    );

    if (
      !workspace.hasKnownSelfCompactness ||
      selfCompactness > workspace.maximumSelfCompactness
    ) {
      workspace.hasKnownSelfCompactness = true;
      workspace.maximumSelfCompactness = selfCompactness;
      workspace.selfCompactnessBodyIndex = bodyIndex;
    }
  }

  for (let firstIndex = 0; firstIndex < bodyCount; firstIndex += 1) {
    const firstOffset = firstIndex * 3;

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < bodyCount;
      secondIndex += 1
    ) {
      const secondOffset = secondIndex * 3;
      const relativeVelocityX =
        velocitiesMps[secondOffset] - velocitiesMps[firstOffset];
      const relativeVelocityY =
        velocitiesMps[secondOffset + 1] -
        velocitiesMps[firstOffset + 1];
      const relativeVelocityZ =
        velocitiesMps[secondOffset + 2] -
        velocitiesMps[firstOffset + 2];
      const relativeBeta = normalizeMetric(
        Math.hypot(
          relativeVelocityX,
          relativeVelocityY,
          relativeVelocityZ
        ) / SPEED_OF_LIGHT_MPS
      );

      if (relativeBeta > workspace.maximumBeta) {
        workspace.maximumBeta = relativeBeta;
        workspace.betaResponsibleKind = 1;
        workspace.betaFirstBodyIndex = firstIndex;
        workspace.betaSecondBodyIndex = secondIndex;
      }

      const separationX =
        positionsM[secondOffset] - positionsM[firstOffset];
      const separationY =
        positionsM[secondOffset + 1] -
        positionsM[firstOffset + 1];
      const separationZ =
        positionsM[secondOffset + 2] -
        positionsM[firstOffset + 2];
      const separationM = Math.hypot(
        separationX,
        separationY,
        separationZ
      );
      const validSeparation =
        Number.isFinite(separationM) && separationM > 0;
      const pairCompactness = validSeparation
        ? normalizeMetric(
            (GRAVITATIONAL_LENGTH_PER_KILOGRAM_M *
              (massesKg[firstIndex] + massesKg[secondIndex])) /
              separationM
          )
        : Number.POSITIVE_INFINITY;

      if (
        !workspace.hasPairCompactness ||
        pairCompactness > workspace.maximumPairCompactness
      ) {
        workspace.hasPairCompactness = true;
        workspace.maximumPairCompactness = pairCompactness;
        workspace.pairCompactnessFirstBodyIndex = firstIndex;
        workspace.pairCompactnessSecondBodyIndex = secondIndex;
      }

      const firstPotentialContribution = validSeparation
        ? (GRAVITATIONAL_LENGTH_PER_KILOGRAM_M *
            massesKg[secondIndex]) /
          separationM
        : Number.POSITIVE_INFINITY;
      const secondPotentialContribution = validSeparation
        ? (GRAVITATIONAL_LENGTH_PER_KILOGRAM_M *
            massesKg[firstIndex]) /
          separationM
        : Number.POSITIVE_INFINITY;

      addLocalPotential(
        workspace,
        firstIndex,
        firstPotentialContribution
      );
      addLocalPotential(
        workspace,
        secondIndex,
        secondPotentialContribution
      );
    }
  }

  workspace.maximumLocalPotential = normalizeMetric(
    workspace.localPotentials[0]
  );

  for (let bodyIndex = 1; bodyIndex < bodyCount; bodyIndex += 1) {
    const localPotential = normalizeMetric(
      workspace.localPotentials[bodyIndex]
    );

    if (localPotential > workspace.maximumLocalPotential) {
      workspace.maximumLocalPotential = localPotential;
      workspace.localPotentialBodyIndex = bodyIndex;
    }
  }
}

export function hasNewtonianDomainViolation(
  workspace: NewtonianValidityWorkspace
): boolean {
  return (
    classifyBeta(workspace.maximumBeta) === "hard-error" ||
    (workspace.hasPairCompactness &&
      classifyWeakField(workspace.maximumPairCompactness) ===
        "hard-error") ||
    (workspace.hasKnownSelfCompactness &&
      classifyWeakField(workspace.maximumSelfCompactness) ===
        "hard-error") ||
    classifyWeakField(workspace.maximumLocalPotential) === "hard-error"
  );
}

export function materializeNewtonianValidityReport(
  bodyIds: readonly string[],
  workspace: NewtonianValidityWorkspace
): NewtonianValidityReport {
  if (bodyIds.length !== workspace.bodyCount) {
    throw new RangeError(
      "Body identifiers do not match the Newtonian-validity workspace."
    );
  }

  const velocityFrame: NewtonianVelocityFrame =
    workspace.hasExternalConstraint ? "scenario" : "barycentric";
  const betaLevel = classifyBeta(workspace.maximumBeta);
  const betaResponsible: NewtonianBetaResponsible =
    workspace.betaResponsibleKind === 0
      ? Object.freeze({
          kind: "body",
          bodyId: bodyIds[workspace.betaFirstBodyIndex],
          frame: velocityFrame,
        })
      : Object.freeze({
          kind: "pair",
          firstBodyId: bodyIds[workspace.betaFirstBodyIndex],
          secondBodyId: bodyIds[workspace.betaSecondBodyIndex],
          frame: "relative",
        });
  const beta: NewtonianValidityMeasurement<NewtonianBetaResponsible> =
    Object.freeze({
    value: workspace.maximumBeta,
    level: betaLevel,
    responsible: betaResponsible,
  });
  const chiPair: NewtonianValidityMeasurement<NewtonianPairResponsible> | null =
    workspace.hasPairCompactness
      ? Object.freeze({
          value: workspace.maximumPairCompactness,
          level: classifyWeakField(
            workspace.maximumPairCompactness
          ),
          responsible: Object.freeze({
            kind: "pair",
            firstBodyId:
              bodyIds[workspace.pairCompactnessFirstBodyIndex],
            secondBodyId:
              bodyIds[workspace.pairCompactnessSecondBodyIndex],
          }),
        })
      : null;
  const chiSelf: NewtonianValidityMeasurement<NewtonianBodyResponsible> | null =
    workspace.hasKnownSelfCompactness
      ? Object.freeze({
          value: workspace.maximumSelfCompactness,
          level: classifyWeakField(
            workspace.maximumSelfCompactness
          ),
          responsible: Object.freeze({
            kind: "body",
            bodyId: bodyIds[workspace.selfCompactnessBodyIndex],
          }),
        })
      : null;
  const unknownSelfCompactnessBodyIds: string[] = [];

  for (
    let bodyIndex = 0;
    bodyIndex < workspace.bodyCount;
    bodyIndex += 1
  ) {
    if (workspace.unknownSelfCompactness[bodyIndex] === 1) {
      unknownSelfCompactnessBodyIds.push(bodyIds[bodyIndex]);
    }
  }

  const psi: NewtonianValidityMeasurement<NewtonianBodyResponsible> =
    Object.freeze({
      value: workspace.maximumLocalPotential,
      level: classifyWeakField(workspace.maximumLocalPotential),
      responsible: Object.freeze({
        kind: "body",
        bodyId: bodyIds[workspace.localPotentialBodyIndex],
      }),
    });
  let overallLevel = beta.level;

  if (chiPair !== null) {
    overallLevel = worseLevel(overallLevel, chiPair.level);
  }

  if (chiSelf !== null) {
    overallLevel = worseLevel(overallLevel, chiSelf.level);
  }

  overallLevel = worseLevel(overallLevel, psi.level);

  return Object.freeze({
    velocityFrame,
    hasExternalConstraint: workspace.hasExternalConstraint,
    beta,
    chiPair,
    chiSelf,
    unknownSelfCompactnessBodyIds: Object.freeze(
      unknownSelfCompactnessBodyIds
    ),
    psi,
    overallLevel,
  });
}
