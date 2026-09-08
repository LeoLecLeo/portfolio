import {
  isAppliedScenario,
  type AppliedScenario,
} from "../core/scenario";
import { vector3, type Vector3 } from "../core/vector3";
import type { FixedStepSchedulerConfig } from "./FixedStepScheduler";
import {
  GravityPrototypeRuntime,
  type PrototypeTelemetry,
} from "./GravityPrototypeRuntime";
import type { MutablePosition3 } from "./SimulationReadView";
import {
  productionIntegratorForModel,
  type GravityIntegratorId,
  type GravityModelId,
} from "../physics/gravityModel";

const TARGET_SCENE_RADIUS = 4;
const FALLBACK_PHYSICAL_EXTENT_M = 1;
export type SceneTransform = Readonly<{
  originM: Vector3;
  sceneUnitsPerMeter: number;
}>;

export type SessionBodyPresentation = Readonly<{
  bodyId: string;
  name: string;
  color: string;
  massKg: number;
  physicalRadiusM: number;
}>;

export type GravityLabSessionRequest = Readonly<{
  appliedScenario: AppliedScenario;
  schedulerConfig: FixedStepSchedulerConfig;
}>;

export type GravitySimulationSpecification = Readonly<{
  modelId: GravityModelId;
  integratorId: GravityIntegratorId;
  timeStepSeconds: number;
}>;

function createSceneTransform(
  scenario: AppliedScenario
): SceneTransform {
  const bodies = scenario.physics.bodies;
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let largestPhysicalRadiusM = 0;

  for (const body of bodies) {
    minimumX = Math.min(minimumX, body.initialPositionM.x);
    minimumY = Math.min(minimumY, body.initialPositionM.y);
    minimumZ = Math.min(minimumZ, body.initialPositionM.z);
    maximumX = Math.max(maximumX, body.initialPositionM.x);
    maximumY = Math.max(maximumY, body.initialPositionM.y);
    maximumZ = Math.max(maximumZ, body.initialPositionM.z);
    largestPhysicalRadiusM = Math.max(
      largestPhysicalRadiusM,
      body.physicalRadiusM
    );
  }

  const originM = vector3(
    minimumX + (maximumX - minimumX) * 0.5,
    minimumY + (maximumY - minimumY) * 0.5,
    minimumZ + (maximumZ - minimumZ) * 0.5
  );
  let extentM = 0;

  for (const body of bodies) {
    extentM = Math.max(
      extentM,
      Math.hypot(
        body.initialPositionM.x - originM.x,
        body.initialPositionM.y - originM.y,
        body.initialPositionM.z - originM.z
      )
    );
  }

  if (extentM === 0) {
    extentM = Math.max(
      largestPhysicalRadiusM,
      FALLBACK_PHYSICAL_EXTENT_M
    );
  }

  const candidateScale = TARGET_SCENE_RADIUS / extentM;
  const sceneUnitsPerMeter =
    Number.isFinite(candidateScale) && candidateScale > 0
      ? candidateScale
      : 1;

  return Object.freeze({
    originM: Object.freeze(originM),
    sceneUnitsPerMeter,
  });
}

export class GravityLabSession {
  readonly appliedScenario: AppliedScenario;
  readonly runtime: GravityPrototypeRuntime;
  readonly sceneTransform: SceneTransform;
  readonly bodies: readonly SessionBodyPresentation[];
  readonly schedulerConfig: FixedStepSchedulerConfig;
  readonly modelId: GravityModelId;
  readonly integratorId: GravityIntegratorId;
  readonly specification: GravitySimulationSpecification;

