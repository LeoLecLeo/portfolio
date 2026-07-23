import type {
  NewtonianDiagnostics,
  NewtonianSimulationConfig,
  NewtonianState,
  SimulationStatus,
  SimulationStopEvent,
} from "../core/types";
import { validateSimulationConfig } from "../core/validation";
import { vector3 } from "../core/vector3";
import {
  createVelocityVerletWorkspace,
  stepVelocityVerlet,
  type VelocityVerletWorkspace,
} from "../integrators/velocityVerlet";
import { computeNewtonianDiagnostics } from "../physics/diagnostics";
import { detectEncounterAcrossStep } from "../physics/encounters";
import { computeNewtonianAccelerations } from "../physics/newtonian";

function cloneConfiguration(
  config: NewtonianSimulationConfig
): NewtonianSimulationConfig {
  return {
    bodies: config.bodies.map((body) => ({
      ...body,
      initialPositionM: vector3(
        body.initialPositionM.x,
        body.initialPositionM.y,
        body.initialPositionM.z
      ),
      initialVelocityMps: vector3(
        body.initialVelocityMps.x,
        body.initialVelocityMps.y,
        body.initialVelocityMps.z
      ),
    })),
    timeStepSeconds: config.timeStepSeconds,
    encounterThresholds: { ...config.encounterThresholds },
  };
}

function createInitialState(config: NewtonianSimulationConfig): NewtonianState {
  const bodyCount = config.bodies.length;
  const vectorLength = bodyCount * 3;
  const massesKg = new Float64Array(bodyCount);
  const physicalRadiiM = new Float64Array(bodyCount);
  const fixed = new Uint8Array(bodyCount);
  const positionsM = new Float64Array(vectorLength);
  const velocitiesMps = new Float64Array(vectorLength);
  const accelerationsMps2 = new Float64Array(vectorLength);

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    const body = config.bodies[bodyIndex];
    const offset = bodyIndex * 3;

    massesKg[bodyIndex] = body.massKg;
    physicalRadiiM[bodyIndex] = body.physicalRadiusM;
    fixed[bodyIndex] = body.fixed ? 1 : 0;
    positionsM[offset] = body.initialPositionM.x;
    positionsM[offset + 1] = body.initialPositionM.y;
    positionsM[offset + 2] = body.initialPositionM.z;
    velocitiesMps[offset] = body.fixed ? 0 : body.initialVelocityMps.x;
    velocitiesMps[offset + 1] = body.fixed
      ? 0
      : body.initialVelocityMps.y;
    velocitiesMps[offset + 2] = body.fixed
      ? 0
      : body.initialVelocityMps.z;
  }

  computeNewtonianAccelerations(massesKg, positionsM, accelerationsMps2);

  return {
    bodyIds: config.bodies.map((body) => body.id),
    massesKg,
    physicalRadiiM,
    fixed,
    positionsM,
    velocitiesMps,
    accelerationsMps2,
    stepCount: 0,
    timeSeconds: 0,
  };
}

export class SimulationEngine {
  readonly #config: NewtonianSimulationConfig;
  #state: NewtonianState;
  #workspace: VelocityVerletWorkspace;
  #status: SimulationStatus = "paused";
  #stopEvent: SimulationStopEvent | null = null;

  constructor(config: NewtonianSimulationConfig) {
    validateSimulationConfig(config);
    this.#config = cloneConfiguration(config);
    this.#state = createInitialState(this.#config);
    this.#workspace = createVelocityVerletWorkspace(
      this.#config.bodies.length
    );
    this.#applyInitialEncounterGuard();
  }

  get timeStepSeconds(): number {
    return this.#config.timeStepSeconds;
  }

  get status(): SimulationStatus {
    return this.#status;
  }

  get stopEvent(): SimulationStopEvent | null {
    return this.#stopEvent;
  }

  get state(): Readonly<NewtonianState> {
    return this.#state;
  }

  start(): boolean {
    if (this.#status !== "paused") {
      return false;
    }

    this.#status = "running";
    return true;
  }

  pause(): void {
    if (this.#status === "running") {
      this.#status = "paused";
    }
  }

  reset(): void {
    this.#state = createInitialState(this.#config);
    this.#workspace = createVelocityVerletWorkspace(
      this.#config.bodies.length
    );
    this.#status = "paused";
    this.#stopEvent = null;
    this.#applyInitialEncounterGuard();
  }

  diagnostics(): NewtonianDiagnostics {
    return computeNewtonianDiagnostics(this.#state);
  }

  advanceOneStep(): boolean {
    if (this.#status !== "running") {
      return false;
    }

    try {
      const result = stepVelocityVerlet(
        this.#state,
        this.#config.timeStepSeconds,
        this.#config.encounterThresholds,
        computeNewtonianAccelerations,
        this.#workspace
      );

      if (!result.advanced) {
        this.#stopFromEncounter(result.encounter);
        return false;
      }

      return true;
    } catch (error) {
      this.#status = "error";
      this.#stopEvent = {
        kind: "numerical-error",
        timeSeconds: this.#state.timeSeconds,
        attemptedTimeSeconds:
          this.#state.timeSeconds + this.#config.timeStepSeconds,
        message:
          error instanceof Error
            ? `Numerical integration stopped: ${error.message}`
            : "Numerical integration stopped because of an unknown error.",
      };
      return false;
    }
  }

  #applyInitialEncounterGuard(): void {
    const encounter = detectEncounterAcrossStep(
      this.#state.positionsM,
      this.#state.positionsM,
      this.#state.massesKg,
      this.#state.physicalRadiiM,
      this.#state.fixed,
      this.#config.timeStepSeconds,
      this.#config.encounterThresholds
    );

    if (encounter !== null) {
      this.#stopFromEncounter(encounter);
    }
  }

  #stopFromEncounter(
    encounter: NonNullable<
      ReturnType<typeof detectEncounterAcrossStep>
    >
  ): void {
    const firstBodyId = this.#state.bodyIds[encounter.firstBodyIndex];
    const secondBodyId = this.#state.bodyIds[encounter.secondBodyIndex];
    const attemptedTimeSeconds =
      this.#state.timeSeconds + this.#config.timeStepSeconds;

    if (encounter.kind === "collision") {
      this.#status = "collision";
      this.#stopEvent = {
        kind: "collision",
        timeSeconds: this.#state.timeSeconds,
        attemptedTimeSeconds,
        firstBodyId,
        secondBodyId,
        minimumSeparationM: encounter.minimumSeparationM,
        contactDistanceM: encounter.contactDistanceM,
        message:
          `Collision detected between "${firstBodyId}" and "${secondBodyId}". ` +
          "The simulation was paused at the last valid state; no merge is modelled.",
      };
      return;
    }

    this.#status = "unresolved-encounter";
    this.#stopEvent = {
      kind: "unresolved-encounter",
      timeSeconds: this.#state.timeSeconds,
      attemptedTimeSeconds,
      firstBodyId,
      secondBodyId,
      minimumSeparationM: encounter.minimumSeparationM,
      relativeDisplacementRatio: encounter.relativeDisplacementRatio,
      dynamicalStepRatio: encounter.dynamicalStepRatio,
      message:
        `Encounter between "${firstBodyId}" and "${secondBodyId}" cannot be ` +
        "resolved safely with the current fixed time step. No gravitational " +
        "softening was applied.",
    };
  }
}
