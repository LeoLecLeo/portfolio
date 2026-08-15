import { MAX_NEWTONIAN_BODIES } from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";
import type { RenderedCameraPoint } from "./cameraFraming";
import type { PotentialGridBounds } from "./gravityPotentialGridPolicy";

export const GRAVITY_FIELD_TARGET_SPACING_SCENE = 1;
export const GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS = 7;
export const GRAVITY_FIELD_MAX_SAMPLES_PER_AXIS = 15;
export const GRAVITY_FIELD_MAX_VECTOR_COUNT = 3_375;
export const GRAVITY_FIELD_VERTICES_PER_VECTOR = 10;
export const GRAVITY_FIELD_MAX_VERTEX_COUNT =
  GRAVITY_FIELD_MAX_VECTOR_COUNT * GRAVITY_FIELD_VERTICES_PER_VECTOR;
export const GRAVITY_FIELD_VISUAL_SOFTENING_SCENE = 0.4;
export const GRAVITY_FIELD_INTENSITY_COMPRESSION = 0.4;
export const GRAVITY_FIELD_MIN_LENGTH_SCENE = 0.14;
export const GRAVITY_FIELD_MAX_LENGTH_SCENE = 0.68;

export type GravityFieldBody = Readonly<{
  massKg: number;
  position: RenderedCameraPoint;
}>;

export type VisualGravityVector = Readonly<{
  field: RenderedCameraPoint;
  direction: RenderedCameraPoint;
  regularizedMagnitude: number;
  relativeIntensity: number;
  lengthScene: number;
}>;

export type GravityFieldSampleCounts = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type GravityFieldSampling = Readonly<{
  counts: GravityFieldSampleCounts;
  spacing: Readonly<{ x: number; y: number; z: number }>;
  vectorCount: number;
}>;

function assertFinitePoint(point: RenderedCameraPoint, label: string): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  ) {
    throw new RangeError(`${label} must contain finite coordinates.`);
  }
}

function assertBodies(bodies: readonly GravityFieldBody[]): void {
  if (bodies.length < 1 || bodies.length > MAX_NEWTONIAN_BODIES) {
    throw new RangeError(
      `Gravity field visualization requires between 1 and ${MAX_NEWTONIAN_BODIES} bodies.`
    );
  }

  for (const [index, body] of bodies.entries()) {
    if (!Number.isFinite(body.massKg) || body.massKg <= 0) {
      throw new RangeError(`Body ${index} must have a finite positive mass.`);
    }

    assertFinitePoint(body.position, `Body ${index} position`);
  }
}

function assertSoftening(softening: number): void {
  if (!Number.isFinite(softening) || softening <= 0) {
    throw new RangeError(
      "Visual gravity field softening must be finite and strictly positive."
    );
  }
}

function fieldComponents(
  bodies: readonly GravityFieldBody[],
  samplePosition: RenderedCameraPoint,
  softening: number,
  massScale: number
): RenderedCameraPoint {
  let x = 0;
  let y = 0;
  let z = 0;

  for (const body of bodies) {
    const deltaX = body.position.x - samplePosition.x;
    const deltaY = body.position.y - samplePosition.y;
    const deltaZ = body.position.z - samplePosition.z;
    const regularizedSquaredDistance =
      deltaX ** 2 + deltaY ** 2 + deltaZ ** 2 + softening ** 2;
    const inverseRegularizedCube = regularizedSquaredDistance ** -1.5;
    const strength = body.massKg * massScale * inverseRegularizedCube;
    x += deltaX * strength;
    y += deltaY * strength;
    z += deltaZ * strength;
  }

  const field = { x, y, z };
  assertFinitePoint(field, "Regularized gravity field");
  return field;
}

export function calculateRegularizedGravityField(
  bodies: readonly GravityFieldBody[],
  samplePosition: RenderedCameraPoint,
  softening = GRAVITY_FIELD_VISUAL_SOFTENING_SCENE
): RenderedCameraPoint {
  assertBodies(bodies);
  assertFinitePoint(samplePosition, "Gravity field sample position");
  assertSoftening(softening);

  return Object.freeze(
    fieldComponents(
      bodies,
      samplePosition,
      softening,
      GRAVITATIONAL_CONSTANT_M3_KG_S2
    )
  );
}

