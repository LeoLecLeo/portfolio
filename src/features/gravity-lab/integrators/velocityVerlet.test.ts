import { describe, expect, it } from "vitest";

import type {
  NewtonianSimulationConfig,
  NewtonianState,
} from "../core/types";
import { magnitudeVector3 } from "../core/vector3";
import {
  createEncounterInspectionWorkspace,
  inspectEncounterAcrossStep,
  type EncounterInspectionWorkspace,
} from "../physics/encounters";
import { computeNewtonianDiagnostics } from "../physics/diagnostics";
import { computeNewtonianAccelerations } from "../physics/newtonian";
import {
  createInclinedBinaryConfig,
  INCLINED_BINARY_PERIOD_SECONDS,
  INCLINED_BINARY_PLANE_NORMAL,
  INCLINED_BINARY_SEPARATION_M,
} from "../presets/inclinedBinary";
import {
  assertFiniteFloat64Buffer,
  commitVelocityVerletCandidate,
  completeVelocityVerletCandidate,
  createVelocityVerletWorkspace,
  findFirstNonFiniteFloat64Index,
  prepareVelocityVerletDrift,
  type VelocityVerletWorkspace,
} from "./velocityVerlet";

type StabilityMetrics = Readonly<{
  stepsPerPeriod: number;
  periods: number;
  maxRelativeEnergyError: number;
  maxRelativeLinearMomentum: number;
  maxRelativeAngularMomentumError: number;
  maxRelativeBarycenterDisplacement: number;
  maxRelativePlaneDeviation: number;
}>;

function createSingleBodyState(): NewtonianState {
  return {
    bodyIds: ["test-body"],
    massesKg: new Float64Array([1]),
    physicalRadiiM: new Float64Array([0]),
    fixed: new Uint8Array([0]),
    positionsM: new Float64Array([1, 2, 3]),
    velocitiesMps: new Float64Array([4, 5, 6]),
    accelerationsMps2: new Float64Array([0, 0, 0]),
    stepCount: 0,
    timeSeconds: 0,
  };
}

type TestIntegration = {
  readonly config: NewtonianSimulationConfig;
  readonly state: NewtonianState;
  readonly velocityVerletWorkspace: VelocityVerletWorkspace;
  readonly encounterWorkspace: EncounterInspectionWorkspace;
};

function createTestIntegration(
  config: NewtonianSimulationConfig
): TestIntegration {
  const bodyCount = config.bodies.length;
  const vectorLength = bodyCount * 3;
  const state: NewtonianState = {
    bodyIds: config.bodies.map((body) => body.id),
    massesKg: new Float64Array(bodyCount),
    physicalRadiiM: new Float64Array(bodyCount),
    fixed: new Uint8Array(bodyCount),
    positionsM: new Float64Array(vectorLength),
    velocitiesMps: new Float64Array(vectorLength),
    accelerationsMps2: new Float64Array(vectorLength),
    stepCount: 0,
    timeSeconds: 0,
  };

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    const body = config.bodies[bodyIndex];
    const offset = bodyIndex * 3;

    state.massesKg[bodyIndex] = body.massKg;
    state.physicalRadiiM[bodyIndex] = body.physicalRadiusM;
    state.fixed[bodyIndex] = body.fixed ? 1 : 0;
    state.positionsM[offset] = body.initialPositionM.x;
    state.positionsM[offset + 1] = body.initialPositionM.y;
    state.positionsM[offset + 2] = body.initialPositionM.z;
    state.velocitiesMps[offset] = body.initialVelocityMps.x;
    state.velocitiesMps[offset + 1] = body.initialVelocityMps.y;
    state.velocitiesMps[offset + 2] = body.initialVelocityMps.z;
  }

  computeNewtonianAccelerations(
    state.massesKg,
    state.positionsM,
    state.accelerationsMps2
  );

  return {
    config,
    state,
    velocityVerletWorkspace: createVelocityVerletWorkspace(bodyCount),
    encounterWorkspace: createEncounterInspectionWorkspace(),
  };
}

