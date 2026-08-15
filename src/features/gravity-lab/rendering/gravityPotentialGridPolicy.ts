import { MAX_NEWTONIAN_BODIES } from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";
import type { RenderedCameraPoint } from "./cameraFraming";

export const GRAVITY_GRID_LINES_PER_AXIS = 9;
export const GRAVITY_GRID_POINTS_PER_LINE = 33;
export const GRAVITY_GRID_BOUNDS_MARGIN = 1.65;
export const GRAVITY_GRID_MIN_HALF_EXTENT_SCENE = 3.25;
export const GRAVITY_GRID_MIN_AXIS_FRACTION = 0.55;
export const GRAVITY_GRID_VISUAL_SOFTENING_SCENE = 0.4;
export const GRAVITY_GRID_FIELD_COMPRESSION = 0.35;
export const GRAVITY_GRID_MAX_DISPLACEMENT_SCENE = 0.7;
export const GRAVITY_GRID_MASS_COMPRESSION_EXPONENT = 0.25;
export const GRAVITY_GRID_MIN_MASS_WEIGHT = 0.025;

export type PotentialGridBody = Readonly<{
  massKg: number;
  position: RenderedCameraPoint;
}>;

export type PotentialGridBounds = Readonly<{
  minimum: RenderedCameraPoint;
  maximum: RenderedCameraPoint;
  center: RenderedCameraPoint;
  halfExtents: RenderedCameraPoint;
}>;

export type PotentialGridActivity = Readonly<{
  draw: boolean;
  updateUniforms: boolean;
}>;

const ACTIVE_GRID = Object.freeze({ draw: true, updateUniforms: true });
const INACTIVE_GRID = Object.freeze({ draw: false, updateUniforms: false });

export function resolvePotentialGridActivity(
  visible: boolean
): PotentialGridActivity {
  return visible ? ACTIVE_GRID : INACTIVE_GRID;
}

function assertFinitePoint(point: RenderedCameraPoint, label: string): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  ) {
    throw new RangeError(`${label} must contain finite coordinates.`);
  }
}

function assertBodies(bodies: readonly PotentialGridBody[]): void {
  if (bodies.length < 1 || bodies.length > MAX_NEWTONIAN_BODIES) {
    throw new RangeError(
      `Potential visualization requires between 1 and ${MAX_NEWTONIAN_BODIES} bodies.`
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
      "Visual potential softening must be finite and strictly positive."
    );
  }
}

function visualMassWeight(massKg: number, maximumMassKg: number): number {
  return Math.max(
    GRAVITY_GRID_MIN_MASS_WEIGHT,
    Math.exp(
      GRAVITY_GRID_MASS_COMPRESSION_EXPONENT *
        (Math.log(massKg) - Math.log(maximumMassKg))
    )
  );
}

export function calculatePotentialGridBounds(
  positions: readonly RenderedCameraPoint[]
): PotentialGridBounds {
  if (positions.length < 1 || positions.length > MAX_NEWTONIAN_BODIES) {
    throw new RangeError(
      `Potential grid bounds require between 1 and ${MAX_NEWTONIAN_BODIES} positions.`
    );
  }

  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;

  for (const [index, position] of positions.entries()) {
    assertFinitePoint(position, `Grid bound position ${index}`);
    minimumX = Math.min(minimumX, position.x);
    minimumY = Math.min(minimumY, position.y);
    minimumZ = Math.min(minimumZ, position.z);
    maximumX = Math.max(maximumX, position.x);
    maximumY = Math.max(maximumY, position.y);
    maximumZ = Math.max(maximumZ, position.z);
  }

  const center = {
    x: minimumX * 0.5 + maximumX * 0.5,
    y: minimumY * 0.5 + maximumY * 0.5,
    z: minimumZ * 0.5 + maximumZ * 0.5,
  };
  const rawHalfExtents = {
    x: (maximumX - minimumX) * 0.5,
    y: (maximumY - minimumY) * 0.5,
    z: (maximumZ - minimumZ) * 0.5,
  };
  const largestRawHalfExtent = Math.max(
    rawHalfExtents.x,
    rawHalfExtents.y,
    rawHalfExtents.z
  );
  const minimumAxisHalfExtent = Math.max(
    GRAVITY_GRID_MIN_HALF_EXTENT_SCENE,
    largestRawHalfExtent * GRAVITY_GRID_MIN_AXIS_FRACTION
  );
  const halfExtents = {
    x: Math.max(
      minimumAxisHalfExtent,
      rawHalfExtents.x * GRAVITY_GRID_BOUNDS_MARGIN
    ),
    y: Math.max(
      minimumAxisHalfExtent,
      rawHalfExtents.y * GRAVITY_GRID_BOUNDS_MARGIN
    ),
    z: Math.max(
      minimumAxisHalfExtent,
      rawHalfExtents.z * GRAVITY_GRID_BOUNDS_MARGIN
    ),
  };
  const minimum = {
    x: center.x - halfExtents.x,
    y: center.y - halfExtents.y,
    z: center.z - halfExtents.z,
  };
  const maximum = {
    x: center.x + halfExtents.x,
    y: center.y + halfExtents.y,
    z: center.z + halfExtents.z,
  };

  assertFinitePoint(center, "Potential grid center");
  assertFinitePoint(halfExtents, "Potential grid half extents");
  assertFinitePoint(minimum, "Potential grid minimum");
  assertFinitePoint(maximum, "Potential grid maximum");

  return Object.freeze({
    minimum: Object.freeze(minimum),
    maximum: Object.freeze(maximum),
    center: Object.freeze(center),
    halfExtents: Object.freeze(halfExtents),
  });
}