export function calculateVisualGravityVector(
  bodies: readonly GravityFieldBody[],
  samplePosition: RenderedCameraPoint,
  softening = GRAVITY_FIELD_VISUAL_SOFTENING_SCENE
): VisualGravityVector {
  assertBodies(bodies);
  assertFinitePoint(samplePosition, "Gravity field sample position");
  assertSoftening(softening);
  let maximumMassKg = 0;

  for (const body of bodies) {
    maximumMassKg = Math.max(maximumMassKg, body.massKg);
  }

  const physicalField = fieldComponents(
    bodies,
    samplePosition,
    softening,
    GRAVITATIONAL_CONSTANT_M3_KG_S2
  );
  const normalizedField = fieldComponents(
    bodies,
    samplePosition,
    softening,
    1 / maximumMassKg
  );
  const regularizedMagnitude = Math.hypot(
    physicalField.x,
    physicalField.y,
    physicalField.z
  );
  const normalizedMagnitude = Math.hypot(
    normalizedField.x,
    normalizedField.y,
    normalizedField.z
  );

  if (normalizedMagnitude === 0 || regularizedMagnitude === 0) {
    return Object.freeze({
      field: Object.freeze(physicalField),
      direction: Object.freeze({ x: 0, y: 0, z: 0 }),
      regularizedMagnitude,
      relativeIntensity: 0,
      lengthScene: 0,
    });
  }

  const relativeIntensity = Math.min(
    1,
    Math.max(
      0,
      -Math.expm1(
        -GRAVITY_FIELD_INTENSITY_COMPRESSION * normalizedMagnitude
      )
    )
  );
  const lengthScene = Math.min(
    GRAVITY_FIELD_MAX_LENGTH_SCENE,
    Math.max(
      GRAVITY_FIELD_MIN_LENGTH_SCENE,
      GRAVITY_FIELD_MIN_LENGTH_SCENE +
        (GRAVITY_FIELD_MAX_LENGTH_SCENE -
          GRAVITY_FIELD_MIN_LENGTH_SCENE) *
          relativeIntensity
    )
  );

  return Object.freeze({
    field: Object.freeze(physicalField),
    direction: Object.freeze({
      x: normalizedField.x / normalizedMagnitude,
      y: normalizedField.y / normalizedMagnitude,
      z: normalizedField.z / normalizedMagnitude,
    }),
    regularizedMagnitude,
    relativeIntensity,
    lengthScene,
  });
}

function gravityFieldExtents(bounds: PotentialGridBounds) {
  assertFinitePoint(bounds.minimum, "Field sample minimum");
  assertFinitePoint(bounds.maximum, "Field sample maximum");
  const extents = {
    x: bounds.maximum.x - bounds.minimum.x,
    y: bounds.maximum.y - bounds.minimum.y,
    z: bounds.maximum.z - bounds.minimum.z,
  };

  if (Object.values(extents).some((extent) => !Number.isFinite(extent) || extent <= 0)) {
    throw new RangeError(
      "Gravity field extents must be finite and strictly positive."
    );
  }

  return extents;
}

function sampleCountForExtent(extent: number): number {
  return Math.min(
    GRAVITY_FIELD_MAX_SAMPLES_PER_AXIS,
    Math.max(
      GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS,
      Math.ceil(extent / GRAVITY_FIELD_TARGET_SPACING_SCENE) + 1
    )
  );
}

function vectorCount(counts: GravityFieldSampleCounts): number {
  return counts.x * counts.y * counts.z;
}