function advanceTestIntegration(integration: TestIntegration): boolean {
  const { config, state, velocityVerletWorkspace, encounterWorkspace } =
    integration;

  prepareVelocityVerletDrift(
    state,
    config.timeStepSeconds,
    velocityVerletWorkspace
  );
  assertFiniteFloat64Buffer(
    velocityVerletWorkspace.candidatePositionsM,
    "Candidate positions"
  );

  inspectEncounterAcrossStep(
    state.positionsM,
    velocityVerletWorkspace.candidatePositionsM,
    state.massesKg,
    state.physicalRadiiM,
    state.fixed,
    config.timeStepSeconds,
    config.encounterThresholds,
    encounterWorkspace
  );

  if (encounterWorkspace.kind !== "none") {
    return false;
  }

  completeVelocityVerletCandidate(
    state,
    config.timeStepSeconds,
    computeNewtonianAccelerations,
    velocityVerletWorkspace
  );
  assertFiniteFloat64Buffer(
    velocityVerletWorkspace.candidateVelocitiesMps,
    "Candidate velocities"
  );
  assertFiniteFloat64Buffer(
    velocityVerletWorkspace.candidateAccelerationsMps2,
    "Candidate accelerations"
  );
  commitVelocityVerletCandidate(
    state,
    config.timeStepSeconds,
    velocityVerletWorkspace
  );

  return true;
}