function axisCoordinate(
  minimum: number,
  maximum: number,
  index: number,
  count: number
) {
  return minimum + ((maximum - minimum) * index) / (count - 1);
}

export function createPotentialGridLinePositions(
  bounds: PotentialGridBounds,
  linesPerAxis = GRAVITY_GRID_LINES_PER_AXIS,
  pointsPerLine = GRAVITY_GRID_POINTS_PER_LINE
): Float32Array {
  assertFinitePoint(bounds.minimum, "Grid minimum");
  assertFinitePoint(bounds.maximum, "Grid maximum");

  if (!Number.isSafeInteger(linesPerAxis) || linesPerAxis < 2) {
    throw new RangeError(
      "Grid lines per axis must be a safe integer of at least two."
    );
  }

  if (!Number.isSafeInteger(pointsPerLine) || pointsPerLine < 2) {
    throw new RangeError(
      "Grid points per line must be a safe integer of at least two."
    );
  }

  const segmentCount = 3 * linesPerAxis ** 2 * (pointsPerLine - 1);
  const positions = new Float32Array(segmentCount * 2 * 3);
  let offset = 0;
  const writePoint = (x: number, y: number, z: number) => {
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    offset += 3;
  };

  for (let first = 0; first < linesPerAxis; first += 1) {
    for (let second = 0; second < linesPerAxis; second += 1) {
      const yForX = axisCoordinate(
        bounds.minimum.y,
        bounds.maximum.y,
        first,
        linesPerAxis
      );
      const zForX = axisCoordinate(
        bounds.minimum.z,
        bounds.maximum.z,
        second,
        linesPerAxis
      );
      const xForY = axisCoordinate(
        bounds.minimum.x,
        bounds.maximum.x,
        first,
        linesPerAxis
      );
      const zForY = axisCoordinate(
        bounds.minimum.z,
        bounds.maximum.z,
        second,
        linesPerAxis
      );
      const xForZ = axisCoordinate(
        bounds.minimum.x,
        bounds.maximum.x,
        first,
        linesPerAxis
      );
      const yForZ = axisCoordinate(
        bounds.minimum.y,
        bounds.maximum.y,
        second,
        linesPerAxis
      );

      for (let point = 0; point < pointsPerLine - 1; point += 1) {
        const x0 = axisCoordinate(
          bounds.minimum.x,
          bounds.maximum.x,
          point,
          pointsPerLine
        );
        const x1 = axisCoordinate(
          bounds.minimum.x,
          bounds.maximum.x,
          point + 1,
          pointsPerLine
        );
        const y0 = axisCoordinate(
          bounds.minimum.y,
          bounds.maximum.y,
          point,
          pointsPerLine
        );
        const y1 = axisCoordinate(
          bounds.minimum.y,
          bounds.maximum.y,
          point + 1,
          pointsPerLine
        );
        const z0 = axisCoordinate(
          bounds.minimum.z,
          bounds.maximum.z,
          point,
          pointsPerLine
        );
        const z1 = axisCoordinate(
          bounds.minimum.z,
          bounds.maximum.z,
          point + 1,
          pointsPerLine
        );

        writePoint(x0, yForX, zForX);
        writePoint(x1, yForX, zForX);
        writePoint(xForY, y0, zForY);
        writePoint(xForY, y1, zForY);
        writePoint(xForZ, yForZ, z0);
        writePoint(xForZ, yForZ, z1);
      }
    }
  }

  return positions;
}

