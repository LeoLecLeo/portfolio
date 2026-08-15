import { describe, expect, it } from "vitest";

import {
  GRAVITY_FIELD_MAX_LENGTH_SCENE,
  GRAVITY_FIELD_MIN_LENGTH_SCENE,
  GRAVITY_FIELD_VECTOR_COUNT,
  calculateRegularizedGravityField,
  calculateVisualGravityVector,
  createGravityFieldSamplePositions,
  prepareGravityFieldMassWeights,
  type GravityFieldBody,
} from "./gravityFieldVectorPolicy";
import { calculatePotentialGridBounds } from "./gravityPotentialGridPolicy";

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

  it("prepares exactly 125 sample points and supports one or sixteen bodies", () => {
    const bounds = calculatePotentialGridBounds([origin]);
    const samples = createGravityFieldSamplePositions(bounds);

    expect(samples).toHaveLength(GRAVITY_FIELD_VECTOR_COUNT * 3);
    expect([...samples].every(Number.isFinite)).toBe(true);
    expect(prepareGravityFieldMassWeights([1]).bodyCount).toBe(1);
    expect(
      prepareGravityFieldMassWeights(
        Array.from({ length: 16 }, (_, index) => index + 1)
      ).bodyCount
    ).toBe(16);
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
    createGravityFieldSamplePositions(bounds);
    prepareGravityFieldMassWeights(masses);

    expect({ bodies, masses, bounds }).toEqual(snapshot);
  });
});