function measureBinaryStability(
  stepsPerPeriod: number,
  periods: number
): StabilityMetrics {
  const integration = createTestIntegration(
    createInclinedBinaryConfig(stepsPerPeriod)
  );
  const { state } = integration;
  const initialDiagnostics = computeNewtonianDiagnostics(state);
  const initialEnergy = initialDiagnostics.totalEnergyJ;
  const initialAngularMomentum = magnitudeVector3(
    initialDiagnostics.angularMomentumKgM2ps
  );
  let characteristicMomentum = 0;

  for (let bodyIndex = 0; bodyIndex < state.massesKg.length; bodyIndex += 1) {
    const offset = bodyIndex * 3;
    characteristicMomentum +=
      state.massesKg[bodyIndex] *
      Math.hypot(
        state.velocitiesMps[offset],
        state.velocitiesMps[offset + 1],
        state.velocitiesMps[offset + 2]
      );
  }

  const sampleEvery = Math.max(1, Math.floor(stepsPerPeriod / 128));
  const totalSteps = stepsPerPeriod * periods;
  let maxRelativeEnergyError = 0;
  let maxRelativeLinearMomentum = 0;
  let maxRelativeAngularMomentumError = 0;
  let maxRelativeBarycenterDisplacement = 0;
  let maxRelativePlaneDeviation = 0;

  for (let stepIndex = 1; stepIndex <= totalSteps; stepIndex += 1) {
    if (!advanceTestIntegration(integration)) {
      throw new Error(
        `Binary integration stopped unexpectedly: ${integration.encounterWorkspace.kind}`
      );
    }

    if (stepIndex % sampleEvery !== 0 && stepIndex !== totalSteps) {
      continue;
    }

    const diagnostics = computeNewtonianDiagnostics(state);
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
        state.positionsM[offset] * INCLINED_BINARY_PLANE_NORMAL.x +
          state.positionsM[offset + 1] *
            INCLINED_BINARY_PLANE_NORMAL.y +
          state.positionsM[offset + 2] *
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
    Math.abs(state.timeSeconds - expectedTimeSeconds) /
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
  it("prepares a complete candidate without mutating state before commit", () => {
    const state = createSingleBodyState();
    const workspace = createVelocityVerletWorkspace(1);
    const initialPositions = state.positionsM.slice();
    const initialVelocities = state.velocitiesMps.slice();
    const initialAccelerations = state.accelerationsMps2.slice();

    prepareVelocityVerletDrift(state, 0.5, workspace);
    expect(Array.from(workspace.candidatePositionsM)).toEqual([3, 4.5, 6]);
    expect(Array.from(state.positionsM)).toEqual(
      Array.from(initialPositions)
    );

    completeVelocityVerletCandidate(
      state,
      0.5,
      (_masses, _positions, output) => {
        output.set([2, 4, 6]);
      },
      workspace
    );

    expect(Array.from(workspace.candidateVelocitiesMps)).toEqual([
      4.5, 6, 7.5,
    ]);
    expect(Array.from(state.positionsM)).toEqual(
      Array.from(initialPositions)
    );
    expect(Array.from(state.velocitiesMps)).toEqual(
      Array.from(initialVelocities)
    );
    expect(Array.from(state.accelerationsMps2)).toEqual(
      Array.from(initialAccelerations)
    );
    expect(state.stepCount).toBe(0);
    expect(state.timeSeconds).toBe(0);

    commitVelocityVerletCandidate(state, 0.5, workspace);

    expect(Array.from(state.positionsM)).toEqual([3, 4.5, 6]);
    expect(Array.from(state.velocitiesMps)).toEqual([4.5, 6, 7.5]);
    expect(Array.from(state.accelerationsMps2)).toEqual([2, 4, 6]);
    expect(state.stepCount).toBe(1);
    expect(state.timeSeconds).toBe(0.5);
  });

  it("keeps fixed bodies stationary throughout candidate preparation", () => {
    const state = createSingleBodyState();
    state.fixed[0] = 1;
    state.velocitiesMps.fill(0);
    const workspace = createVelocityVerletWorkspace(1);

    prepareVelocityVerletDrift(state, 1, workspace);
    completeVelocityVerletCandidate(
      state,
      1,
      (_masses, _positions, output) => {
        output.set([100, 200, 300]);
      },
      workspace
    );

    expect(Array.from(workspace.candidatePositionsM)).toEqual([1, 2, 3]);
    expect(Array.from(workspace.candidateVelocitiesMps)).toEqual([0, 0, 0]);
  });

  it("exposes allocation-free finite-buffer and shape checks", () => {
    expect(
      findFirstNonFiniteFloat64Index(new Float64Array([1, 2, 3]))
    ).toBe(-1);
    expect(
      findFirstNonFiniteFloat64Index(
        new Float64Array([1, Number.POSITIVE_INFINITY, 3])
      )
    ).toBe(1);
    expect(() =>
      assertFiniteFloat64Buffer(
        new Float64Array([1, Number.NaN, 3]),
        "Candidate positions"
      )
    ).toThrow(/index 1/);
    expect(() => createVelocityVerletWorkspace(0)).toThrow(
      /positive integer/
    );

    const state = createSingleBodyState();
    const wrongWorkspace = createVelocityVerletWorkspace(2);
    expect(() =>
      prepareVelocityVerletDrift(state, 1, wrongWorkspace)
    ).toThrow(/does not match/);
  });

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
    const integration = createTestIntegration(createInclinedBinaryConfig());
    const { state } = integration;
    const initialPositions = state.positionsM.slice();
    const initialVelocities = state.velocitiesMps.slice();
    const steps = 4_096;

    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      expect(advanceTestIntegration(integration)).toBe(true);
    }

    for (
      let vectorIndex = 0;
      vectorIndex < state.velocitiesMps.length;
      vectorIndex += 1
    ) {
      state.velocitiesMps[vectorIndex] *= -1;
    }

    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      expect(advanceTestIntegration(integration)).toBe(true);
    }

    for (let index = 0; index < initialPositions.length; index += 1) {
      expect(
        Math.abs(state.positionsM[index] - initialPositions[index]) /
          INCLINED_BINARY_SEPARATION_M
      ).toBeLessThan(1e-11);
      expect(
        Math.abs(
          state.velocitiesMps[index] + initialVelocities[index]
        ) /
          Math.max(Math.abs(initialVelocities[index]), 1)
      ).toBeLessThan(1e-10);
    }
  });
});
