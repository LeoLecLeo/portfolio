import { describe, expect, it } from "vitest";

import type { NewtonianState } from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";
import { computeNewtonianDiagnostics } from "./diagnostics";
import { computeNewtonianAccelerations } from "./newtonian";

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-300);
}

function rotateVector(values: Float64Array): Float64Array {
  const angleX = 0.37;
  const angleZ = -0.61;
  const cosineX = Math.cos(angleX);
  const sineX = Math.sin(angleX);
  const cosineZ = Math.cos(angleZ);
  const sineZ = Math.sin(angleZ);
  const output = new Float64Array(values.length);

  for (let offset = 0; offset < values.length; offset += 3) {
    const xAfterX = values[offset];
    const yAfterX =
      values[offset + 1] * cosineX - values[offset + 2] * sineX;
    const zAfterX =
      values[offset + 1] * sineX + values[offset + 2] * cosineX;
    output[offset] = xAfterX * cosineZ - yAfterX * sineZ;
    output[offset + 1] = xAfterX * sineZ + yAfterX * cosineZ;
    output[offset + 2] = zAfterX;
  }

  return output;
}

describe("Newtonian N-body acceleration", () => {
  it("matches the analytical inverse-square acceleration in 3D", () => {
    const masses = new Float64Array([2e20, 3e20]);
    const positions = new Float64Array([0, 0, 0, 1, 2, 2]);
    const accelerations = new Float64Array(6);

    computeNewtonianAccelerations(masses, positions, accelerations);

    const firstFactor =
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 * masses[1]) / 27;
    const secondFactor =
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 * masses[0]) / 27;

    expect(relativeError(accelerations[0], firstFactor)).toBeLessThan(1e-15);
    expect(relativeError(accelerations[1], 2 * firstFactor)).toBeLessThan(
      1e-15
    );
    expect(relativeError(accelerations[2], 2 * firstFactor)).toBeLessThan(
      1e-15
    );
    expect(relativeError(accelerations[3], -secondFactor)).toBeLessThan(
      1e-15
    );
    expect(relativeError(accelerations[4], -2 * secondFactor)).toBeLessThan(
      1e-15
    );
    expect(relativeError(accelerations[5], -2 * secondFactor)).toBeLessThan(
      1e-15
    );
  });

  it("computes a three-body system with balanced internal forces", () => {
    const masses = new Float64Array([2e20, 3e20, 5e20]);
    const positions = new Float64Array([
      -4e7,
      2e7,
      3e7,
      7e7,
      -5e7,
      11e7,
      2e7,
      13e7,
      -6e7,
    ]);
    const accelerations = new Float64Array(9);

    computeNewtonianAccelerations(masses, positions, accelerations);

    let netForceX = 0;
    let netForceY = 0;
    let netForceZ = 0;
    let forceScale = 0;

    for (let bodyIndex = 0; bodyIndex < masses.length; bodyIndex += 1) {
      const offset = bodyIndex * 3;
      const forceX = masses[bodyIndex] * accelerations[offset];
      const forceY = masses[bodyIndex] * accelerations[offset + 1];
      const forceZ = masses[bodyIndex] * accelerations[offset + 2];
      netForceX += forceX;
      netForceY += forceY;
      netForceZ += forceZ;
      forceScale += Math.hypot(forceX, forceY, forceZ);
    }

    expect(Math.hypot(netForceX, netForceY, netForceZ) / forceScale).toBeLessThan(
      1e-15
    );
    expect(accelerations).toHaveLength(9);
  });

  it("is invariant under translation and 3D rotation", () => {
    const masses = new Float64Array([2e20, 3e20, 5e20]);
    const positions = new Float64Array([
      -4e7,
      2e7,
      3e7,
      7e7,
      -5e7,
      11e7,
      2e7,
      13e7,
      -6e7,
    ]);
    const translated = positions.slice();

    for (let offset = 0; offset < translated.length; offset += 3) {
      translated[offset] += 8e9;
      translated[offset + 1] -= 3e9;
      translated[offset + 2] += 5e9;
    }

    const originalAccelerations = new Float64Array(positions.length);
    const translatedAccelerations = new Float64Array(positions.length);
    computeNewtonianAccelerations(
      masses,
      positions,
      originalAccelerations
    );
    computeNewtonianAccelerations(
      masses,
      translated,
      translatedAccelerations
    );

    for (let index = 0; index < originalAccelerations.length; index += 1) {
      expect(
        relativeError(
          translatedAccelerations[index],
          originalAccelerations[index]
        )
      ).toBeLessThan(2e-14);
    }

    const rotatedPositions = rotateVector(positions);
    const rotatedAccelerations = new Float64Array(positions.length);
    computeNewtonianAccelerations(
      masses,
      rotatedPositions,
      rotatedAccelerations
    );
    const expectedRotatedAccelerations = rotateVector(originalAccelerations);

    for (let index = 0; index < rotatedAccelerations.length; index += 1) {
      expect(
        relativeError(
          rotatedAccelerations[index],
          expectedRotatedAccelerations[index]
        )
      ).toBeLessThan(2e-14);
    }
  });

  it("is independent from body ordering", () => {
    const masses = new Float64Array([2e20, 3e20, 5e20]);
    const positions = new Float64Array([
      -4e7,
      2e7,
      3e7,
      7e7,
      -5e7,
      11e7,
      2e7,
      13e7,
      -6e7,
    ]);
    const original = new Float64Array(9);
    computeNewtonianAccelerations(masses, positions, original);

    const permutation = [2, 0, 1];
    const permutedMasses = new Float64Array(
      permutation.map((index) => masses[index])
    );
    const permutedPositions = new Float64Array(9);

    permutation.forEach((originalIndex, permutedIndex) => {
      permutedPositions.set(
        positions.subarray(originalIndex * 3, originalIndex * 3 + 3),
        permutedIndex * 3
      );
    });

    const permuted = new Float64Array(9);
    computeNewtonianAccelerations(
      permutedMasses,
      permutedPositions,
      permuted
    );

    permutation.forEach((originalIndex, permutedIndex) => {
      for (let axis = 0; axis < 3; axis += 1) {
        expect(
          relativeError(
            permuted[permutedIndex * 3 + axis],
            original[originalIndex * 3 + axis]
          )
        ).toBeLessThan(2e-14);
      }
    });
  });

  it("uses an exact inverse-square law without softening", () => {
    const masses = new Float64Array([1e20, 1e20]);
    const nearAcceleration = new Float64Array(6);
    const farAcceleration = new Float64Array(6);

    computeNewtonianAccelerations(
      masses,
      new Float64Array([0, 0, 0, 2, 0, 0]),
      nearAcceleration
    );
    computeNewtonianAccelerations(
      masses,
      new Float64Array([0, 0, 0, 4, 0, 0]),
      farAcceleration
    );

    expect(nearAcceleration[0] / farAcceleration[0]).toBeCloseTo(4, 14);
  });

  it("gives a single isolated body zero acceleration", () => {
    const acceleration = new Float64Array([1, 1, 1]);

    computeNewtonianAccelerations(
      new Float64Array([1e20]),
      new Float64Array([1, 2, 3]),
      acceleration
    );

    expect(Array.from(acceleration)).toEqual([0, 0, 0]);
  });

  it("computes analytical energy, momentum, angular momentum, and barycenter", () => {
    const state: NewtonianState = {
      bodyIds: ["a", "b"],
      massesKg: new Float64Array([2, 3]),
      physicalRadiiM: new Float64Array([0, 0]),
      fixed: new Uint8Array([0, 0]),
      positionsM: new Float64Array([1, 0, 0, 0, 2, 0]),
      velocitiesMps: new Float64Array([0, 1, 0, -1, 0, 0]),
      accelerationsMps2: new Float64Array(6),
      stepCount: 0,
      timeSeconds: 0,
    };

    const diagnostics = computeNewtonianDiagnostics(state);
    const expectedPotential =
      (-GRAVITATIONAL_CONSTANT_M3_KG_S2 * 2 * 3) / Math.sqrt(5);

    expect(diagnostics.kineticEnergyJ).toBeCloseTo(2.5, 14);
    expect(diagnostics.potentialEnergyJ).toBeCloseTo(
      expectedPotential,
      20
    );
    expect(diagnostics.totalEnergyJ).toBeCloseTo(
      2.5 + expectedPotential,
      14
    );
    expect(diagnostics.linearMomentumKgMps).toEqual({
      x: -3,
      y: 2,
      z: 0,
    });
    expect(diagnostics.angularMomentumKgM2ps).toEqual({
      x: 0,
      y: 0,
      z: 8,
    });
    expect(diagnostics.centerOfMassM.x).toBeCloseTo(0.4, 14);
    expect(diagnostics.centerOfMassM.y).toBeCloseTo(1.2, 14);
    expect(diagnostics.centerOfMassM.z).toBe(0);
    expect(diagnostics.hasFixedBodies).toBe(false);
  });
});
