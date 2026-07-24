import type { NewtonianState } from "../core/types";

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
  if (!Number.isInteger(bodyCount) || bodyCount < 1) {
    throw new RangeError(
      "Velocity Verlet body count must be a positive integer."
    );
  }

  const vectorLength = bodyCount * 3;

  return {
    candidatePositionsM: new Float64Array(vectorLength),
    halfStepVelocitiesMps: new Float64Array(vectorLength),
    candidateVelocitiesMps: new Float64Array(vectorLength),
    candidateAccelerationsMps2: new Float64Array(vectorLength),
  };
}

export function assertVelocityVerletWorkspaceMatchesState(
  state: NewtonianState,
  workspace: VelocityVerletWorkspace
): void {
  const bodyCount = state.massesKg.length;
  const vectorLength = bodyCount * 3;

  if (
    state.fixed.length !== bodyCount ||
    state.positionsM.length !== vectorLength ||
    state.velocitiesMps.length !== vectorLength ||
    state.accelerationsMps2.length !== vectorLength ||
    workspace.candidatePositionsM.length !== vectorLength ||
    workspace.halfStepVelocitiesMps.length !== vectorLength ||
    workspace.candidateVelocitiesMps.length !== vectorLength ||
    workspace.candidateAccelerationsMps2.length !== vectorLength
  ) {
    throw new RangeError(
      "Velocity Verlet workspace does not match the simulation state."
    );
  }
}

export function findFirstNonFiniteFloat64Index(
  values: Float64Array
): number {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      return index;
    }
  }

  return -1;
}

export function assertFiniteFloat64Buffer(
  values: Float64Array,
  label: string
): void {
  const invalidIndex = findFirstNonFiniteFloat64Index(values);

  if (invalidIndex !== -1) {
    throw new RangeError(
      `${label} contains a non-finite value at index ${invalidIndex}.`
    );
  }
}

function assertPositiveFiniteTimeStep(timeStepSeconds: number): void {
  if (!Number.isFinite(timeStepSeconds) || timeStepSeconds <= 0) {
    throw new RangeError(
      "Velocity Verlet time step must be finite and greater than zero."
    );
  }
}

export function prepareVelocityVerletDrift(
  state: NewtonianState,
  timeStepSeconds: number,
  workspace: VelocityVerletWorkspace
): void {
  assertPositiveFiniteTimeStep(timeStepSeconds);
  assertVelocityVerletWorkspaceMatchesState(state, workspace);

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
}

export function completeVelocityVerletCandidate(
  state: NewtonianState,
  timeStepSeconds: number,
  accelerationEvaluator: AccelerationEvaluator,
  workspace: VelocityVerletWorkspace
): void {
  assertPositiveFiniteTimeStep(timeStepSeconds);
  assertVelocityVerletWorkspaceMatchesState(state, workspace);

  accelerationEvaluator(
    state.massesKg,
    workspace.candidatePositionsM,
    workspace.candidateAccelerationsMps2
  );

  const halfTimeStep = timeStepSeconds * 0.5;

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
}

export function commitVelocityVerletCandidate(
  state: NewtonianState,
  timeStepSeconds: number,
  workspace: VelocityVerletWorkspace
): void {
  assertPositiveFiniteTimeStep(timeStepSeconds);
  assertVelocityVerletWorkspaceMatchesState(state, workspace);

  state.positionsM.set(workspace.candidatePositionsM);
  state.velocitiesMps.set(workspace.candidateVelocitiesMps);
  state.accelerationsMps2.set(workspace.candidateAccelerationsMps2);
  state.stepCount += 1;
  state.timeSeconds = state.stepCount * timeStepSeconds;
}
