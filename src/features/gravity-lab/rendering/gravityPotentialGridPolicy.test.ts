import { describe, expect, it } from "vitest";

import {
  GRAVITY_GRID_LINES_PER_AXIS,
  GRAVITY_GRID_MAX_DISPLACEMENT_SCENE,
  GRAVITY_GRID_MIN_MASS_WEIGHT,
  GRAVITY_GRID_POINTS_PER_LINE,
  calculatePotentialGridBounds,
  calculateRegularizedNewtonianPotential,
  calculateVisualFieldDisplacement,
  createPotentialGridLinePositions,
  preparePotentialMasses,
  resolvePotentialGridActivity,
  type PotentialGridBody,
} from "./gravityPotentialGridPolicy";

const origin = { x: 0, y: 0, z: 0 };

function body(massKg: number, position = origin): PotentialGridBody {
  return { massKg, position };
}

function magnitude(point: Readonly<{ x: number; y: number; z: number }>) {
  return Math.hypot(point.x, point.y, point.z);
}

describe("volumetric Newtonian potential grid policy", () => {
  it("builds a non-degenerate enclosing volume for one compact body", () => {
    const bounds = calculatePotentialGridBounds([{ x: 2, y: -1, z: 4 }]);

    expect(bounds.center).toEqual({ x: 2, y: -1, z: 4 });
    expect(bounds.minimum.x).toBeLessThan(2);
    expect(bounds.minimum.y).toBeLessThan(-1);
    expect(bounds.minimum.z).toBeLessThan(4);
    expect(bounds.maximum.x).toBeGreaterThan(2);
    expect(bounds.maximum.y).toBeGreaterThan(-1);
    expect(bounds.maximum.z).toBeGreaterThan(4);
  });

  it("expands deterministically around an extended system", () => {
    const compact = calculatePotentialGridBounds([
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
    const extendedInput = [
      { x: -100, y: -20, z: -5 },
      { x: 100, y: 20, z: 5 },
    ];
    const extended = calculatePotentialGridBounds(extendedInput);

    expect(extended.halfExtents.x).toBeGreaterThan(compact.halfExtents.x);
    expect(extended.halfExtents.y).toBeGreaterThan(compact.halfExtents.y);
    expect(extended.halfExtents.z).toBeGreaterThan(compact.halfExtents.z);
    expect(calculatePotentialGridBounds(extendedInput)).toEqual(extended);
  });

  it("creates lines along X, Y, and Z with the expected bounded size", () => {
    const bounds = calculatePotentialGridBounds([origin]);
    const positions = createPotentialGridLinePositions(bounds);
    const expectedSegments =
      3 *
      GRAVITY_GRID_LINES_PER_AXIS ** 2 *
      (GRAVITY_GRID_POINTS_PER_LINE - 1);

    expect(positions).toHaveLength(expectedSegments * 2 * 3);
    expect([...positions].every(Number.isFinite)).toBe(true);
    const xValues = new Set<number>();
    const yValues = new Set<number>();
    const zValues = new Set<number>();

    for (let offset = 0; offset < positions.length; offset += 3) {
      xValues.add(positions[offset]);
      yValues.add(positions[offset + 1]);
      zValues.add(positions[offset + 2]);
    }

    expect(xValues.size).toBeGreaterThanOrEqual(GRAVITY_GRID_POINTS_PER_LINE);
    expect(yValues.size).toBeGreaterThanOrEqual(GRAVITY_GRID_POINTS_PER_LINE);
    expect(zValues.size).toBeGreaterThanOrEqual(GRAVITY_GRID_POINTS_PER_LINE);
  });

  it("produces a genuinely three-dimensional displacement", () => {
    const displacement = calculateVisualFieldDisplacement(
      [body(10, { x: 2, y: 3, z: 4 })],
      origin
    );

    expect(displacement.x).toBeGreaterThan(0);
    expect(displacement.y).toBeGreaterThan(0);
    expect(displacement.z).toBeGreaterThan(0);
  });

  it("gives a stronger local deformation to the larger mass", () => {
    const bodies = [
      body(10, { x: -3, y: 0, z: 0 }),
      body(1, { x: 3, y: 0, z: 0 }),
    ];
    const nearHeavy = calculateVisualFieldDisplacement(bodies, {
      x: -2.6,
      y: 0,
      z: 0,
    });
    const nearLight = calculateVisualFieldDisplacement(bodies, {
      x: 2.6,
      y: 0,
      z: 0,
    });

    expect(magnitude(nearHeavy)).toBeGreaterThan(magnitude(nearLight));
  });

  it("combines multiple field contributions", () => {
    const first = body(5, { x: 2, y: 1, z: 0 });
    const second = body(5, { x: 0, y: 2, z: 1 });
    const combined = calculateVisualFieldDisplacement([first, second], origin);
    const alone = calculateVisualFieldDisplacement([first], origin);

    expect(combined).not.toEqual(alone);
    expect(combined.x).toBeGreaterThan(0);
    expect(combined.y).toBeGreaterThan(0);
    expect(combined.z).toBeGreaterThan(0);
  });

  it("regularizes zero distance to finite potential and displacement", () => {
    const potential = calculateRegularizedNewtonianPotential(
      [body(1e30)],
      origin
    );
    const displacement = calculateVisualFieldDisplacement(
      [body(1e30)],
      origin
    );

    expect(Number.isFinite(potential)).toBe(true);
    expect(displacement).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("strictly bounds finite displacement for sixteen bodies", () => {
    const bodies = Array.from({ length: 16 }, (_, index) =>
      body(1e33, {
        x: (index % 4) * 1e-9,
        y: (index % 3) * 1e-9,
        z: (index % 5) * 1e-9,
      })
    );
    const displacement = calculateVisualFieldDisplacement(bodies, {
      x: 1e-10,
      y: -1e-10,
      z: 2e-10,
    });

    expect(Object.values(displacement).every(Number.isFinite)).toBe(true);
    expect(magnitude(displacement)).toBeLessThanOrEqual(
      GRAVITY_GRID_MAX_DISPLACEMENT_SCENE
    );
  });

  it("is independent of physical and amplified visual radii", () => {
    const physical = { massKg: 10, position: origin, physicalRadiusM: 1e-9 };
    const amplified = { ...physical, physicalRadiusM: 0.75 };
    const sample = { x: 1, y: 2, z: 3 };

    expect(calculateVisualFieldDisplacement([physical], sample)).toEqual(
      calculateVisualFieldDisplacement([amplified], sample)
    );
  });

  it("prepares finite uniforms for one and sixteen bodies", () => {
    for (const masses of [[5], Array.from({ length: 16 }, (_, i) => i + 1)]) {
      const prepared = preparePotentialMasses(masses);

      expect(prepared.bodyCount).toBe(masses.length);
      expect(prepared.massWeights).toHaveLength(16);
      expect([...prepared.massWeights].every(Number.isFinite)).toBe(true);
      expect(prepared.massWeights[masses.length - 1]).toBe(1);
    }
  });

  it("keeps an astronomically smaller mass visible after compression", () => {
    const prepared = preparePotentialMasses([Number.MIN_VALUE, 1e33]);

    expect(prepared.massWeights[0]).toBeCloseTo(
      GRAVITY_GRID_MIN_MASS_WEIGHT,
      6
    );
    expect(prepared.massWeights[1]).toBe(1);
  });

  it("rebuilds independent bounds and mass data after scenario replacement", () => {
    const previousBounds = calculatePotentialGridBounds([
      { x: -4, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ]);
    const replacementBounds = calculatePotentialGridBounds([
      { x: 20, y: 30, z: 40 },
    ]);
    const previousMasses = preparePotentialMasses([1, 2, 3]);
    const replacementMasses = preparePotentialMasses([10]);

    expect(replacementBounds).not.toEqual(previousBounds);
    expect(replacementMasses.massWeights).not.toBe(previousMasses.massWeights);
    expect(replacementMasses.massWeights.slice(1).every((value) => value === 0))
      .toBe(true);
  });

  it("draws and updates only while the grid is visible", () => {
    expect(resolvePotentialGridActivity(true)).toEqual({
      draw: true,
      updateUniforms: true,
    });
    expect(resolvePotentialGridActivity(false)).toEqual({
      draw: false,
      updateUniforms: false,
    });
  });

  it("never mutates physical positions, masses, or visual inputs", () => {
    const bodies = [body(2e20, { x: 1, y: 2, z: 3 })];
    const positions = [bodies[0].position];
    const masses = [bodies[0].massKg];
    const snapshot = structuredClone({ bodies, positions, masses });

    calculatePotentialGridBounds(positions);
    calculateRegularizedNewtonianPotential(bodies, origin);
    calculateVisualFieldDisplacement(bodies, origin);
    preparePotentialMasses(masses);

    expect({ bodies, positions, masses }).toEqual(snapshot);
  });
});
