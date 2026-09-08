import { MAX_NEWTONIAN_BODIES } from "../core/types";

export type PhaseSpaceAccelerationEvaluator = (
  massesKg: Float64Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array,
  outputAccelerationsMps2: Float64Array
) => void;

export type FixedStepRk4Workspace = Readonly<{
  stagePositionsM: Float64Array;
  stageVelocitiesMps: Float64Array;
  k1PositionDerivativesMps: Float64Array;
  k1VelocityDerivativesMps2: Float64Array;
  k2PositionDerivativesMps: Float64Array;
  k2VelocityDerivativesMps2: Float64Array;
  k3PositionDerivativesMps: Float64Array;
  k3VelocityDerivativesMps2: Float64Array;
  k4PositionDerivativesMps: Float64Array;
  k4VelocityDerivativesMps2: Float64Array;
  candidatePositionsM: Float64Array;
  candidateVelocitiesMps: Float64Array;
}>;

function createVectorBuffer(vectorLength: number): Float64Array {
  return new Float64Array(vectorLength);
}

export function createFixedStepRk4Workspace(
  bodyCount: number
): FixedStepRk4Workspace {
  if (
    !Number.isInteger(bodyCount) ||
    bodyCount < 1 ||
    bodyCount > MAX_NEWTONIAN_BODIES
  ) {
    throw new RangeError(
      `RK4 body count must be an integer between 1 and ${MAX_NEWTONIAN_BODIES}.`
    );
  }

  const vectorLength = bodyCount * 3;

  return {
    stagePositionsM: createVectorBuffer(vectorLength),
    stageVelocitiesMps: createVectorBuffer(vectorLength),
    k1PositionDerivativesMps: createVectorBuffer(vectorLength),
    k1VelocityDerivativesMps2: createVectorBuffer(vectorLength),
    k2PositionDerivativesMps: createVectorBuffer(vectorLength),
    k2VelocityDerivativesMps2: createVectorBuffer(vectorLength),
    k3PositionDerivativesMps: createVectorBuffer(vectorLength),
    k3VelocityDerivativesMps2: createVectorBuffer(vectorLength),
    k4PositionDerivativesMps: createVectorBuffer(vectorLength),
    k4VelocityDerivativesMps2: createVectorBuffer(vectorLength),
    candidatePositionsM: createVectorBuffer(vectorLength),
    candidateVelocitiesMps: createVectorBuffer(vectorLength),
  };
}

function assertFiniteBuffer(values: Float64Array, label: string): void {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      throw new RangeError(
        `${label} contains a non-finite value at index ${index}.`
      );
    }
  }
}

function assertCompatibleInputs(
  massesKg: Float64Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array,
  timeStepSeconds: number,
  workspace: FixedStepRk4Workspace
): void {
  const bodyCount = massesKg.length;
  const vectorLength = bodyCount * 3;

  if (bodyCount < 1 || bodyCount > MAX_NEWTONIAN_BODIES) {
    throw new RangeError(
      `RK4 requires between 1 and ${MAX_NEWTONIAN_BODIES} bodies.`
    );
  }

  if (!Number.isFinite(timeStepSeconds) || timeStepSeconds <= 0) {
    throw new RangeError("RK4 time step must be finite and strictly positive.");
  }

  if (
    positionsM.length !== vectorLength ||
    velocitiesMps.length !== vectorLength
  ) {
    throw new RangeError(
      "RK4 mass, position, and velocity buffers describe different body counts."
    );
  }

  if (
    workspace.stagePositionsM.length !== vectorLength ||
    workspace.stageVelocitiesMps.length !== vectorLength ||
    workspace.k1PositionDerivativesMps.length !== vectorLength ||
    workspace.k1VelocityDerivativesMps2.length !== vectorLength ||
    workspace.k2PositionDerivativesMps.length !== vectorLength ||
    workspace.k2VelocityDerivativesMps2.length !== vectorLength ||
    workspace.k3PositionDerivativesMps.length !== vectorLength ||
    workspace.k3VelocityDerivativesMps2.length !== vectorLength ||
    workspace.k4PositionDerivativesMps.length !== vectorLength ||
    workspace.k4VelocityDerivativesMps2.length !== vectorLength ||
    workspace.candidatePositionsM.length !== vectorLength ||
    workspace.candidateVelocitiesMps.length !== vectorLength
  ) {
    throw new RangeError("RK4 workspace does not match the phase-space state.");
  }

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    if (!Number.isFinite(massesKg[bodyIndex]) || massesKg[bodyIndex] <= 0) {
      throw new RangeError(
        `RK4 mass at body index ${bodyIndex} must be finite and strictly positive.`
      );
    }
  }

  assertFiniteBuffer(positionsM, "RK4 positions");
  assertFiniteBuffer(velocitiesMps, "RK4 velocities");
}

