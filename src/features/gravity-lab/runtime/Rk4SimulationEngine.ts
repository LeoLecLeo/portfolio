import type {
  NewtonianDiagnostics,
  NewtonianSimulationConfig,
  NewtonianState,
  NumericalCandidateFailure,
  SimulationStatus,
  SimulationStopEvent,
} from "../core/types";
import { validateSimulationConfig } from "../core/validation";
import { vector3 } from "../core/vector3";
import {
  createFixedStepRk4Workspace,
  prepareFixedStepRk4Candidate,
  type FixedStepRk4Workspace,
  type PhaseSpaceAccelerationEvaluator,
} from "../integrators/fixedStepRk4";
import { computeNewtonianDiagnostics } from "../physics/diagnostics";
import { detectEncounterAcrossStep } from "../physics/encounters";
import { computeFirstPostNewtonianAccelerations } from "../physics/firstPostNewtonian";
import type { GravityModelId } from "../physics/gravityModel";
import { computeNewtonianAccelerations } from "../physics/newtonian";
import {
  createNewtonianValidityWorkspace,
  evaluateNewtonianValidityInto,
  hasNewtonianDomainViolation,
  materializeNewtonianValidityReport,
  type NewtonianValidityReport,
  type NewtonianValidityWorkspace,
} from "../physics/newtonianValidity";
import {
  createCandidateStateGuardWorkspace,
  inspectCompletedPhaseSpaceCandidate,
  materializeCandidateStateRejection,
  type CandidateStateGuardWorkspace,
  type CandidateStateRejection,
} from "./candidateStateGuard";

const NEWTONIAN_RK4_EVALUATOR: PhaseSpaceAccelerationEvaluator = (
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
  modelId: GravityModelId
): PhaseSpaceAccelerationEvaluator {
  return modelId === "newtonian"
    ? NEWTONIAN_RK4_EVALUATOR
    : computeFirstPostNewtonianAccelerations;
}

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

function createInitialState(
  config: NewtonianSimulationConfig,
  accelerationEvaluator: PhaseSpaceAccelerationEvaluator
): NewtonianState {
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
    velocitiesMps[offset] = body.initialVelocityMps.x;
    velocitiesMps[offset + 1] = body.initialVelocityMps.y;
    velocitiesMps[offset + 2] = body.initialVelocityMps.z;
  }

  accelerationEvaluator(
    massesKg,
    positionsM,
    velocitiesMps,
    accelerationsMps2
  );

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

export function assertRk4ModelConfiguration(
  config: NewtonianSimulationConfig,
  modelId: GravityModelId
): void {
  if (config.bodies.some((body) => body.fixed)) {
    throw new RangeError(
      "Fixed bodies are not supported by validated RK4 gravity sessions."
    );
  }

  if (modelId !== "first-post-newtonian") {
    return;
  }

  const bodyCount = config.bodies.length;
  const massesKg = new Float64Array(bodyCount);
  const physicalRadiiM = new Float64Array(bodyCount);
  const fixed = new Uint8Array(bodyCount);
  const positionsM = new Float64Array(bodyCount * 3);
  const velocitiesMps = new Float64Array(bodyCount * 3);
  const workspace = createNewtonianValidityWorkspace(bodyCount);

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    const body = config.bodies[bodyIndex];
    const offset = bodyIndex * 3;
    massesKg[bodyIndex] = body.massKg;
    physicalRadiiM[bodyIndex] = body.physicalRadiusM;
    positionsM[offset] = body.initialPositionM.x;
    positionsM[offset + 1] = body.initialPositionM.y;
    positionsM[offset + 2] = body.initialPositionM.z;
    velocitiesMps[offset] = body.initialVelocityMps.x;
    velocitiesMps[offset + 1] = body.initialVelocityMps.y;
    velocitiesMps[offset + 2] = body.initialVelocityMps.z;
  }

  evaluateNewtonianValidityInto(
    massesKg,
    physicalRadiiM,
    fixed,
    positionsM,
    velocitiesMps,
    workspace
  );

  if (hasNewtonianDomainViolation(workspace)) {
    throw new RangeError(
      "The initial state is outside the documented weak-field, non-relativistic 1PN product domain."
    );
  }
}

