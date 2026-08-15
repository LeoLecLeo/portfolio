import { MAX_NEWTONIAN_BODIES } from "../core/types";
import type { RenderedCameraPoint } from "./cameraFraming";

// Ten samples per active real-time second keeps trails smooth without coupling
// collection to the display refresh rate or the scenario's simulated cadence.
export const TRAJECTORY_SAMPLE_INTERVAL_REAL_SECONDS = 0.1;

// At 10 Hz, 512 points retain roughly 51 seconds of recent motion per body.
// Both the scientific sample store and GPU upload buffers remain strictly bound.
export const TRAJECTORY_MAX_POINTS_PER_BODY = 512;

type BodyTrajectory = {
  readonly positions: Float32Array;
  startPoint: number;
  pointCount: number;
};

function validateBodyIds(bodyIds: readonly string[]): void {
  if (bodyIds.length > MAX_NEWTONIAN_BODIES) {
    throw new RangeError(
      `Trajectory collection supports at most ${MAX_NEWTONIAN_BODIES} bodies.`
    );
  }

  const uniqueIds = new Set<string>();

  for (const bodyId of bodyIds) {
    if (bodyId.length === 0 || uniqueIds.has(bodyId)) {
      throw new TypeError(
        "Trajectory body ids must be non-empty and unique."
      );
    }

    uniqueIds.add(bodyId);
  }
}

function createBodyTrajectory(maxPoints: number): BodyTrajectory {
  return {
    positions: new Float32Array(maxPoints * 3),
    startPoint: 0,
    pointCount: 0,
  };
}

export class TrajectoryCollector {
  readonly #maxPointsPerBody: number;
  readonly #sampleIntervalSeconds: number;
  #bodyIds: readonly string[] = Object.freeze([]);
  #trajectories = new Map<string, BodyTrajectory>();
  #elapsedActiveSeconds = 0;
  #ignoreNextRunningDelta = true;

  constructor(
    bodyIds: readonly string[],
    options: Readonly<{
      maxPointsPerBody?: number;
      sampleIntervalSeconds?: number;
    }> = {}
  ) {
    this.#maxPointsPerBody =
      options.maxPointsPerBody ?? TRAJECTORY_MAX_POINTS_PER_BODY;
    this.#sampleIntervalSeconds =
      options.sampleIntervalSeconds ??
      TRAJECTORY_SAMPLE_INTERVAL_REAL_SECONDS;

    if (
      !Number.isSafeInteger(this.#maxPointsPerBody) ||
      this.#maxPointsPerBody < 2
    ) {
      throw new RangeError(
        "Trajectory capacity must be a safe integer of at least two points."
      );
    }

    if (
      !Number.isFinite(this.#sampleIntervalSeconds) ||
      this.#sampleIntervalSeconds <= 0
    ) {
      throw new RangeError(
        "Trajectory sample interval must be finite and positive."
      );
    }

    this.replaceBodyIds(bodyIds);
  }

  get bodyIds(): readonly string[] {
    return this.#bodyIds;
  }

  get maxPointsPerBody(): number {
    return this.#maxPointsPerBody;
  }

  hasBody(bodyId: string): boolean {
    return this.#trajectories.has(bodyId);
  }

  pointCount(bodyId: string): number {
    return this.#trajectory(bodyId).pointCount;
  }

  shouldSample(
    realDeltaSeconds: number,
    simulationRunning: boolean
  ): boolean {
    if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds < 0) {
      throw new RangeError(
        "Trajectory frame delta must be finite and non-negative."
      );
    }

    if (!simulationRunning) {
      return false;
    }

    if (this.#ignoreNextRunningDelta) {
      this.#ignoreNextRunningDelta = false;
      return false;
    }

    this.#elapsedActiveSeconds += realDeltaSeconds;

    if (this.#elapsedActiveSeconds < this.#sampleIntervalSeconds) {
      return false;
    }

    this.#elapsedActiveSeconds %= this.#sampleIntervalSeconds;
    return true;
  }

  rebaseSamplingClock(): void {
    this.#ignoreNextRunningDelta = true;
  }

  append(bodyId: string, point: RenderedCameraPoint): void {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    ) {
      throw new RangeError(
        "Trajectory points must contain finite rendered coordinates."
      );
    }

    const trajectory = this.#trajectory(bodyId);
    const writePoint =
      trajectory.pointCount < this.#maxPointsPerBody
        ? (trajectory.startPoint + trajectory.pointCount) %
          this.#maxPointsPerBody
        : trajectory.startPoint;
    const offset = writePoint * 3;

    trajectory.positions[offset] = point.x;
    trajectory.positions[offset + 1] = point.y;
    trajectory.positions[offset + 2] = point.z;

    if (trajectory.pointCount < this.#maxPointsPerBody) {
      trajectory.pointCount += 1;
    } else {
      trajectory.startPoint =
        (trajectory.startPoint + 1) % this.#maxPointsPerBody;
    }
  }

  copyPositionsTo(bodyId: string, target: Float32Array): number {
    if (target.length < this.#maxPointsPerBody * 3) {
      throw new RangeError(
        "Trajectory target buffer is smaller than the configured capacity."
      );
    }

    const trajectory = this.#trajectory(bodyId);

    for (let pointIndex = 0; pointIndex < trajectory.pointCount; pointIndex += 1) {
      const sourcePoint =
        (trajectory.startPoint + pointIndex) % this.#maxPointsPerBody;
      const sourceOffset = sourcePoint * 3;
      const targetOffset = pointIndex * 3;

      target[targetOffset] = trajectory.positions[sourceOffset];
      target[targetOffset + 1] = trajectory.positions[sourceOffset + 1];
      target[targetOffset + 2] = trajectory.positions[sourceOffset + 2];
    }

    return trajectory.pointCount;
  }

  clear(): void {
    for (const trajectory of this.#trajectories.values()) {
      trajectory.startPoint = 0;
      trajectory.pointCount = 0;
    }

    this.#elapsedActiveSeconds = 0;
  }

  reconcileBodyIds(bodyIds: readonly string[]): void {
    validateBodyIds(bodyIds);
    const nextIds = new Set(bodyIds);

    for (const bodyId of this.#bodyIds) {
      if (!nextIds.has(bodyId)) {
        this.#trajectories.delete(bodyId);
      }
    }

    for (const bodyId of bodyIds) {
      if (!this.#trajectories.has(bodyId)) {
        this.#trajectories.set(
          bodyId,
          createBodyTrajectory(this.#maxPointsPerBody)
        );
      }
    }

    this.#bodyIds = Object.freeze([...bodyIds]);
  }

  replaceBodyIds(bodyIds: readonly string[]): void {
    validateBodyIds(bodyIds);
    this.#trajectories = new Map(
      bodyIds.map((bodyId) => [
        bodyId,
        createBodyTrajectory(this.#maxPointsPerBody),
      ])
    );
    this.#bodyIds = Object.freeze([...bodyIds]);
    this.#elapsedActiveSeconds = 0;
    this.#ignoreNextRunningDelta = true;
  }

  #trajectory(bodyId: string): BodyTrajectory {
    const trajectory = this.#trajectories.get(bodyId);

    if (trajectory === undefined) {
      throw new RangeError(`Unknown trajectory body id "${bodyId}".`);
    }

    return trajectory;
  }
}
