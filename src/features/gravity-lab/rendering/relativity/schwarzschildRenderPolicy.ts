import {
  schwarzschildIscoRadiusM,
  schwarzschildPhotonSphereRadiusM,
  schwarzschildRadiusM,
} from "../../physics/schwarzschildMetric";

export type SchwarzschildRenderPolicy = Readonly<{
  sceneUnitsPerSchwarzschildRadius: number;
  embeddingVerticalAmplification: number;
  embeddingInnerRadiusRatio: number;
  embeddingOuterRadiusRatio: number;
  embeddingRadialSegments: number;
  embeddingAngularSegments: number;
}>;

export const DEFAULT_SCHWARZSCHILD_RENDER_POLICY = Object.freeze({
  sceneUnitsPerSchwarzschildRadius: 1,
  embeddingVerticalAmplification: 1.35,
  embeddingInnerRadiusRatio: 1.001,
  embeddingOuterRadiusRatio: 8,
  embeddingRadialSegments: 48,
  embeddingAngularSegments: 96,
}) satisfies SchwarzschildRenderPolicy;

export type SchwarzschildCharacteristicRadii = Readonly<{
  schwarzschildRadiusM: number;
  photonSphereRadiusM: number;
  iscoRadiusM: number;
  horizonSceneRadius: number;
  photonSphereSceneRadius: number;
  iscoSceneRadius: number;
}>;

export type SchwarzschildCoordinatePoint = Readonly<{
  radiusM: number;
  polarAngleRad: number;
  azimuthalAngleRad: number;
}>;

