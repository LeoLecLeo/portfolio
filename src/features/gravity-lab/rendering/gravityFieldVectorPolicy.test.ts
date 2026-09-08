import { describe, expect, it } from "vitest";

import {
  GRAVITY_FIELD_MAX_LENGTH_SCENE,
  GRAVITY_FIELD_MAX_SAMPLES_PER_AXIS,
  GRAVITY_FIELD_MAX_VECTOR_COUNT,
  GRAVITY_FIELD_MIN_LENGTH_SCENE,
  GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS,
  GRAVITY_FIELD_TARGET_SPACING_SCENE,
  calculateGravityFieldSampling,
  calculateRegularizedGravityField,
  calculateVisualGravityVector,
  createGravityFieldSamplePositions,
  prepareGravityFieldMassWeights,
  type GravityFieldBody,
} from "./gravityFieldVectorPolicy";
import { calculatePotentialGridBounds } from "./gravityPotentialGridPolicy";
import type { PotentialGridBounds } from "./gravityPotentialGridPolicy";

const origin = { x: 0, y: 0, z: 0 };

function body(
  massKg: number,
  position = origin
): GravityFieldBody {
  return { massKg, position };
}

function magnitude(point: Readonly<{ x: number; y: number; z: number }>) {
  return Math.hypot(point.x, point.y, point.z);
}

function fieldBounds(x: number, y: number, z: number): PotentialGridBounds {
  const minimum = { x: 0, y: 0, z: 0 };
  const maximum = { x, y, z };

  return {
    minimum,
    maximum,
    center: { x: x / 2, y: y / 2, z: z / 2 },
    halfExtents: { x: x / 2, y: y / 2, z: z / 2 },
  };
}