function assertSampleCounts(counts: GravityFieldSampleCounts): void {
  for (const count of Object.values(counts)) {
    if (
      !Number.isSafeInteger(count) ||
      count < GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS ||
      count > GRAVITY_FIELD_MAX_SAMPLES_PER_AXIS
    ) {
      throw new RangeError(
        `Gravity field sample counts must be safe integers between ${GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS} and ${GRAVITY_FIELD_MAX_SAMPLES_PER_AXIS}.`
      );
    }
  }

  if (vectorCount(counts) > GRAVITY_FIELD_MAX_VECTOR_COUNT) {
    throw new RangeError(
      `Gravity field samples must not exceed ${GRAVITY_FIELD_MAX_VECTOR_COUNT} vectors.`
    );
  }
}

export function calculateGravityFieldSampling(
  bounds: PotentialGridBounds
): GravityFieldSampling {
  const extents = gravityFieldExtents(bounds);
  const counts = {
    x: sampleCountForExtent(extents.x),
    y: sampleCountForExtent(extents.y),
    z: sampleCountForExtent(extents.z),
  };
  const axes = ["x", "y", "z"] as const;

  while (vectorCount(counts) > GRAVITY_FIELD_MAX_VECTOR_COUNT) {
    let selectedAxis: (typeof axes)[number] | null = null;
    let greatestSampleDensity = Number.NEGATIVE_INFINITY;

    for (const axis of axes) {
      if (counts[axis] <= GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS) {
        continue;
      }

      const sampleDensity = (counts[axis] - 1) / extents[axis];

      if (sampleDensity > greatestSampleDensity) {
        selectedAxis = axis;
        greatestSampleDensity = sampleDensity;
      }
    }

    if (selectedAxis === null) {
      throw new RangeError(
        "Gravity field sampling cannot satisfy its global vector budget."
      );
    }

    counts[selectedAxis] -= 1;
  }

  assertSampleCounts(counts);
  const frozenCounts = Object.freeze({ ...counts });

  return Object.freeze({
    counts: frozenCounts,
    spacing: Object.freeze({
      x: extents.x / (counts.x - 1),
      y: extents.y / (counts.y - 1),
      z: extents.z / (counts.z - 1),
    }),
    vectorCount: vectorCount(counts),
  });
}

export function createGravityFieldSamplePositions(
  bounds: PotentialGridBounds,
  counts = calculateGravityFieldSampling(bounds).counts
): Float32Array {
  const extents = gravityFieldExtents(bounds);
  assertSampleCounts(counts);
  const positions = new Float32Array(vectorCount(counts) * 3);
  let offset = 0;

  for (let xIndex = 0; xIndex < counts.x; xIndex += 1) {
    for (let yIndex = 0; yIndex < counts.y; yIndex += 1) {
      for (let zIndex = 0; zIndex < counts.z; zIndex += 1) {
        positions[offset] =
          bounds.minimum.x +
          (extents.x * xIndex) / (counts.x - 1);
        positions[offset + 1] =
          bounds.minimum.y +
          (extents.y * yIndex) / (counts.y - 1);
        positions[offset + 2] =
          bounds.minimum.z +
          (extents.z * zIndex) / (counts.z - 1);
        offset += 3;
      }
    }
  }

  return positions;
}

export function prepareGravityFieldMassWeights(
  massesKg: readonly number[]
): Readonly<{
  bodyCount: number;
  massWeights: Float32Array;
}> {
  if (massesKg.length < 1 || massesKg.length > MAX_NEWTONIAN_BODIES) {
    throw new RangeError(
      `Gravity field uniforms require between 1 and ${MAX_NEWTONIAN_BODIES} masses.`
    );
  }

  let maximumMassKg = 0;

  for (const massKg of massesKg) {
    if (!Number.isFinite(massKg) || massKg <= 0) {
      throw new RangeError(
        "Gravity field uniform masses must be finite and positive."
      );
    }

    maximumMassKg = Math.max(maximumMassKg, massKg);
  }

  const massWeights = new Float32Array(MAX_NEWTONIAN_BODIES);

  for (let index = 0; index < massesKg.length; index += 1) {
    massWeights[index] = massesKg[index] / maximumMassKg;
  }

  return Object.freeze({ bodyCount: massesKg.length, massWeights });
}
