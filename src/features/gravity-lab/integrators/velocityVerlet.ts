import type {
  EncounterThresholds,
  IntegratorStepResult,
  NewtonianState,
} from "../core/types";
import { detectEncounterAcrossStep } from "../physics/encounters";

export type AccelerationEvaluator = (
  massesKg: Float64Array,
  positionsM: Float64Array,
  outputAccelerationsMps2: Float64Array
) => void;

export type VelocityVerletWorkspace = Readonly<{
  candidatePositionsM: Float64Array;
  halfStepVelocitiesMps: Float64Array;
  candidateVelocitiesMps: Float64Array;
  candidateAccelerationsMps2: Float64Array;
}>;

export function createVelocityVerletWorkspace(
  bodyCount: number
): VelocityVerletWorkspace {
  const vectorLength = bodyCount * 3;

  return {
    candidatePositionsM: new Float64Array(vectorLength),
    halfStepVelocitiesMps: new Float64Array(vectorLength),
    candidateVelocitiesMps: new Float64Array(vectorLength),
    candidateAccelerationsMps2: new Float64Array(vectorLength),
  };
}

function assertFiniteBuffer(values: Float64Array, label: string): void {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${label} contains a non-finite value.`);
    }
  }
}

export function stepVelocityVerlet(
  state: NewtonianState,
  timeStepSeconds: number,
  thresholds: EncounterThresholds,
  accelerationEvaluator: AccelerationEvaluator,
  workspace: VelocityVerletWorkspace
): IntegratorStepResult {
  const vectorLength = state.positionsM.length;

  if (
    workspace.candidatePositionsM.length !== vectorLength ||
    workspace.halfStepVelocitiesMps.length !== vectorLength ||
    workspace.candidateVelocitiesMps.length !== vectorLength ||
    workspace.candidateAccelerationsMps2.length !== vectorLength
  ) {
    throw new RangeError(
      "Velocity Verlet workspace does not match the simulation state."
    );
  }

  const halfTimeStep = timeStepSeconds * 0.5;

  for (let bodyIndex = 0; bodyIndex < state.massesKg.length; bodyIndex += 1) {
    const offset = bodyIndex * 3;

    for (let axis = 0; axis < 3; axis += 1) {
      const vectorIndex = offset + axis;

      if (state.fixed[bodyIndex] === 1) {
        workspace.halfStepVelocitiesMps[vectorIndex] = 0;
        workspace.candidatePositionsM[vectorIndex] =
          state.positionsM[vectorIndex];
        continue;
      }

      const halfStepVelocity =
        state.velocitiesMps[vectorIndex] +
        state.accelerationsMps2[vectorIndex] * halfTimeStep;
      workspace.halfStepVelocitiesMps[vectorIndex] = halfStepVelocity;
      workspace.candidatePositionsM[vectorIndex] =
        state.positionsM[vectorIndex] +
        halfStepVelocity * timeStepSeconds;
    }
  }

  const encounter = detectEncounterAcrossStep(
    state.positionsM,
    workspace.candidatePositionsM,
    state.massesKg,
    state.physicalRadiiM,
    state.fixed,
    timeStepSeconds,
    thresholds
  );

  if (encounter !== null) {
    return { advanced: false, encounter };
  }

  accelerationEvaluator(
    state.massesKg,
    workspace.candidatePositionsM,
    workspace.candidateAccelerationsMps2
  );

  for (let bodyIndex = 0; bodyIndex < state.massesKg.length; bodyIndex += 1) {
    const offset = bodyIndex * 3;

    for (let axis = 0; axis < 3; axis += 1) {
      const vectorIndex = offset + axis;

      workspace.candidateVelocitiesMps[vectorIndex] =
        state.fixed[bodyIndex] === 1
          ? 0
          : workspace.halfStepVelocitiesMps[vectorIndex] +
            workspace.candidateAccelerationsMps2[vectorIndex] * halfTimeStep;
    }
  }

  assertFiniteBuffer(workspace.candidatePositionsM, "Candidate positions");
  assertFiniteBuffer(workspace.candidateVelocitiesMps, "Candidate velocities");
  assertFiniteBuffer(
    workspace.candidateAccelerationsMps2,
    "Candidate accelerations"
  );

  state.positionsM.set(workspace.candidatePositionsM);
  state.velocitiesMps.set(workspace.candidateVelocitiesMps);
  state.accelerationsMps2.set(workspace.candidateAccelerationsMps2);
  state.stepCount += 1;
  state.timeSeconds = state.stepCount * timeStepSeconds;

  return { advanced: true };
}
