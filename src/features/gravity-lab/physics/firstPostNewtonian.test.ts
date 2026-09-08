import { describe, expect, it } from "vitest";

import {
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SPEED_OF_LIGHT_MPS,
} from "../core/units";
import { computeFirstPostNewtonianAccelerations } from "./firstPostNewtonian";
import { computeNewtonianAccelerations } from "./newtonian";

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-300);
}

function rotateVectors(values: Float64Array): Float64Array {
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

function permuteVectors(
  values: Float64Array,
  permutation: readonly number[]
): Float64Array {
  const output = new Float64Array(values.length);

  permutation.forEach((originalIndex, permutedIndex) => {
    output.set(
      values.subarray(originalIndex * 3, originalIndex * 3 + 3),
      permutedIndex * 3
    );
  });

  return output;
}

function evaluate(
  massesKg: Float64Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array
): Float64Array {
  const accelerations = new Float64Array(positionsM.length);
  computeFirstPostNewtonianAccelerations(
    massesKg,
    positionsM,
    velocitiesMps,
    accelerations
  );
  return accelerations;
}

const THREE_BODY_MASSES = new Float64Array([2e29, 3e29, 5e29]);
const THREE_BODY_POSITIONS = new Float64Array([
  -4e10,
  2e10,
  3e10,
  7e10,
  -5e10,
  11e10,
  2e10,
  13e10,
  -6e10,
]);
const THREE_BODY_VELOCITIES = new Float64Array([
  120_000,
  -80_000,
  45_000,
  -50_000,
  90_000,
  -30_000,
  70_000,
  20_000,
  -110_000,
]);

describe("complete EIH 1PN acceleration", () => {
  it("matches an independent analytical two-body result at rest", () => {
    const firstMassKg = 2e29;
    const secondMassKg = 3e29;
    const separationM = 8e10;
    const accelerations = evaluate(
      new Float64Array([firstMassKg, secondMassKg]),
      new Float64Array([0, 0, 0, separationM, 0, 0]),
      new Float64Array(6)
    );
    const inverseC2 = 1 / (SPEED_OF_LIGHT_MPS * SPEED_OF_LIGHT_MPS);
    const expectedFirst =
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 * secondMassKg) /
      (separationM * separationM) *
      (1 -
        (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
          (5 * firstMassKg + 4 * secondMassKg) *
          inverseC2) /
          separationM);
    const expectedSecond =
      (-GRAVITATIONAL_CONSTANT_M3_KG_S2 * firstMassKg) /
      (separationM * separationM) *
      (1 -
        (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
          (4 * firstMassKg + 5 * secondMassKg) *
          inverseC2) /
          separationM);

    expect(relativeError(accelerations[0], expectedFirst)).toBeLessThan(2e-15);
    expect(relativeError(accelerations[3], expectedSecond)).toBeLessThan(2e-15);
    expect(Array.from(accelerations.slice(1, 3))).toEqual([0, 0]);
    expect(Array.from(accelerations.slice(4, 6))).toEqual([0, 0]);

    const newtonianFirst =
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 * secondMassKg) /
      (separationM * separationM);
    const relativeCorrection =
      Math.abs((accelerations[0] - newtonianFirst) / newtonianFirst);
    const expectedCorrectionOrder =
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
        (firstMassKg + secondMassKg)) /
      (separationM * SPEED_OF_LIGHT_MPS * SPEED_OF_LIGHT_MPS);

    expect(relativeCorrection).toBeGreaterThan(expectedCorrectionOrder);
    expect(relativeCorrection).toBeLessThan(5 * expectedCorrectionOrder);
  });

  it("matches a high-precision independent three-body benchmark", () => {
    const accelerations = evaluate(
      THREE_BODY_MASSES,
      THREE_BODY_POSITIONS,
      THREE_BODY_VELOCITIES
    );
    // Precomputed independently with 60-digit decimal arithmetic from the
    // normative EIH equation, rather than by reusing this implementation.
    const expected = new Float64Array([
      0.00116064516532203096,
      0.00060821463523075825,
      -0.00037049825088132319,
      -0.00051374945160064543,
      0.00063379080128474361,
      -0.00065037481694055815,
      -0.00015600841525808103,
      -0.00062356037403890691,
      0.00053842412432438264,
    ]);

    for (let index = 0; index < expected.length; index += 1) {
      expect(relativeError(accelerations[index], expected[index])).toBeLessThan(
        3e-15
      );
    }
  });

  it("includes non-pairwise EIH cross terms", () => {
    const full = evaluate(
      THREE_BODY_MASSES,
      THREE_BODY_POSITIONS,
      THREE_BODY_VELOCITIES
    );
    const pairwiseSum = new Float64Array(9);

    for (let firstIndex = 0; firstIndex < 3; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < 3; secondIndex += 1) {
        const pairMasses = new Float64Array([
          THREE_BODY_MASSES[firstIndex],
          THREE_BODY_MASSES[secondIndex],
        ]);
        const pairPositions = new Float64Array(6);
        const pairVelocities = new Float64Array(6);
        pairPositions.set(
          THREE_BODY_POSITIONS.subarray(firstIndex * 3, firstIndex * 3 + 3),
          0
        );
        pairPositions.set(
          THREE_BODY_POSITIONS.subarray(secondIndex * 3, secondIndex * 3 + 3),
          3
        );
        pairVelocities.set(
          THREE_BODY_VELOCITIES.subarray(firstIndex * 3, firstIndex * 3 + 3),
          0
        );
        pairVelocities.set(
          THREE_BODY_VELOCITIES.subarray(secondIndex * 3, secondIndex * 3 + 3),
          3
        );
        const pair = evaluate(pairMasses, pairPositions, pairVelocities);

        for (let axis = 0; axis < 3; axis += 1) {
          pairwiseSum[firstIndex * 3 + axis] += pair[axis];
          pairwiseSum[secondIndex * 3 + axis] += pair[3 + axis];
        }
      }
    }

    const crossTermResidual = new Float64Array([
      -1.0836369179867588e-11,
      -2.4235689312933451e-12,
      5.236527816161474e-13,
      4.5271020864002185e-12,
      -2.7622785506486412e-12,
      3.1854754546340842e-12,
      1.497519033480456e-12,
      2.601983581292927e-12,
      -2.1168933166444716e-12,
    ]);

    for (let index = 0; index < full.length; index += 1) {
      const measuredResidual = full[index] - pairwiseSum[index];
      const subtractionRoundoffAllowance =
        Number.EPSILON *
        (Math.abs(full[index]) + Math.abs(pairwiseSum[index])) *
        8;

      expect(Math.abs(crossTermResidual[index])).toBeGreaterThan(
        subtractionRoundoffAllowance * 1_000
      );
      expect(
        Math.abs(measuredResidual - crossTermResidual[index])
      ).toBeLessThanOrEqual(subtractionRoundoffAllowance);
    }
  });

  it("is invariant under a coherent permutation of bodies", () => {
    const original = evaluate(
      THREE_BODY_MASSES,
      THREE_BODY_POSITIONS,
      THREE_BODY_VELOCITIES
    );
    const permutation = [2, 0, 1] as const;
    const permuted = evaluate(
      new Float64Array(permutation.map((index) => THREE_BODY_MASSES[index])),
      permuteVectors(THREE_BODY_POSITIONS, permutation),
      permuteVectors(THREE_BODY_VELOCITIES, permutation)
    );

    permutation.forEach((originalIndex, permutedIndex) => {
      for (let axis = 0; axis < 3; axis += 1) {
        expect(
          relativeError(
            permuted[permutedIndex * 3 + axis],
            original[originalIndex * 3 + axis]
          )
        ).toBeLessThan(3e-15);
      }
    });
  });

  it("is invariant under a global position translation", () => {
    const translatedPositions = THREE_BODY_POSITIONS.slice();

    for (let offset = 0; offset < translatedPositions.length; offset += 3) {
      translatedPositions[offset] += 3e11;
      translatedPositions[offset + 1] -= 2e11;
      translatedPositions[offset + 2] += 5e11;
    }

    const original = evaluate(
      THREE_BODY_MASSES,
      THREE_BODY_POSITIONS,
      THREE_BODY_VELOCITIES
    );
    const translated = evaluate(
      THREE_BODY_MASSES,
      translatedPositions,
      THREE_BODY_VELOCITIES
    );

    for (let index = 0; index < original.length; index += 1) {
      expect(relativeError(translated[index], original[index])).toBeLessThan(
        2e-14
      );
    }
  });

  it("rotates accelerations coherently in 3D", () => {
    const original = evaluate(
      THREE_BODY_MASSES,
      THREE_BODY_POSITIONS,
      THREE_BODY_VELOCITIES
    );
    const rotated = evaluate(
      THREE_BODY_MASSES,
      rotateVectors(THREE_BODY_POSITIONS),
      rotateVectors(THREE_BODY_VELOCITIES)
    );
    const expected = rotateVectors(original);

    for (let index = 0; index < expected.length; index += 1) {
      expect(relativeError(rotated[index], expected[index])).toBeLessThan(2e-14);
    }
  });

  it("converges to Newtonian acceleration as the PN scale tends to zero", () => {
    const baseMasses = new Float64Array([1e31, 2e31]);
    const positions = new Float64Array([0, 0, 0, 1e10, -2e9, 3e9]);
    const baseVelocities = new Float64Array([
      400_000,
      -200_000,
      100_000,
      -300_000,
      250_000,
      -150_000,
    ]);
    const scales = [1, 1e-2, 1e-4];
    const relativeCorrections: number[] = [];

    for (const scale of scales) {
      const masses = new Float64Array(
        Array.from(baseMasses, (mass) => mass * scale)
      );
      const velocities = new Float64Array(
        Array.from(baseVelocities, (velocity) => velocity * Math.sqrt(scale))
      );
      const eih = evaluate(masses, positions, velocities);
      const newtonian = new Float64Array(positions.length);
      computeNewtonianAccelerations(masses, positions, newtonian);
      let differenceNorm = 0;
      let newtonianNorm = 0;

      for (let index = 0; index < eih.length; index += 1) {
        differenceNorm += (eih[index] - newtonian[index]) ** 2;
        newtonianNorm += newtonian[index] ** 2;
      }

      relativeCorrections.push(Math.sqrt(differenceNorm / newtonianNorm));
    }

    expect(relativeCorrections[1] / relativeCorrections[0]).toBeCloseTo(1e-2, 6);
    expect(relativeCorrections[2] / relativeCorrections[1]).toBeCloseTo(1e-2, 4);
    expect(relativeCorrections[2]).toBeLessThan(1e-8);
  });

  it("is numerically indistinguishable from Newtonian gravity in an extremely weak regime", () => {
    const masses = new Float64Array([1, 2]);
    const positions = new Float64Array([0, 0, 0, 1e9, 2e9, -3e9]);
    const velocities = new Float64Array([1e-6, 0, 0, 0, -1e-6, 0]);
    const eih = evaluate(masses, positions, velocities);
    const newtonian = new Float64Array(6);
    computeNewtonianAccelerations(masses, positions, newtonian);

    expect(eih).toEqual(newtonian);
  });

  it("does not mutate any input buffer", () => {
    const masses = THREE_BODY_MASSES.slice();
    const positions = THREE_BODY_POSITIONS.slice();
    const velocities = THREE_BODY_VELOCITIES.slice();
    const massesBefore = masses.slice();
    const positionsBefore = positions.slice();
    const velocitiesBefore = velocities.slice();

    evaluate(masses, positions, velocities);

    expect(masses).toEqual(massesBefore);
    expect(positions).toEqual(positionsBefore);
    expect(velocities).toEqual(velocitiesBefore);
  });

  it("supports one and sixteen bodies with finite deterministic output", () => {
    expect(
      Array.from(
        evaluate(
          new Float64Array([1e20]),
          new Float64Array([1, 2, 3]),
          new Float64Array([4, 5, 6])
        )
      )
    ).toEqual([0, 0, 0]);

    const masses = new Float64Array(16);
    const positions = new Float64Array(48);
    const velocities = new Float64Array(48);

    for (let bodyIndex = 0; bodyIndex < 16; bodyIndex += 1) {
      masses[bodyIndex] = 1e24 + bodyIndex * 1e22;
      positions[bodyIndex * 3] = bodyIndex * 2e9;
      positions[bodyIndex * 3 + 1] = (bodyIndex % 3) * 7e8;
      positions[bodyIndex * 3 + 2] = (bodyIndex % 5) * -4e8;
      velocities[bodyIndex * 3] = bodyIndex * 10;
      velocities[bodyIndex * 3 + 1] = -bodyIndex * 5;
      velocities[bodyIndex * 3 + 2] = bodyIndex * 3;
    }

    const first = evaluate(masses, positions, velocities);
    const second = evaluate(masses, positions, velocities);

    expect(first).toEqual(second);
    expect(Array.from(first).every(Number.isFinite)).toBe(true);
  });

  it("rejects non-finite inputs, invalid masses, and invalid separations", () => {
    const validMasses = new Float64Array([1, 2]);
    const validPositions = new Float64Array([0, 0, 0, 1, 0, 0]);
    const validVelocities = new Float64Array(6);

    expect(() =>
      evaluate(
        new Float64Array([1, Number.NaN]),
        validPositions,
        validVelocities
      )
    ).toThrow(/Mass at body index 1/);
    expect(() =>
      evaluate(
        validMasses,
        new Float64Array([0, 0, 0, Number.POSITIVE_INFINITY, 0, 0]),
        validVelocities
      )
    ).toThrow(/positions contains a non-finite value/);
    expect(() =>
      evaluate(
        validMasses,
        validPositions,
        new Float64Array([0, 0, 0, 0, Number.NaN, 0])
      )
    ).toThrow(/velocities contains a non-finite value/);
    expect(() =>
      evaluate(
        validMasses,
        new Float64Array(6),
        validVelocities
      )
    ).toThrow(/invalid separation/);
  });

  it("rejects incompatible, overlapping, empty, and oversized buffers", () => {
    expect(() =>
      computeFirstPostNewtonianAccelerations(
        new Float64Array([1]),
        new Float64Array(2),
        new Float64Array(3),
        new Float64Array(3)
      )
    ).toThrow(/different body counts/);

    const shared = new Float64Array([1, 2, 3, 4, 5, 6]);
    expect(() =>
      computeFirstPostNewtonianAccelerations(
        new Float64Array([1, 2]),
        shared,
        new Float64Array(6),
        shared
      )
    ).toThrow(/must not overlap/);

    expect(() =>
      computeFirstPostNewtonianAccelerations(
        new Float64Array(0),
        new Float64Array(0),
        new Float64Array(0),
        new Float64Array(0)
      )
    ).toThrow(/between 1 and 16 bodies/);

    expect(() =>
      computeFirstPostNewtonianAccelerations(
        new Float64Array(17).fill(1),
        new Float64Array(51),
        new Float64Array(51),
        new Float64Array(51)
      )
    ).toThrow(/between 1 and 16 bodies/);
  });
});
