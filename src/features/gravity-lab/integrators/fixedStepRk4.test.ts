import { describe, expect, it } from "vitest";

import {
  createFixedStepRk4Workspace,
  prepareFixedStepRk4Candidate,
  type PhaseSpaceAccelerationEvaluator,
} from "./fixedStepRk4";

const CONSTANT_ACCELERATION: PhaseSpaceAccelerationEvaluator = (
  _massesKg,
  _positionsM,
  _velocitiesMps,
  outputAccelerationsMps2
) => {
  outputAccelerationsMps2[0] = 1.25;
  outputAccelerationsMps2[1] = -0.5;
  outputAccelerationsMps2[2] = 2;
};

function integrateHarmonicOscillator(timeStepSeconds: number): {
  position: number;
  velocity: number;
} {
  const angularFrequencyPerSecond = 0.4;
  const durationSeconds = 10;
  const stepCount = Math.round(durationSeconds / timeStepSeconds);
  const masses = new Float64Array([1]);
  const positions = new Float64Array([1, 0, 0]);
  const velocities = new Float64Array([0, 0, 0]);
  const workspace = createFixedStepRk4Workspace(1);
  const evaluator: PhaseSpaceAccelerationEvaluator = (
    _massesKg,
    stagePositionsM,
    _stageVelocitiesMps,
    outputAccelerationsMps2
  ) => {
    outputAccelerationsMps2[0] =
      -angularFrequencyPerSecond *
      angularFrequencyPerSecond *
      stagePositionsM[0];
    outputAccelerationsMps2[1] = 0;
    outputAccelerationsMps2[2] = 0;
  };

  for (let step = 0; step < stepCount; step += 1) {
    prepareFixedStepRk4Candidate(
      masses,
      positions,
      velocities,
      timeStepSeconds,
      evaluator,
      workspace
    );
    positions.set(workspace.candidatePositionsM);
    velocities.set(workspace.candidateVelocitiesMps);
  }

  return { position: positions[0], velocity: velocities[0] };
}

describe("fixed-step phase-space RK4", () => {
  it("is exact for constant acceleration up to floating-point rounding", () => {
    const masses = new Float64Array([1]);
    const positions = new Float64Array([3, -2, 5]);
    const velocities = new Float64Array([4, 1, -3]);
    const workspace = createFixedStepRk4Workspace(1);
    const timeStepSeconds = 2;

    prepareFixedStepRk4Candidate(
      masses,
      positions,
      velocities,
      timeStepSeconds,
      CONSTANT_ACCELERATION,
      workspace
    );

    expect(Array.from(workspace.candidatePositionsM)).toEqual([
      13.5,
      -1,
      3,
    ]);
    expect(Array.from(workspace.candidateVelocitiesMps)).toEqual([
      6.5,
      0,
      1,
    ]);
  });

  it("shows fourth-order convergence against the harmonic oscillator solution", () => {
    const angularFrequencyPerSecond = 0.4;
    const durationSeconds = 10;
    const expectedPosition = Math.cos(
      angularFrequencyPerSecond * durationSeconds
    );
    const expectedVelocity =
      -angularFrequencyPerSecond *
      Math.sin(angularFrequencyPerSecond * durationSeconds);
    const timeSteps = [0.5, 0.25, 0.125, 0.0625];
    const errors = timeSteps.map((timeStepSeconds) => {
      const result = integrateHarmonicOscillator(timeStepSeconds);
      return Math.hypot(
        result.position - expectedPosition,
        (result.velocity - expectedVelocity) /
          angularFrequencyPerSecond
      );
    });

    for (let index = 0; index < errors.length - 1; index += 1) {
      const ratio = errors[index] / errors[index + 1];
      expect(ratio).toBeGreaterThan(15);
      expect(ratio).toBeLessThan(17);
    }
  });

  it("is deterministic and does not mutate its inputs", () => {
    const masses = new Float64Array([2]);
    const positions = new Float64Array([3, -2, 5]);
    const velocities = new Float64Array([4, 1, -3]);
    const massesBefore = masses.slice();
    const positionsBefore = positions.slice();
    const velocitiesBefore = velocities.slice();
    const firstWorkspace = createFixedStepRk4Workspace(1);
    const secondWorkspace = createFixedStepRk4Workspace(1);

    prepareFixedStepRk4Candidate(
      masses,
      positions,
      velocities,
      0.25,
      CONSTANT_ACCELERATION,
      firstWorkspace
    );
    prepareFixedStepRk4Candidate(
      masses,
      positions,
      velocities,
      0.25,
      CONSTANT_ACCELERATION,
      secondWorkspace
    );

    expect(firstWorkspace.candidatePositionsM).toEqual(
      secondWorkspace.candidatePositionsM
    );
    expect(firstWorkspace.candidateVelocitiesMps).toEqual(
      secondWorkspace.candidateVelocitiesMps
    );
    expect(masses).toEqual(massesBefore);
    expect(positions).toEqual(positionsBefore);
    expect(velocities).toEqual(velocitiesBefore);
  });

  it("rejects non-finite stages and leaves the current state unchanged", () => {
    const masses = new Float64Array([1]);
    const positions = new Float64Array([1, 2, 3]);
    const velocities = new Float64Array([4, 5, 6]);
    const positionsBefore = positions.slice();
    const velocitiesBefore = velocities.slice();
    const workspace = createFixedStepRk4Workspace(1);
    const invalidEvaluator: PhaseSpaceAccelerationEvaluator = (
      _massesKg,
      _positionsM,
      _velocitiesMps,
      outputAccelerationsMps2
    ) => {
      outputAccelerationsMps2.fill(Number.NaN);
    };

    expect(() =>
      prepareFixedStepRk4Candidate(
        masses,
        positions,
        velocities,
        1,
        invalidEvaluator,
        workspace
      )
    ).toThrow(/non-finite/);
    expect(positions).toEqual(positionsBefore);
    expect(velocities).toEqual(velocitiesBefore);
  });

  it("validates body count, time step, and workspace dimensions", () => {
    expect(() => createFixedStepRk4Workspace(0)).toThrow(/between 1 and 16/);
    expect(() => createFixedStepRk4Workspace(17)).toThrow(/between 1 and 16/);

    expect(() =>
      prepareFixedStepRk4Candidate(
        new Float64Array([1]),
        new Float64Array(3),
        new Float64Array(3),
        0,
        CONSTANT_ACCELERATION,
        createFixedStepRk4Workspace(1)
      )
    ).toThrow(/strictly positive/);

    expect(() =>
      prepareFixedStepRk4Candidate(
        new Float64Array([1]),
        new Float64Array(3),
        new Float64Array(3),
        1,
        CONSTANT_ACCELERATION,
        createFixedStepRk4Workspace(2)
      )
    ).toThrow(/does not match/);
  });
});