export class Rk4SimulationEngine {
  readonly #config: NewtonianSimulationConfig;
  readonly #modelId: GravityModelId;
  readonly #accelerationEvaluator: PhaseSpaceAccelerationEvaluator;
  #state: NewtonianState;
  #workspace: FixedStepRk4Workspace;
  #candidateAccelerationsMps2: Float64Array;
  #candidateGuardWorkspace: CandidateStateGuardWorkspace;
  #telemetryValidityWorkspace: NewtonianValidityWorkspace;
  #status: SimulationStatus = "paused";
  #stopEvent: SimulationStopEvent | null = null;
  #rejectedNewtonianValidity: NewtonianValidityReport | null = null;
  #preparedNextStepCount: number | null = null;
  #preparedNextTimeSeconds: number | null = null;

  constructor(
    config: NewtonianSimulationConfig,
    modelId: GravityModelId
  ) {
    validateSimulationConfig(config);
    assertRk4ModelConfiguration(config, modelId);
    this.#config = cloneConfiguration(config);
    this.#modelId = modelId;
    this.#accelerationEvaluator = evaluatorForModel(modelId);
    this.#state = createInitialState(
      this.#config,
      this.#accelerationEvaluator
    );
    this.#workspace = createFixedStepRk4Workspace(
      this.#config.bodies.length
    );
    this.#candidateAccelerationsMps2 = new Float64Array(
      this.#config.bodies.length * 3
    );
    this.#candidateGuardWorkspace = createCandidateStateGuardWorkspace(
      this.#config.bodies.length
    );
    this.#telemetryValidityWorkspace = createNewtonianValidityWorkspace(
      this.#config.bodies.length
    );
    this.#applyInitialEncounterGuard();
  }

  get modelId(): GravityModelId {
    return this.#modelId;
  }

  get integratorId(): "fixed-rk4" {
    return "fixed-rk4";
  }

  get timeStepSeconds(): number {
    return this.#config.timeStepSeconds;
  }

  get bodyCount(): number {
    return this.#state.massesKg.length;
  }

  get status(): SimulationStatus {
    return this.#status;
  }

  get stopEvent(): SimulationStopEvent | null {
    return this.#stopEvent;
  }

  get rejectedNewtonianValidity(): NewtonianValidityReport | null {
    return this.#rejectedNewtonianValidity;
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
    this.discardPreparedStep();
  }

  reset(): void {
    this.#state = createInitialState(
      this.#config,
      this.#accelerationEvaluator
    );
    this.#workspace = createFixedStepRk4Workspace(this.bodyCount);
    this.#candidateAccelerationsMps2 = new Float64Array(
      this.bodyCount * 3
    );
    this.#candidateGuardWorkspace = createCandidateStateGuardWorkspace(
      this.bodyCount
    );
    this.#telemetryValidityWorkspace = createNewtonianValidityWorkspace(
      this.bodyCount
    );
    this.#status = "paused";
    this.#stopEvent = null;
    this.#rejectedNewtonianValidity = null;
    this.discardPreparedStep();
    this.#applyInitialEncounterGuard();
  }

  diagnostics(): NewtonianDiagnostics {
    return computeNewtonianDiagnostics(this.#state);
  }

  newtonianValidity(): NewtonianValidityReport {
    evaluateNewtonianValidityInto(
      this.#state.massesKg,
      this.#state.physicalRadiiM,
      this.#state.fixed,
      this.#state.positionsM,
      this.#state.velocitiesMps,
      this.#telemetryValidityWorkspace
    );

    return materializeNewtonianValidityReport(
      this.#state.bodyIds,
      this.#telemetryValidityWorkspace
    );
  }

  copyPositionsTo(targetPositionsM: Float64Array): void {
    if (targetPositionsM.length !== this.#state.positionsM.length) {
      throw new RangeError(
        "Position target does not match the simulation body count."
      );
    }
    targetPositionsM.set(this.#state.positionsM);
  }

  copyVelocitiesTo(targetVelocitiesMps: Float64Array): void {
    if (targetVelocitiesMps.length !== this.#state.velocitiesMps.length) {
      throw new RangeError(
        "Velocity target does not match the simulation body count."
      );
    }
    targetVelocitiesMps.set(this.#state.velocitiesMps);
  }

  copyBodyIds(): readonly string[] {
    return Object.freeze([...this.#state.bodyIds]);
  }

  prepareOneStep(): boolean {
    if (this.#status !== "running" || this.#preparedNextStepCount !== null) {
      return false;
    }

    const nextStepCount = this.#state.stepCount + 1;
    const nextTimeSeconds = nextStepCount * this.#config.timeStepSeconds;

    if (!Number.isSafeInteger(nextStepCount)) {
      this.#stopFromNumericalError(
        "L’intégration numérique RK4 a été arrêtée : le compteur de pas dépasserait la plage des entiers sûrs."
      );
      return false;
    }

    if (!Number.isFinite(nextTimeSeconds)) {
      this.#stopFromNumericalError(
        "L’intégration numérique RK4 a été arrêtée : le temps simulé deviendrait non fini."
      );
      return false;
    }

    try {
      prepareFixedStepRk4Candidate(
        this.#state.massesKg,
        this.#state.positionsM,
        this.#state.velocitiesMps,
        this.#config.timeStepSeconds,
        this.#accelerationEvaluator,
        this.#workspace
      );
      this.#accelerationEvaluator(
        this.#state.massesKg,
        this.#workspace.candidatePositionsM,
        this.#workspace.candidateVelocitiesMps,
        this.#candidateAccelerationsMps2
      );

      const rejectionKind = inspectCompletedPhaseSpaceCandidate(
        this.#state,
        this.#config.timeStepSeconds,
        this.#config.encounterThresholds,
        this.#workspace.candidatePositionsM,
        this.#workspace.candidateVelocitiesMps,
        this.#candidateAccelerationsMps2,
        this.#candidateGuardWorkspace
      );

      if (rejectionKind !== null) {
        this.#stopFromCandidateRejection();
        return false;
      }

      this.#preparedNextStepCount = nextStepCount;
      this.#preparedNextTimeSeconds = nextTimeSeconds;
      return true;
    } catch {
      this.#stopFromNumericalError(
        "L’intégration numérique RK4 a été arrêtée avant la validation du prochain état ; le dernier état valide a été conservé."
      );
      return false;
    }
  }

  commitPreparedStep(): boolean {
    if (
      this.#preparedNextStepCount === null ||
      this.#preparedNextTimeSeconds === null
    ) {
      return false;
    }

    this.#state.positionsM.set(this.#workspace.candidatePositionsM);
    this.#state.velocitiesMps.set(this.#workspace.candidateVelocitiesMps);
    this.#state.accelerationsMps2.set(
      this.#candidateAccelerationsMps2
    );
    this.#state.stepCount = this.#preparedNextStepCount;
    this.#state.timeSeconds = this.#preparedNextTimeSeconds;
    this.discardPreparedStep();
    return true;
  }

  discardPreparedStep(): void {
    this.#preparedNextStepCount = null;
    this.#preparedNextTimeSeconds = null;
  }

  advanceOneStep(): boolean {
    if (!this.prepareOneStep()) {
      return false;
    }
    return this.commitPreparedStep();
  }

  #stopFromCandidateRejection(): void {
    const rejection = materializeCandidateStateRejection(
      this.#state.bodyIds,
      this.#candidateGuardWorkspace
    );

    if (rejection === null) {
      throw new RangeError(
        "Cannot stop from an accepted RK4 candidate-state guard."
      );
    }

    this.discardPreparedStep();

    if (rejection.kind === "encounter") {
      this.#stopFromEncounter(rejection.encounter);
      return;
    }

    if (rejection.kind === "numerical-error") {
      const bodyId = this.#state.bodyIds[rejection.bodyIndex];
      this.#stopFromNumericalError(
        `L’intégration numérique RK4 a été arrêtée : la composante ${rejection.axis} du corps « ${bodyId} » n’est pas finie. Le dernier état valide a été conservé.`,
        {
          buffer: rejection.buffer,
          vectorIndex: rejection.vectorIndex,
          bodyIndex: rejection.bodyIndex,
          bodyId,
          axis: rejection.axis,
        }
      );
      return;
    }

    this.#stopFromScientificDomainViolation(rejection);
  }

  #stopFromNumericalError(
    message: string,
    cause?: NumericalCandidateFailure
  ): void {
    this.discardPreparedStep();
    this.#status = "error";
    this.#stopEvent = Object.freeze({
      kind: "numerical-error",
      timeSeconds: this.#state.timeSeconds,
      attemptedTimeSeconds:
        this.#state.timeSeconds + this.#config.timeStepSeconds,
      ...(cause === undefined
        ? {}
        : { cause: Object.freeze({ ...cause }) }),
      message,
    });
  }

  #stopFromScientificDomainViolation(
    rejection: CandidateStateRejection & {
      kind: "newtonian-domain-violation";
    }
  ): void {
    const violation = Object.freeze({
      ...rejection.violation,
      responsibility: Object.freeze({
        ...rejection.violation.responsibility,
      }),
    });
    const modelLabel =
      this.#modelId === "first-post-newtonian"
        ? "Le modèle 1PN"
        : "Le modèle newtonien";

    this.#status = "newtonian-domain-violation";
    this.#rejectedNewtonianValidity = rejection.report;
    this.#stopEvent = Object.freeze({
      kind: "newtonian-domain-violation",
      timeSeconds: this.#state.timeSeconds,
      attemptedTimeSeconds:
        this.#state.timeSeconds + this.#config.timeStepSeconds,
      violation,
      message:
        `${modelLabel} a atteint la limite du domaine d’utilisation pour ` +
        `${violation.metric} (${violation.value}, limite ${violation.limit}). ` +
        "L’état candidat RK4 a été refusé et le dernier état valide a été conservé.",
    });
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
    encounter: NonNullable<ReturnType<typeof detectEncounterAcrossStep>>
  ): void {
    this.discardPreparedStep();
    const firstBodyId = this.#state.bodyIds[encounter.firstBodyIndex];
    const secondBodyId = this.#state.bodyIds[encounter.secondBodyIndex];
    const attemptedTimeSeconds =
      this.#state.timeSeconds + this.#config.timeStepSeconds;

    if (encounter.kind === "collision") {
      this.#status = "collision";
      this.#stopEvent = Object.freeze({
        kind: "collision",
        timeSeconds: this.#state.timeSeconds,
        attemptedTimeSeconds,
        firstBodyId,
        secondBodyId,
        minimumSeparationM: encounter.minimumSeparationM,
        contactDistanceM: encounter.contactDistanceM,
        message:
          `Collision détectée entre « ${firstBodyId} » et « ${secondBodyId} ». ` +
          "La session RK4 a été arrêtée au dernier état valide ; aucune fusion n’est modélisée.",
      });
      return;
    }

    this.#status = "unresolved-encounter";
    this.#stopEvent = Object.freeze({
      kind: "unresolved-encounter",
      timeSeconds: this.#state.timeSeconds,
      attemptedTimeSeconds,
      firstBodyId,
      secondBodyId,
      minimumSeparationM: encounter.minimumSeparationM,
      relativeDisplacementRatio: encounter.relativeDisplacementRatio,
      dynamicalStepRatio: encounter.dynamicalStepRatio,
      message:
        `La rencontre entre « ${firstBodyId} » et « ${secondBodyId} » ne peut pas ` +
        "être résolue de manière sûre avec le pas RK4 actuel. Aucun adoucissement gravitationnel n’a été appliqué.",
    });
  }
}