export function calculateRegularizedNewtonianPotential(
  bodies: readonly PotentialGridBody[],
  samplePosition: RenderedCameraPoint,
  softening = GRAVITY_GRID_VISUAL_SOFTENING_SCENE
): number {
  assertBodies(bodies);
  assertFinitePoint(samplePosition, "Potential sample position");
  assertSoftening(softening);
  let potential = 0;

  for (const body of bodies) {
    const distance = Math.sqrt(
      (samplePosition.x - body.position.x) ** 2 +
        (samplePosition.y - body.position.y) ** 2 +
        (samplePosition.z - body.position.z) ** 2 +
        softening ** 2
    );
    potential -=
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 * body.massKg) / distance;
  }

  if (!Number.isFinite(potential)) {
    throw new RangeError("Regularized visual potential must remain finite.");
  }

  return potential;
}

export function calculateVisualFieldDisplacement(
  bodies: readonly PotentialGridBody[],
  samplePosition: RenderedCameraPoint,
  softening = GRAVITY_GRID_VISUAL_SOFTENING_SCENE
): RenderedCameraPoint {
  assertBodies(bodies);
  assertFinitePoint(samplePosition, "Field sample position");
  assertSoftening(softening);
  let maximumMassKg = 0;

  for (const body of bodies) {
    maximumMassKg = Math.max(maximumMassKg, body.massKg);
  }

  let fieldX = 0;
  let fieldY = 0;
  let fieldZ = 0;

  for (const body of bodies) {
    const deltaX = body.position.x - samplePosition.x;
    const deltaY = body.position.y - samplePosition.y;
    const deltaZ = body.position.z - samplePosition.z;
    const regularizedSquaredDistance =
      deltaX ** 2 + deltaY ** 2 + deltaZ ** 2 + softening ** 2;
    const inverseRegularizedCube = regularizedSquaredDistance ** -1.5;
    const strength =
      visualMassWeight(body.massKg, maximumMassKg) * inverseRegularizedCube;
    fieldX += deltaX * strength;
    fieldY += deltaY * strength;
    fieldZ += deltaZ * strength;
  }

  const fieldMagnitude = Math.hypot(fieldX, fieldY, fieldZ);

  if (fieldMagnitude === 0) {
    return Object.freeze({ x: 0, y: 0, z: 0 });
  }

  const amplitude = Math.min(
    GRAVITY_GRID_MAX_DISPLACEMENT_SCENE,
    GRAVITY_GRID_MAX_DISPLACEMENT_SCENE *
      -Math.expm1(-GRAVITY_GRID_FIELD_COMPRESSION * fieldMagnitude)
  );
  const displacement = {
    x: (fieldX / fieldMagnitude) * amplitude,
    y: (fieldY / fieldMagnitude) * amplitude,
    z: (fieldZ / fieldMagnitude) * amplitude,
  };
  assertFinitePoint(displacement, "Visual field displacement");

  return Object.freeze(displacement);
}

export type PreparedPotentialMasses = Readonly<{
  bodyCount: number;
  maximumMassKg: number;
  massWeights: Float32Array;
}>;

export function preparePotentialMasses(
  massesKg: readonly number[]
): PreparedPotentialMasses {
  if (massesKg.length < 1 || massesKg.length > MAX_NEWTONIAN_BODIES) {
    throw new RangeError(
      `Potential uniforms require between 1 and ${MAX_NEWTONIAN_BODIES} masses.`
    );
  }

  let maximumMassKg = 0;

  for (const massKg of massesKg) {
    if (!Number.isFinite(massKg) || massKg <= 0) {
      throw new RangeError(
        "Potential uniform masses must be finite and positive."
      );
    }

    maximumMassKg = Math.max(maximumMassKg, massKg);
  }

  const massWeights = new Float32Array(MAX_NEWTONIAN_BODIES);

  for (let index = 0; index < massesKg.length; index += 1) {
    massWeights[index] = visualMassWeight(massesKg[index], maximumMassKg);
  }

  return Object.freeze({
    bodyCount: massesKg.length,
    maximumMassKg,
    massWeights,
  });
}
