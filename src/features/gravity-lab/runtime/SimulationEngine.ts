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
  commitVelocityVerletCandidate,
  completeVelocityVerletCandidate,
  createVelocityVerletWorkspace,
  prepareVelocityVerletDrift,
  type VelocityVerletWorkspace,
} from "../integrators/velocityVerlet";
import { computeNewtonianDiagnostics } from "../physics/diagnostics";
import { detectEncounterAcrossStep } from "../physics/encounters";
import { computeNewtonianAccelerations } from "../physics/newtonian";
import {
  createNewtonianValidityWorkspace,
  evaluateNewtonianValidityInto,
  materializeNewtonianValidityReport,
  type NewtonianValidityReport,
  type NewtonianValidityWorkspace,
} from "../physics/newtonianValidity";
import {
  createCandidateStateGuardWorkspace,
  inspectCompletedVelocityVerletCandidate,
  inspectVelocityVerletDriftCandidate,
  materializeCandidateStateRejection,
  type CandidateStateGuardWorkspace,
  type CandidateStateRejection,
} from "./candidateStateGuard";

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
  #candidateGuardWorkspace: CandidateStateGuardWorkspace;
  #telemetryValidityWorkspace: NewtonianValidityWorkspace;
  #status: SimulationStatus = "paused";
  #stopEvent: SimulationStopEvent | null = null;
  #rejectedNewtonianValidity: NewtonianValidityReport | null = null;

  constructor(config: NewtonianSimulationConfig) {
    validateSimulationConfig(config);
    this.#config = cloneConfiguration(config);
    this.#state = createInitialState(this.#config);
    this.#workspace = createVelocityVerletWorkspace(
      this.#config.bodies.length
    );
    this.#candidateGuardWorkspace = createCandidateStateGuardWorkspace(
      this.#config.bodies.length
    );
    this.#telemetryValidityWorkspace =
      createNewtonianValidityWorkspace(this.#config.bodies.length);
    this.#applyInitialEncounterGuard();
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
  }

  reset(): void {
    this.#state = createInitialState(this.#config);
    this.#workspace = createVelocityVerletWorkspace(
      this.#config.bodies.length
    );
    this.#candidateGuardWorkspace = createCandidateStateGuardWorkspace(
      this.#config.bodies.length
    );
    this.#telemetryValidityWorkspace =
      createNewtonianValidityWorkspace(this.#config.bodies.length);
    this.#status = "paused";
    this.#stopEvent = null;
    this.#rejectedNewtonianValidity = null;
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

  copyBodyIds(): readonly string[] {
    return Object.freeze([...this.#state.bodyIds]);
  }

  advanceOneStep(): boolean {
    if (this.#status !== "running") {
      return false;
    }

    try {
      prepareVelocityVerletDrift(
        this.#state,
        this.#config.timeStepSeconds,
        this.#workspace
      );

      let rejectionKind = inspectVelocityVerletDriftCandidate(
        this.#state,
        this.#config.timeStepSeconds,
        this.#config.encounterThresholds,
        this.#workspace,
        this.#candidateGuardWorkspace
      );

      if (rejectionKind !== null) {
        this.#stopFromCandidateRejection();
        return false;
      }

      completeVelocityVerletCandidate(
        this.#state,
        this.#config.timeStepSeconds,
        computeNewtonianAccelerations,
        this.#workspace
      );

      rejectionKind = inspectCompletedVelocityVerletCandidate(
        this.#state,
        this.#workspace,
        this.#candidateGuardWorkspace
      );

      if (rejectionKind !== null) {
        this.#stopFromCandidateRejection();
        return false;
      }

      commitVelocityVerletCandidate(
        this.#state,
        this.#config.timeStepSeconds,
        this.#workspace
      );
      return true;
    } catch {
      this.#stopFromNumericalError(
        "L’intégration numérique a été arrêtée avant la validation du prochain état ; le dernier état valide a été conservé."
      );
      return false;
    }
  }

  #stopFromCandidateRejection(): void {
    const rejection = materializeCandidateStateRejection(
      this.#state.bodyIds,
      this.#candidateGuardWorkspace
    );

    if (rejection === null) {
      throw new RangeError(
        "Cannot stop from an accepted candidate-state guard."
      );
    }

    if (rejection.kind === "encounter") {
      this.#stopFromEncounter(rejection.encounter);
      return;
    }

    if (rejection.kind === "numerical-error") {
      const bodyId = this.#state.bodyIds[rejection.bodyIndex];
      this.#stopFromNumericalError(
        `L’intégration numérique a été arrêtée : la composante ${rejection.axis} ` +
          `du corps « ${bodyId} » n’est pas finie. Le dernier état valide a été conservé.`,
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

    this.#stopFromNewtonianDomainViolation(rejection);
  }

  #stopFromNumericalError(
    message: string,
    cause?: NumericalCandidateFailure
  ): void {
    const stableCause =
      cause === undefined ? undefined : Object.freeze({ ...cause });

    this.#status = "error";
    this.#stopEvent = Object.freeze({
      kind: "numerical-error",
      timeSeconds: this.#state.timeSeconds,
      attemptedTimeSeconds:
        this.#state.timeSeconds + this.#config.timeStepSeconds,
      ...(stableCause === undefined ? {} : { cause: stableCause }),
      message,
    });
  }

  #stopFromNewtonianDomainViolation(
    rejection: CandidateStateRejection & {
      kind: "newtonian-domain-violation";
    }
  ): void {
    const { violation } = rejection;
    const stableResponsibility = Object.freeze({
      ...violation.responsibility,
    });
    const stableViolation = Object.freeze({
      ...violation,
      responsibility: stableResponsibility,
    });
    const responsible =
      stableResponsibility.kind === "body"
        ? `le corps « ${stableResponsibility.bodyId} »`
        : `la paire « ${stableResponsibility.firstBodyId} » / ` +
          `« ${stableResponsibility.secondBodyId} »`;
    const frameText =
      stableViolation.velocityFrame === undefined
        ? ""
        : stableViolation.velocityFrame === "barycentric"
          ? " dans le référentiel barycentrique"
          : stableViolation.velocityFrame === "relative"
            ? " dans le référentiel relatif de la paire"
            : " dans le référentiel du scénario";
    const betaPolicyText =
      stableViolation.metric === "beta"
        ? " Les seuils bêta constituent une politique pédagogique fondée sur " +
          "l’ordre attendu des corrections en bêta au carré, et non une " +
          "garantie universelle sur l’erreur."
        : "";

    this.#status = "newtonian-domain-violation";
    this.#rejectedNewtonianValidity = rejection.report;
    this.#stopEvent = Object.freeze({
      kind: "newtonian-domain-violation",
      timeSeconds: this.#state.timeSeconds,
      attemptedTimeSeconds:
        this.#state.timeSeconds + this.#config.timeStepSeconds,
      violation: stableViolation,
      message:
        `Limite du domaine newtonien atteinte pour ${stableViolation.metric}, ` +
        `${responsible}${frameText} (${stableViolation.value}, limite ` +
        `${stableViolation.limit}). L’état candidat a été refusé et le dernier ` +
        `état valide a été conservé.${betaPolicyText}`,
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
          "La simulation a été arrêtée au dernier état valide ; aucune fusion n’est modélisée.",
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
        "être résolue de manière sûre avec le pas fixe actuel. Aucun adoucissement " +
        "gravitationnel n’a été appliqué.",
    });
  }
}
