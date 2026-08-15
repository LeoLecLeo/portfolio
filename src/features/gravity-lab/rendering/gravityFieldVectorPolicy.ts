import { MAX_NEWTONIAN_BODIES } from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";
import type { RenderedCameraPoint } from "./cameraFraming";
import type { PotentialGridBounds } from "./gravityPotentialGridPolicy";

export const GRAVITY_FIELD_SAMPLES_PER_AXIS = 5;
export const GRAVITY_FIELD_VECTOR_COUNT = GRAVITY_FIELD_SAMPLES_PER_AXIS ** 3;
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

export function createGravityFieldSamplePositions(
  bounds: PotentialGridBounds,
  samplesPerAxis = GRAVITY_FIELD_SAMPLES_PER_AXIS
): Float32Array {
  assertFinitePoint(bounds.minimum, "Field sample minimum");
  assertFinitePoint(bounds.maximum, "Field sample maximum");

  if (!Number.isSafeInteger(samplesPerAxis) || samplesPerAxis < 2) {
    throw new RangeError(
      "Gravity field samples per axis must be a safe integer of at least two."
    );
  }

  const positions = new Float32Array(samplesPerAxis ** 3 * 3);
  let offset = 0;

  for (let xIndex = 0; xIndex < samplesPerAxis; xIndex += 1) {
    for (let yIndex = 0; yIndex < samplesPerAxis; yIndex += 1) {
      for (let zIndex = 0; zIndex < samplesPerAxis; zIndex += 1) {
        positions[offset] =
          bounds.minimum.x +
          ((bounds.maximum.x - bounds.minimum.x) * xIndex) /
            (samplesPerAxis - 1);
        positions[offset + 1] =
          bounds.minimum.y +
          ((bounds.maximum.y - bounds.minimum.y) * yIndex) /
            (samplesPerAxis - 1);
        positions[offset + 2] =
          bounds.minimum.z +
          ((bounds.maximum.z - bounds.minimum.z) * zIndex) /
            (samplesPerAxis - 1);
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
