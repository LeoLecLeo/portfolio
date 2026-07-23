import { describe, expect, it } from "vitest";

import { magnitudeVector3 } from "../core/vector3";
import {
  createInclinedBinaryConfig,
  INCLINED_BINARY_PERIOD_SECONDS,
  INCLINED_BINARY_PLANE_NORMAL,
  INCLINED_BINARY_SEPARATION_M,
} from "../presets/inclinedBinary";
import { SimulationEngine } from "../runtime/SimulationEngine";

type StabilityMetrics = Readonly<{
  stepsPerPeriod: number;
  periods: number;
  maxRelativeEnergyError: number;
  maxRelativeLinearMomentum: number;
  maxRelativeAngularMomentumError: number;
  maxRelativeBarycenterDisplacement: number;
  maxRelativePlaneDeviation: number;
}>;

function measureBinaryStability(
  stepsPerPeriod: number,
  periods: number
): StabilityMetrics {
  const engine = new SimulationEngine(
    createInclinedBinaryConfig(stepsPerPeriod)
  );
  const initialDiagnostics = engine.diagnostics();
  const initialEnergy = initialDiagnostics.totalEnergyJ;
  const initialAngularMomentum = magnitudeVector3(
    initialDiagnostics.angularMomentumKgM2ps
  );
  let characteristicMomentum = 0;

  for (let bodyIndex = 0; bodyIndex < engine.state.massesKg.length; bodyIndex += 1) {
    const offset = bodyIndex * 3;
    characteristicMomentum +=
      engine.state.massesKg[bodyIndex] *
      Math.hypot(
        engine.state.velocitiesMps[offset],
        engine.state.velocitiesMps[offset + 1],
        engine.state.velocitiesMps[offset + 2]
      );
  }

  const sampleEvery = Math.max(1, Math.floor(stepsPerPeriod / 128));
  const totalSteps = stepsPerPeriod * periods;
  let maxRelativeEnergyError = 0;
  let maxRelativeLinearMomentum = 0;
  let maxRelativeAngularMomentumError = 0;
  let maxRelativeBarycenterDisplacement = 0;
  let maxRelativePlaneDeviation = 0;

  expect(engine.start()).toBe(true);

  for (let stepIndex = 1; stepIndex <= totalSteps; stepIndex += 1) {
    if (!engine.advanceOneStep()) {
      throw new Error(
        `Binary integration stopped unexpectedly: ${engine.stopEvent?.message}`
      );
    }

    if (stepIndex % sampleEvery !== 0 && stepIndex !== totalSteps) {
      continue;
    }

    const diagnostics = engine.diagnostics();
    const energyError =
      Math.abs(diagnostics.totalEnergyJ - initialEnergy) /
      Math.abs(initialEnergy);
    const linearMomentumError =
      magnitudeVector3(diagnostics.linearMomentumKgMps) /
      characteristicMomentum;
    const angularMomentumError =
      Math.hypot(
        diagnostics.angularMomentumKgM2ps.x -
          initialDiagnostics.angularMomentumKgM2ps.x,
        diagnostics.angularMomentumKgM2ps.y -
          initialDiagnostics.angularMomentumKgM2ps.y,
        diagnostics.angularMomentumKgM2ps.z -
          initialDiagnostics.angularMomentumKgM2ps.z
      ) / initialAngularMomentum;
    const barycenterDisplacement =
      magnitudeVector3(diagnostics.centerOfMassM) /
      INCLINED_BINARY_SEPARATION_M;

    maxRelativeEnergyError = Math.max(
      maxRelativeEnergyError,
      energyError
    );
    maxRelativeLinearMomentum = Math.max(
      maxRelativeLinearMomentum,
      linearMomentumError
    );
    maxRelativeAngularMomentumError = Math.max(
      maxRelativeAngularMomentumError,
      angularMomentumError
    );
    maxRelativeBarycenterDisplacement = Math.max(
      maxRelativeBarycenterDisplacement,
      barycenterDisplacement
    );

    for (let bodyIndex = 0; bodyIndex < 2; bodyIndex += 1) {
      const offset = bodyIndex * 3;
      const planeDistance = Math.abs(
        engine.state.positionsM[offset] * INCLINED_BINARY_PLANE_NORMAL.x +
          engine.state.positionsM[offset + 1] *
            INCLINED_BINARY_PLANE_NORMAL.y +
          engine.state.positionsM[offset + 2] *
            INCLINED_BINARY_PLANE_NORMAL.z
      );
      maxRelativePlaneDeviation = Math.max(
        maxRelativePlaneDeviation,
        planeDistance / INCLINED_BINARY_SEPARATION_M
      );
    }
  }

  const expectedTimeSeconds = periods * INCLINED_BINARY_PERIOD_SECONDS;
  expect(
    Math.abs(engine.state.timeSeconds - expectedTimeSeconds) /
      expectedTimeSeconds
  ).toBeLessThan(1e-12);

  return {
    stepsPerPeriod,
    periods,
    maxRelativeEnergyError,
    maxRelativeLinearMomentum,
    maxRelativeAngularMomentumError,
    maxRelativeBarycenterDisplacement,
    maxRelativePlaneDeviation,
  };
}

describe("Velocity Verlet scientific behaviour", () => {
  it(
    "keeps the inclined binary within the initial acceptance targets",
    () => {
      const coarse = measureBinaryStability(1_024, 50);
      const reference = measureBinaryStability(2_048, 50);
      const fine = measureBinaryStability(4_096, 50);

      console.info(
        "BINARY_STABILITY_METRICS",
        JSON.stringify([coarse, reference, fine])
      );

      expect(reference.maxRelativeEnergyError).toBeLessThan(1e-4);
      expect(reference.maxRelativeLinearMomentum).toBeLessThan(1e-12);
      expect(reference.maxRelativeAngularMomentumError).toBeLessThan(1e-9);
      expect(reference.maxRelativeBarycenterDisplacement).toBeLessThan(1e-10);
      expect(reference.maxRelativePlaneDeviation).toBeLessThan(1e-10);
      expect(reference.maxRelativeEnergyError).toBeLessThan(
        coarse.maxRelativeEnergyError / 3
      );
      expect(fine.maxRelativeEnergyError).toBeLessThan(
        reference.maxRelativeEnergyError / 3
      );
    },
    30_000
  );

  it("is time-reversible within floating-point tolerance", () => {
    const engine = new SimulationEngine(createInclinedBinaryConfig());
    const initialPositions = engine.state.positionsM.slice();
    const initialVelocities = engine.state.velocitiesMps.slice();
    const steps = 4_096;

    engine.start();
    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      expect(engine.advanceOneStep()).toBe(true);
    }

    for (
      let vectorIndex = 0;
      vectorIndex < engine.state.velocitiesMps.length;
      vectorIndex += 1
    ) {
      engine.state.velocitiesMps[vectorIndex] *= -1;
    }

    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      expect(engine.advanceOneStep()).toBe(true);
    }

    for (let index = 0; index < initialPositions.length; index += 1) {
      expect(
        Math.abs(engine.state.positionsM[index] - initialPositions[index]) /
          INCLINED_BINARY_SEPARATION_M
      ).toBeLessThan(1e-11);
      expect(
        Math.abs(
          engine.state.velocitiesMps[index] + initialVelocities[index]
        ) /
          Math.max(Math.abs(initialVelocities[index]), 1)
      ).toBeLessThan(1e-10);
    }
  });
});