describe("Newtonian gravity field vector policy", () => {
  it("points toward an isolated body", () => {
    const vector = calculateVisualGravityVector(
      [body(10, { x: 2, y: 3, z: 4 })],
      origin
    );

    expect(vector.direction.x).toBeGreaterThan(0);
    expect(vector.direction.y).toBeGreaterThan(0);
    expect(vector.direction.z).toBeGreaterThan(0);
  });

  it("is symmetric on opposite sides of one body", () => {
    const bodies = [body(10)];
    const positive = calculateRegularizedGravityField(
      bodies,
      { x: 2, y: 0, z: 0 }
    );
    const negative = calculateRegularizedGravityField(
      bodies,
      { x: -2, y: 0, z: 0 }
    );

    expect(positive.x).toBeCloseTo(-negative.x, 14);
    expect(positive.y).toBe(negative.y);
    expect(positive.z).toBe(negative.z);
  });

  it("combines the fields of two masses", () => {
    const first = body(4, { x: 2, y: 0, z: 0 });
    const second = body(4, { x: 0, y: 2, z: 0 });
    const combined = calculateRegularizedGravityField(
      [first, second],
      origin
    );
    const expectedFirst = calculateRegularizedGravityField([first], origin);
    const expectedSecond = calculateRegularizedGravityField([second], origin);

    expect(combined.x).toBeCloseTo(expectedFirst.x + expectedSecond.x, 14);
    expect(combined.y).toBeCloseTo(expectedFirst.y + expectedSecond.y, 14);
    expect(combined.z).toBeCloseTo(expectedFirst.z + expectedSecond.z, 14);
  });

  it("cancels exactly between two equal symmetric masses", () => {
    const vector = calculateVisualGravityVector(
      [
        body(10, { x: -2, y: 0, z: 0 }),
        body(10, { x: 2, y: 0, z: 0 }),
      ],
      origin
    );

    expect(vector.field).toEqual({ x: 0, y: 0, z: 0 });
    expect(vector.lengthScene).toBe(0);
  });

  it("gives a stronger influence to a larger mass at equal distance", () => {
    const sample = { x: 1, y: 0, z: 0 };
    const light = calculateRegularizedGravityField([body(1)], sample);
    const heavy = calculateRegularizedGravityField([body(10)], sample);

    expect(magnitude(heavy)).toBeCloseTo(10 * magnitude(light), 12);
  });

  it("remains finite close to and at a body", () => {
    for (const sample of [origin, { x: 1e-300, y: 0, z: 0 }]) {
      const vector = calculateVisualGravityVector([body(1e33)], sample);

      expect(Object.values(vector.field).every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(vector.regularizedMagnitude)).toBe(true);
      expect(Number.isFinite(vector.lengthScene)).toBe(true);
    }
  });

  it("bounds every visible vector between explicit lengths", () => {
    const vector = calculateVisualGravityVector(
      [body(1e33)],
      { x: 0.1, y: 0.1, z: 0.1 }
    );

    expect(vector.lengthScene).toBeGreaterThanOrEqual(
      GRAVITY_FIELD_MIN_LENGTH_SCENE
    );
    expect(vector.lengthScene).toBeLessThanOrEqual(
      GRAVITY_FIELD_MAX_LENGTH_SCENE
    );
    expect(vector.relativeIntensity).toBeGreaterThanOrEqual(0);
    expect(vector.relativeIntensity).toBeLessThanOrEqual(1);
  });

  it("prepares the adaptive sample count and supports one or sixteen bodies", () => {
    const bounds = calculatePotentialGridBounds([origin]);
    const sampling = calculateGravityFieldSampling(bounds);
    const samples = createGravityFieldSamplePositions(bounds);

    expect(samples).toHaveLength(sampling.vectorCount * 3);
    expect([...samples].every(Number.isFinite)).toBe(true);
    expect(prepareGravityFieldMassWeights([1]).bodyCount).toBe(1);
    expect(
      prepareGravityFieldMassWeights(
        Array.from({ length: 16 }, (_, index) => index + 1)
      ).bodyCount
    ).toBe(16);
  });

  it("increases vector density with a larger volume", () => {
    const compact = calculateGravityFieldSampling(fieldBounds(1, 1, 1));
    const extended = calculateGravityFieldSampling(
      fieldBounds(10, 10, 10)
    );

    expect(compact.counts).toEqual({ x: 7, y: 7, z: 7 });
    expect(extended.counts).toEqual({ x: 11, y: 11, z: 11 });
    expect(extended.vectorCount).toBeGreaterThan(compact.vectorCount);
  });

  it("keeps independent axis spacing close to the target", () => {
    const sampling = calculateGravityFieldSampling(
      fieldBounds(6, 8, 10)
    );

    expect(sampling.spacing).toEqual({
      x: GRAVITY_FIELD_TARGET_SPACING_SCENE,
      y: GRAVITY_FIELD_TARGET_SPACING_SCENE,
      z: GRAVITY_FIELD_TARGET_SPACING_SCENE,
    });
    expect(sampling.counts.x).toBeLessThan(sampling.counts.y);
    expect(sampling.counts.y).toBeLessThan(sampling.counts.z);
  });

  it("respects per-axis and global sampling bounds", () => {
    const elongated = calculateGravityFieldSampling(
      fieldBounds(10_000, 1, 1)
    );
    const extreme = calculateGravityFieldSampling(
      fieldBounds(10_000, 10_000, 10_000)
    );

    expect(elongated.counts).toEqual({
      x: GRAVITY_FIELD_MAX_SAMPLES_PER_AXIS,
      y: GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS,
      z: GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS,
    });
    expect(extreme.vectorCount).toBeLessThanOrEqual(
      GRAVITY_FIELD_MAX_VECTOR_COUNT
    );
    expect(extreme.vectorCount).toBe(GRAVITY_FIELD_MAX_VECTOR_COUNT);
    for (const count of Object.values(extreme.counts)) {
      expect(count).toBeGreaterThanOrEqual(
        GRAVITY_FIELD_MIN_SAMPLES_PER_AXIS
      );
      expect(count).toBeLessThanOrEqual(
        GRAVITY_FIELD_MAX_SAMPLES_PER_AXIS
      );
    }
  });

  it("is deterministic for compact, anisotropic, and extreme bounds", () => {
    for (const bounds of [
      fieldBounds(0.25, 0.5, 0.75),
      fieldBounds(80, 16, 32),
      fieldBounds(1e9, 1e9, 1e9),
    ]) {
      expect(calculateGravityFieldSampling(bounds)).toEqual(
        calculateGravityFieldSampling(bounds)
      );
    }
  });

  it("combines sixteen bodies into one finite bounded visual vector", () => {
    const bodies = Array.from({ length: 16 }, (_, index) =>
      body(index + 1, {
        x: (index % 4) - 1.5,
        y: (index % 3) - 1,
        z: (index % 5) - 2,
      })
    );
    const vector = calculateVisualGravityVector(
      bodies,
      { x: 0.25, y: -0.5, z: 0.75 }
    );

    expect(Object.values(vector.direction).every(Number.isFinite)).toBe(true);
    expect(vector.lengthScene).toBeLessThanOrEqual(
      GRAVITY_FIELD_MAX_LENGTH_SCENE
    );
  });

  it("is independent of physical and amplified display radii", () => {
    const physical = { massKg: 10, position: origin, physicalRadiusM: 1e-9 };
    const amplified = { ...physical, physicalRadiusM: 0.75 };
    const sample = { x: 1, y: 2, z: 3 };

    expect(calculateVisualGravityVector([physical], sample)).toEqual(
      calculateVisualGravityVector([amplified], sample)
    );
  });

  it("does not modify masses, positions, or physical body data", () => {
    const bodies = [body(2e20, { x: 1, y: 2, z: 3 })];
    const masses = [2e20];
    const bounds = calculatePotentialGridBounds([bodies[0].position]);
    const snapshot = structuredClone({ bodies, masses, bounds });

    calculateRegularizedGravityField(bodies, origin);
    calculateVisualGravityVector(bodies, origin);
    calculateGravityFieldSampling(bounds);
    createGravityFieldSamplePositions(bounds);
    prepareGravityFieldMassWeights(masses);

    expect({ bodies, masses, bounds }).toEqual(snapshot);
  });
});