export type SchwarzschildScenePoint = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type FlammEmbeddingMeshData = Readonly<{
  positions: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  minimumRadiusScene: number;
  maximumRadiusScene: number;
  maximumPhysicalEmbeddingHeightM: number;
  maximumRenderedEmbeddingHeightScene: number;
}>;

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and strictly positive.`);
  }
}

function assertRenderPolicy(policy: SchwarzschildRenderPolicy): void {
  assertFinitePositive(
    policy.sceneUnitsPerSchwarzschildRadius,
    "Schwarzschild scene scale"
  );
  assertFinitePositive(
    policy.embeddingVerticalAmplification,
    "Flamm visual amplification"
  );

  if (
    !Number.isFinite(policy.embeddingInnerRadiusRatio) ||
    policy.embeddingInnerRadiusRatio < 1 ||
    !Number.isFinite(policy.embeddingOuterRadiusRatio) ||
    policy.embeddingOuterRadiusRatio <= policy.embeddingInnerRadiusRatio
  ) {
    throw new RangeError(
      "Flamm radial bounds must be finite with 1 <= inner < outer."
    );
  }

  for (const [value, label] of [
    [policy.embeddingRadialSegments, "Flamm radial segments"],
    [policy.embeddingAngularSegments, "Flamm angular segments"],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 3) {
      throw new RangeError(`${label} must be a safe integer of at least 3.`);
    }
  }
}

/** Exact Flamm height on one branch of the equatorial t=constant slice. */
export function flammEmbeddingHeightM(
  schwarzschildRadiusMValue: number,
  arealRadiusM: number
): number {
  assertFinitePositive(
    schwarzschildRadiusMValue,
    "Flamm Schwarzschild radius"
  );

  if (
    !Number.isFinite(arealRadiusM) ||
    arealRadiusM < schwarzschildRadiusMValue
  ) {
    throw new RangeError(
      "Flamm areal radius must be finite and no smaller than r_s."
    );
  }

  const heightM = 2 * Math.sqrt(
    schwarzschildRadiusMValue *
      (arealRadiusM - schwarzschildRadiusMValue)
  );

  if (!Number.isFinite(heightM) || heightM < 0) {
    throw new RangeError("Flamm embedding height must remain finite.");
  }

  return heightM;
}

/** Visual-only mapping. The amplification never feeds physical calculations. */
export function mapFlammHeightToScene(
  physicalHeightM: number,
  schwarzschildRadiusMValue: number,
  policy: SchwarzschildRenderPolicy = DEFAULT_SCHWARZSCHILD_RENDER_POLICY
): number {
  assertRenderPolicy(policy);

  if (!Number.isFinite(physicalHeightM) || physicalHeightM < 0) {
    throw new RangeError(
      "Physical Flamm height must be finite and non-negative."
    );
  }

  assertFinitePositive(
    schwarzschildRadiusMValue,
    "Schwarzschild radius"
  );
  const sceneHeight =
    (physicalHeightM / schwarzschildRadiusMValue) *
    policy.sceneUnitsPerSchwarzschildRadius *
    policy.embeddingVerticalAmplification;

  if (!Number.isFinite(sceneHeight) || sceneHeight < 0) {
    throw new RangeError("Rendered Flamm height must remain finite.");
  }

  return sceneHeight;
}

export function projectSchwarzschildRadiusToScene(
  radiusM: number,
  schwarzschildRadiusMValue: number,
  policy: SchwarzschildRenderPolicy = DEFAULT_SCHWARZSCHILD_RENDER_POLICY
): number {
  assertRenderPolicy(policy);
  assertFinitePositive(radiusM, "Schwarzschild areal radius");
  assertFinitePositive(
    schwarzschildRadiusMValue,
    "Schwarzschild radius"
  );
  const sceneRadius =
    (radiusM / schwarzschildRadiusMValue) *
    policy.sceneUnitsPerSchwarzschildRadius;

  if (!Number.isFinite(sceneRadius) || sceneRadius <= 0) {
    throw new RangeError("Projected Schwarzschild radius must remain finite.");
  }

  return sceneRadius;
}

export function projectSchwarzschildCharacteristicRadii(
  centralMassKg: number,
  policy: SchwarzschildRenderPolicy = DEFAULT_SCHWARZSCHILD_RENDER_POLICY
): SchwarzschildCharacteristicRadii {
  const horizonRadiusM = schwarzschildRadiusM(centralMassKg);
  const photonSphereRadiusM =
    schwarzschildPhotonSphereRadiusM(centralMassKg);
  const iscoRadiusM = schwarzschildIscoRadiusM(centralMassKg);

  return Object.freeze({
    schwarzschildRadiusM: horizonRadiusM,
    photonSphereRadiusM,
    iscoRadiusM,
    horizonSceneRadius: projectSchwarzschildRadiusToScene(
      horizonRadiusM,
      horizonRadiusM,
      policy
    ),
    photonSphereSceneRadius: projectSchwarzschildRadiusToScene(
      photonSphereRadiusM,
      horizonRadiusM,
      policy
    ),
    iscoSceneRadius: projectSchwarzschildRadiusToScene(
      iscoRadiusM,
      horizonRadiusM,
      policy
    ),
  });
}

/**
 * Projects a Schwarzschild-coordinate point onto the rendered equatorial
 * Flamm slice. The physical embedding height is evaluated before its purely
 * graphical amplification.
 */
export function projectSchwarzschildPointToFlammScene(
  point: SchwarzschildCoordinatePoint,
  schwarzschildRadiusMValue: number,
  policy: SchwarzschildRenderPolicy = DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
  verticalOffsetScene = 0
): SchwarzschildScenePoint {
  if (
    !Number.isFinite(point.polarAngleRad) ||
    !Number.isFinite(point.azimuthalAngleRad) ||
    !Number.isFinite(verticalOffsetScene)
  ) {
    throw new RangeError("Schwarzschild point angles and offset must be finite.");
  }

  const radialScene = projectSchwarzschildRadiusToScene(
    point.radiusM,
    schwarzschildRadiusMValue,
    policy
  );
  const physicalHeightM = flammEmbeddingHeightM(
    schwarzschildRadiusMValue,
    point.radiusM
  );
  const embeddingHeightScene = mapFlammHeightToScene(
    physicalHeightM,
    schwarzschildRadiusMValue,
    policy
  );
  const sinPolar = Math.sin(point.polarAngleRad);
  const x = radialScene * sinPolar * Math.cos(point.azimuthalAngleRad);
  const z = radialScene * sinPolar * Math.sin(point.azimuthalAngleRad);
  const y = embeddingHeightScene + verticalOffsetScene;

  if (![x, y, z].every(Number.isFinite)) {
    throw new RangeError("Projected Schwarzschild point must remain finite.");
  }

  return Object.freeze({ x, y, z });
}

export function projectSchwarzschildTrajectoryToScene(
  trajectory: readonly SchwarzschildCoordinatePoint[],
  schwarzschildRadiusMValue: number,
  policy: SchwarzschildRenderPolicy = DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
  verticalOffsetScene = 0
): Float32Array {
  if (trajectory.length < 2) {
    throw new RangeError(
      "A rendered Schwarzschild trajectory requires at least two points."
    );
  }

  const positions = new Float32Array(trajectory.length * 3);

  for (const [index, point] of trajectory.entries()) {
    const projected = projectSchwarzschildPointToFlammScene(
      point,
      schwarzschildRadiusMValue,
      policy,
      verticalOffsetScene
    );
    const offset = index * 3;
    positions[offset] = projected.x;
    positions[offset + 1] = projected.y;
    positions[offset + 2] = projected.z;
  }

  return positions;
}

export function createFlammEmbeddingMeshData(
  schwarzschildRadiusMValue: number,
  policy: SchwarzschildRenderPolicy = DEFAULT_SCHWARZSCHILD_RENDER_POLICY
): FlammEmbeddingMeshData {
  assertRenderPolicy(policy);
  assertFinitePositive(
    schwarzschildRadiusMValue,
    "Flamm Schwarzschild radius"
  );
  const radialCoordinateCount = policy.embeddingRadialSegments + 1;
  const angularCoordinateCount = policy.embeddingAngularSegments + 1;
  const vertexCount = radialCoordinateCount * angularCoordinateCount;
  const triangleCount =
    policy.embeddingRadialSegments *
    policy.embeddingAngularSegments *
    2;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(triangleCount * 3);
  let positionOffset = 0;

  for (
    let radialIndex = 0;
    radialIndex < radialCoordinateCount;
    radialIndex += 1
  ) {
    const interpolation = radialIndex / policy.embeddingRadialSegments;
    const radiusRatio =
      policy.embeddingInnerRadiusRatio +
      (policy.embeddingOuterRadiusRatio -
        policy.embeddingInnerRadiusRatio) *
        interpolation;
    const radiusM = radiusRatio * schwarzschildRadiusMValue;
    const physicalHeightM = flammEmbeddingHeightM(
      schwarzschildRadiusMValue,
      radiusM
    );
    const radiusScene = projectSchwarzschildRadiusToScene(
      radiusM,
      schwarzschildRadiusMValue,
      policy
    );
    const heightScene = mapFlammHeightToScene(
      physicalHeightM,
      schwarzschildRadiusMValue,
      policy
    );

    for (
      let angularIndex = 0;
      angularIndex < angularCoordinateCount;
      angularIndex += 1
    ) {
      const angle =
        (angularIndex / policy.embeddingAngularSegments) * 2 * Math.PI;
      positions[positionOffset] = radiusScene * Math.cos(angle);
      positions[positionOffset + 1] = heightScene;
      positions[positionOffset + 2] = radiusScene * Math.sin(angle);
      positionOffset += 3;
    }
  }

  let indexOffset = 0;

  for (
    let radialIndex = 0;
    radialIndex < policy.embeddingRadialSegments;
    radialIndex += 1
  ) {
    for (
      let angularIndex = 0;
      angularIndex < policy.embeddingAngularSegments;
      angularIndex += 1
    ) {
      const lowerLeft =
        radialIndex * angularCoordinateCount + angularIndex;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + angularCoordinateCount;
      const upperRight = upperLeft + 1;
      indices[indexOffset] = lowerLeft;
      indices[indexOffset + 1] = upperLeft;
      indices[indexOffset + 2] = lowerRight;
      indices[indexOffset + 3] = lowerRight;
      indices[indexOffset + 4] = upperLeft;
      indices[indexOffset + 5] = upperRight;
      indexOffset += 6;
    }
  }

  const maximumRadiusM =
    policy.embeddingOuterRadiusRatio * schwarzschildRadiusMValue;
  const maximumPhysicalEmbeddingHeightM = flammEmbeddingHeightM(
    schwarzschildRadiusMValue,
    maximumRadiusM
  );

  if (Array.from(positions).some((value) => !Number.isFinite(value))) {
    throw new RangeError("Flamm mesh positions must all remain finite.");
  }

  return Object.freeze({
    positions,
    indices,
    vertexCount,
    triangleCount,
    minimumRadiusScene:
      policy.embeddingInnerRadiusRatio *
      policy.sceneUnitsPerSchwarzschildRadius,
    maximumRadiusScene:
      policy.embeddingOuterRadiusRatio *
      policy.sceneUnitsPerSchwarzschildRadius,
    maximumPhysicalEmbeddingHeightM,
    maximumRenderedEmbeddingHeightScene: mapFlammHeightToScene(
      maximumPhysicalEmbeddingHeightM,
      schwarzschildRadiusMValue,
      policy
    ),
  });
}
