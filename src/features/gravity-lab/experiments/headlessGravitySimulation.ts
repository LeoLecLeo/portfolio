import { MAX_NEWTONIAN_BODIES } from "../core/types";
import {
  createFixedStepRk4Workspace,
  prepareFixedStepRk4Candidate,
  type FixedStepRk4Workspace,
  type PhaseSpaceAccelerationEvaluator,
} from "../integrators/fixedStepRk4";
import { computeFirstPostNewtonianAccelerations } from "../physics/firstPostNewtonian";
import { computeNewtonianAccelerations } from "../physics/newtonian";
import type { GravityModelId } from "../physics/gravityModel";

export type HeadlessGravityModel = GravityModelId;

export type HeadlessGravityInitialState = Readonly<{
  massesKg: Float64Array;
  positionsM: Float64Array;
  velocitiesMps: Float64Array;
}>;

export type HeadlessGravitySimulationOptions = Readonly<{
  model: HeadlessGravityModel;
  timeStepSeconds: number;
  initialState: HeadlessGravityInitialState;
}>;

const NEWTONIAN_PHASE_SPACE_EVALUATOR: PhaseSpaceAccelerationEvaluator = (
  massesKg,
  positionsM,
  _velocitiesMps,
  outputAccelerationsMps2
) => {
  computeNewtonianAccelerations(
    massesKg,
    positionsM,
    outputAccelerationsMps2
  );
};

function evaluatorForModel(
  model: HeadlessGravityModel
): PhaseSpaceAccelerationEvaluator {
  return model === "newtonian"
    ? NEWTONIAN_PHASE_SPACE_EVALUATOR
    : computeFirstPostNewtonianAccelerations;
}

function assertInitialState(
  initialState: HeadlessGravityInitialState,
  timeStepSeconds: number
): void {
  const bodyCount = initialState.massesKg.length;

  if (
    bodyCount < 1 ||
    bodyCount > MAX_NEWTONIAN_BODIES ||
    initialState.positionsM.length !== bodyCount * 3 ||
    initialState.velocitiesMps.length !== bodyCount * 3
  ) {
    throw new RangeError(
      `Headless simulation requires matching buffers for 1 to ${MAX_NEWTONIAN_BODIES} bodies.`
    );
  }

  if (!Number.isFinite(timeStepSeconds) || timeStepSeconds <= 0) {
    throw new RangeError(
      "Headless simulation time step must be finite and strictly positive."
    );
  }

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    if (
      !Number.isFinite(initialState.massesKg[bodyIndex]) ||
      initialState.massesKg[bodyIndex] <= 0
    ) {
      throw new RangeError(
        `Headless mass at body index ${bodyIndex} must be finite and strictly positive.`
      );
    }
  }

  for (let index = 0; index < bodyCount * 3; index += 1) {
    if (
      !Number.isFinite(initialState.positionsM[index]) ||
      !Number.isFinite(initialState.velocitiesMps[index])
    ) {
      throw new RangeError(
        `Headless phase-space state contains a non-finite value at vector index ${index}.`
      );
    }
  }
}

export class HeadlessGravitySimulation {
  readonly #model: HeadlessGravityModel;
  readonly #timeStepSeconds: number;
  readonly #massesKg: Float64Array;
  readonly #positionsM: Float64Array;
  readonly #velocitiesMps: Float64Array;
  readonly #workspace: FixedStepRk4Workspace;
  readonly #accelerationEvaluator: PhaseSpaceAccelerationEvaluator;
  #stepCount = 0;
  #timeSeconds = 0;

  constructor(options: HeadlessGravitySimulationOptions) {
    assertInitialState(options.initialState, options.timeStepSeconds);
    this.#model = options.model;
    this.#timeStepSeconds = options.timeStepSeconds;
    this.#massesKg = options.initialState.massesKg.slice();
    this.#positionsM = options.initialState.positionsM.slice();
    this.#velocitiesMps = options.initialState.velocitiesMps.slice();
    this.#workspace = createFixedStepRk4Workspace(this.#massesKg.length);
    this.#accelerationEvaluator = evaluatorForModel(options.model);

    // Validate the complete initial phase-space state, including pair
    // separations, before exposing a usable simulation.
    this.#accelerationEvaluator(
      this.#massesKg,
      this.#positionsM,
      this.#velocitiesMps,
      this.#workspace.k1VelocityDerivativesMps2
    );
  }

  get model(): HeadlessGravityModel {
    return this.#model;
  }

  get bodyCount(): number {
    return this.#massesKg.length;
  }

  get timeStepSeconds(): number {
    return this.#timeStepSeconds;
  }

  get stepCount(): number {
    return this.#stepCount;
  }

  get timeSeconds(): number {
    return this.#timeSeconds;
  }

  advanceOneStep(): void {
    const nextStepCount = this.#stepCount + 1;
    const nextTimeSeconds = nextStepCount * this.#timeStepSeconds;

    if (!Number.isSafeInteger(nextStepCount)) {
      throw new RangeError(
        "Headless RK4 step count would exceed the safe integer range."
      );
    }

    if (!Number.isFinite(nextTimeSeconds)) {
      throw new RangeError(
        "Headless RK4 simulation time would become non-finite."
      );
    }

    prepareFixedStepRk4Candidate(
      this.#massesKg,
      this.#positionsM,
      this.#velocitiesMps,
      this.#timeStepSeconds,
      this.#accelerationEvaluator,
      this.#workspace
    );

    this.#positionsM.set(this.#workspace.candidatePositionsM);
    this.#velocitiesMps.set(this.#workspace.candidateVelocitiesMps);
    this.#stepCount = nextStepCount;
    this.#timeSeconds = nextTimeSeconds;
  }

  copyMassesTo(targetMassesKg: Float64Array): void {
    if (targetMassesKg.length !== this.#massesKg.length) {
      throw new RangeError("Mass target does not match the headless simulation.");
    }

    targetMassesKg.set(this.#massesKg);
  }

  copyPositionsTo(targetPositionsM: Float64Array): void {
    if (targetPositionsM.length !== this.#positionsM.length) {
      throw new RangeError(
        "Position target does not match the headless simulation."
      );
    }

    targetPositionsM.set(this.#positionsM);
  }

  copyVelocitiesTo(targetVelocitiesMps: Float64Array): void {
    if (targetVelocitiesMps.length !== this.#velocitiesMps.length) {
      throw new RangeError(
        "Velocity target does not match the headless simulation."
      );
    }

    targetVelocitiesMps.set(this.#velocitiesMps);
  }
}