  constructor(request: GravityLabSessionRequest) {
    if (!isAppliedScenario(request.appliedScenario)) {
      throw new TypeError(
        "A gravity-lab session requires a valid applied scenario."
      );
    }

    this.appliedScenario = request.appliedScenario;
    this.schedulerConfig = Object.freeze({
      ...request.schedulerConfig,
    });
    this.modelId = request.appliedScenario.physics.modelId;
    this.integratorId = productionIntegratorForModel(this.modelId);
    this.specification = Object.freeze({
      modelId: this.modelId,
      integratorId: this.integratorId,
      timeStepSeconds:
        request.appliedScenario.numericalPolicy.timeStepSeconds,
    });
    this.runtime = new GravityPrototypeRuntime(
      request.appliedScenario,
      this.schedulerConfig
    );
    this.sceneTransform = createSceneTransform(
      request.appliedScenario
    );
    this.bodies = Object.freeze(
      request.appliedScenario.physics.bodies.map((body, index) =>
        Object.freeze({
          bodyId: body.id,
          name: body.name,
          color:
            request.appliedScenario.presentation.bodies[index].color,
          massKg: body.massKg,
          physicalRadiusM: body.physicalRadiusM,
        })
      )
    );
  }

  writeScenePosition(
    bodyId: string,
    target: MutablePosition3
  ): void {
    this.runtime.positions.writePositionMById(bodyId, target);
    target.x =
      (target.x - this.sceneTransform.originM.x) *
      this.sceneTransform.sceneUnitsPerMeter;
    target.y =
      (target.y - this.sceneTransform.originM.y) *
      this.sceneTransform.sceneUnitsPerMeter;
    target.z =
      (target.z - this.sceneTransform.originM.z) *
      this.sceneTransform.sceneUnitsPerMeter;
  }

  writeNewtonianComparisonScenePosition(
    bodyId: string,
    target: MutablePosition3
  ): boolean {
    const positions = this.runtime.newtonianComparisonPositions;

    if (positions === null) {
      return false;
    }

    positions.writePositionMById(bodyId, target);
    target.x =
      (target.x - this.sceneTransform.originM.x) *
      this.sceneTransform.sceneUnitsPerMeter;
    target.y =
      (target.y - this.sceneTransform.originM.y) *
      this.sceneTransform.sceneUnitsPerMeter;
    target.z =
      (target.z - this.sceneTransform.originM.z) *
      this.sceneTransform.sceneUnitsPerMeter;
    return true;
  }

  stop(): void {
    this.runtime.dispose();
  }
}

export type GravityLabHostSnapshot = Readonly<{
  revision: number;
  session: GravityLabSession;
  appliedScenario: AppliedScenario;
  telemetry: PrototypeTelemetry;
}>;

function createHostSnapshot(
  revision: number,
  session: GravityLabSession
): GravityLabHostSnapshot {
  return Object.freeze({
    revision,
    session,
    appliedScenario: session.appliedScenario,
    telemetry: session.runtime.telemetry(),
  });
}

export class GravityLabSessionHost {
  #snapshot: GravityLabHostSnapshot;

  constructor(initialRequest: GravityLabSessionRequest) {
    this.#snapshot = createHostSnapshot(
      0,
      new GravityLabSession(initialRequest)
    );
  }

  get snapshot(): GravityLabHostSnapshot {
    return this.#snapshot;
  }

  replace(
    request: GravityLabSessionRequest
  ): GravityLabHostSnapshot {
    const nextSession = new GravityLabSession(request);
    const previousSession = this.#snapshot.session;
    const nextSnapshot = createHostSnapshot(
      this.#snapshot.revision + 1,
      nextSession
    );

    previousSession.stop();
    this.#snapshot = nextSnapshot;
    return nextSnapshot;
  }

  publishTelemetry(
    source: GravityLabSession,
    telemetry: PrototypeTelemetry
  ): GravityLabHostSnapshot | null {
    if (source !== this.#snapshot.session) {
      return null;
    }

    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      telemetry,
    });
    return this.#snapshot;
  }

  pause(): GravityLabHostSnapshot {
    this.#snapshot.session.runtime.pause();
    return this.#refreshTelemetry();
  }

  resume(): GravityLabHostSnapshot {
    this.#snapshot.session.runtime.resume();
    return this.#refreshTelemetry();
  }

  reset(): GravityLabHostSnapshot {
    this.#snapshot.session.runtime.reset();
    return this.#refreshTelemetry();
  }

  stop(): void {
    this.#snapshot.session.stop();
  }

  #refreshTelemetry(): GravityLabHostSnapshot {
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      telemetry: this.#snapshot.session.runtime.telemetry(),
    });
    return this.#snapshot;
  }
}