function evaluateAccelerationStage(
  accelerationEvaluator: PhaseSpaceAccelerationEvaluator,
  massesKg: Float64Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array,
  outputAccelerationsMps2: Float64Array,
  label: string
): void {
  accelerationEvaluator(
    massesKg,
    positionsM,
    velocitiesMps,
    outputAccelerationsMps2
  );
  assertFiniteBuffer(outputAccelerationsMps2, label);
}

/**
 * Prepares one classical fixed RK4 candidate for y = (x, v), with
 * dx/dt = v and dv/dt = a(x, v). Inputs are never mutated and the function
 * performs no allocation after workspace creation.
 */
export function prepareFixedStepRk4Candidate(
  massesKg: Float64Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array,
  timeStepSeconds: number,
  accelerationEvaluator: PhaseSpaceAccelerationEvaluator,
  workspace: FixedStepRk4Workspace
): void {
  assertCompatibleInputs(
    massesKg,
    positionsM,
    velocitiesMps,
    timeStepSeconds,
    workspace
  );

  const halfTimeStep = timeStepSeconds * 0.5;
  const sixthTimeStep = timeStepSeconds / 6;
  workspace.k1PositionDerivativesMps.set(velocitiesMps);
  evaluateAccelerationStage(
    accelerationEvaluator,
    massesKg,
    positionsM,
    velocitiesMps,
    workspace.k1VelocityDerivativesMps2,
    "RK4 k1 acceleration"
  );

  for (let index = 0; index < positionsM.length; index += 1) {
    workspace.stagePositionsM[index] =
      positionsM[index] +
      halfTimeStep * workspace.k1PositionDerivativesMps[index];
    workspace.stageVelocitiesMps[index] =
      velocitiesMps[index] +
      halfTimeStep * workspace.k1VelocityDerivativesMps2[index];
  }

  assertFiniteBuffer(workspace.stagePositionsM, "RK4 k2 positions");
  assertFiniteBuffer(workspace.stageVelocitiesMps, "RK4 k2 velocities");
  workspace.k2PositionDerivativesMps.set(workspace.stageVelocitiesMps);
  evaluateAccelerationStage(
    accelerationEvaluator,
    massesKg,
    workspace.stagePositionsM,
    workspace.stageVelocitiesMps,
    workspace.k2VelocityDerivativesMps2,
    "RK4 k2 acceleration"
  );

  for (let index = 0; index < positionsM.length; index += 1) {
    workspace.stagePositionsM[index] =
      positionsM[index] +
      halfTimeStep * workspace.k2PositionDerivativesMps[index];
    workspace.stageVelocitiesMps[index] =
      velocitiesMps[index] +
      halfTimeStep * workspace.k2VelocityDerivativesMps2[index];
  }

  assertFiniteBuffer(workspace.stagePositionsM, "RK4 k3 positions");
  assertFiniteBuffer(workspace.stageVelocitiesMps, "RK4 k3 velocities");
  workspace.k3PositionDerivativesMps.set(workspace.stageVelocitiesMps);
  evaluateAccelerationStage(
    accelerationEvaluator,
    massesKg,
    workspace.stagePositionsM,
    workspace.stageVelocitiesMps,
    workspace.k3VelocityDerivativesMps2,
    "RK4 k3 acceleration"
  );

  for (let index = 0; index < positionsM.length; index += 1) {
    workspace.stagePositionsM[index] =
      positionsM[index] +
      timeStepSeconds * workspace.k3PositionDerivativesMps[index];
    workspace.stageVelocitiesMps[index] =
      velocitiesMps[index] +
      timeStepSeconds * workspace.k3VelocityDerivativesMps2[index];
  }

  assertFiniteBuffer(workspace.stagePositionsM, "RK4 k4 positions");
  assertFiniteBuffer(workspace.stageVelocitiesMps, "RK4 k4 velocities");
  workspace.k4PositionDerivativesMps.set(workspace.stageVelocitiesMps);
  evaluateAccelerationStage(
    accelerationEvaluator,
    massesKg,
    workspace.stagePositionsM,
    workspace.stageVelocitiesMps,
    workspace.k4VelocityDerivativesMps2,
    "RK4 k4 acceleration"
  );

  for (let index = 0; index < positionsM.length; index += 1) {
    workspace.candidatePositionsM[index] =
      positionsM[index] +
      sixthTimeStep *
        (workspace.k1PositionDerivativesMps[index] +
          2 * workspace.k2PositionDerivativesMps[index] +
          2 * workspace.k3PositionDerivativesMps[index] +
          workspace.k4PositionDerivativesMps[index]);
    workspace.candidateVelocitiesMps[index] =
      velocitiesMps[index] +
      sixthTimeStep *
        (workspace.k1VelocityDerivativesMps2[index] +
          2 * workspace.k2VelocityDerivativesMps2[index] +
          2 * workspace.k3VelocityDerivativesMps2[index] +
          workspace.k4VelocityDerivativesMps2[index]);
  }

  assertFiniteBuffer(workspace.candidatePositionsM, "RK4 candidate positions");
  assertFiniteBuffer(
    workspace.candidateVelocitiesMps,
    "RK4 candidate velocities"
  );
}
