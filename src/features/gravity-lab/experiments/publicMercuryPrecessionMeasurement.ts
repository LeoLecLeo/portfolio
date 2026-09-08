import type { AppliedScenario } from "../core/scenario";
import { SECONDS_PER_JULIAN_YEAR } from "../core/units";
import type { Vector3 } from "../core/vector3";
import {
  createOrbitalPlaneNormal,
  detectPeriapsisBetweenStates,
  measurePeriapsisAdvance,
  type PeriapsisEvent,
} from "../physics/periapsisMeasurement";
import {
  MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT,
  MERCURY_ORBITAL_PERIOD_SECONDS,
  createMercuryValidationInitialState,
} from "./mercuryPerihelionExperiment";

export const PUBLIC_MERCURY_MINIMUM_PERIAPSIS_EVENTS = 5;
export const PUBLIC_MERCURY_MAXIMUM_PERIAPSIS_EVENTS = 64;
export const ARCSECONDS_PER_RADIAN = (180 * 3_600) / Math.PI;
const SECONDS_PER_JULIAN_CENTURY = 100 * SECONDS_PER_JULIAN_YEAR;

type BranchMeasurement = Readonly<{
  radiansPerOrbit: number;
  arcsecondsPerOrbit: number;
  arcsecondsPerCentury: number;
}>;

export type PublicMercuryPrecessionMeasurement =
  | Readonly<{
      kind: "collecting";
      minimumEventCount: number;
      firstPostNewtonianEventCount: number;
      newtonianEventCount: number;
      referenceArcsecondsPerOrbit: number;
      referenceArcsecondsPerCentury: number;
    }>
  | Readonly<{
      kind: "ready";
      minimumEventCount: number;
      firstPostNewtonianEventCount: number;
      newtonianEventCount: number;
      firstPostNewtonian: BranchMeasurement;
      newtonian: BranchMeasurement;
      differential: BranchMeasurement;
      referenceArcsecondsPerOrbit: number;
      referenceArcsecondsPerCentury: number;
      differenceFromReferenceArcsecondsPerCentury: number;
    }>
  | Readonly<{
      kind: "unavailable";
      reason: "scenario-not-validated" | "measurement-failed";
    }>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
}

export function radiansToArcseconds(radians: number): number {
  assertFinite(radians, "Angle in radians");
  return radians * ARCSECONDS_PER_RADIAN;
}

export function arcsecondsPerOrbitToArcsecondsPerCentury(
  arcsecondsPerOrbit: number,
  orbitalPeriodSeconds = MERCURY_ORBITAL_PERIOD_SECONDS
): number {
  assertFinite(arcsecondsPerOrbit, "Arcseconds per orbit");
  if (!Number.isFinite(orbitalPeriodSeconds) || orbitalPeriodSeconds <= 0) {
    throw new RangeError("Orbital period must be finite and positive.");
  }

  return (
    arcsecondsPerOrbit *
    (SECONDS_PER_JULIAN_CENTURY / orbitalPeriodSeconds)
  );
}

export function arcsecondsPerCenturyToArcsecondsPerOrbit(
  arcsecondsPerCentury: number,
  orbitalPeriodSeconds = MERCURY_ORBITAL_PERIOD_SECONDS
): number {
  assertFinite(arcsecondsPerCentury, "Arcseconds per century");
  if (!Number.isFinite(orbitalPeriodSeconds) || orbitalPeriodSeconds <= 0) {
    throw new RangeError("Orbital period must be finite and positive.");
  }

  return (
    arcsecondsPerCentury *
    (orbitalPeriodSeconds / SECONDS_PER_JULIAN_CENTURY)
  );
}

const REFERENCE_ARCSECONDS_PER_ORBIT = radiansToArcseconds(
  MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT
);
const REFERENCE_ARCSECONDS_PER_CENTURY =
  arcsecondsPerOrbitToArcsecondsPerCentury(
    REFERENCE_ARCSECONDS_PER_ORBIT
  );

function matchesVector(
  actual: Readonly<{ x: number; y: number; z: number }>,
  expected: Float64Array,
  offset: number
): boolean {
  return (
    actual.x === expected[offset] &&
    actual.y === expected[offset + 1] &&
    actual.z === expected[offset + 2]
  );
}

export function isValidatedSunMercuryScenario(
  scenario: AppliedScenario
): boolean {
  if (
    scenario.physics.modelId !== "first-post-newtonian" ||
    scenario.physics.bodies.length !== 2
  ) {
    return false;
  }

  const initial = createMercuryValidationInitialState();
  const sun = scenario.physics.bodies.find(({ id }) => id === "sun");
  const mercury = scenario.physics.bodies.find(
    ({ id }) => id === "mercury"
  );

  return (
    sun !== undefined &&
    mercury !== undefined &&
    !sun.fixed &&
    !mercury.fixed &&
    sun.massKg === initial.massesKg[0] &&
    mercury.massKg === initial.massesKg[1] &&
    matchesVector(sun.initialPositionM, initial.positionsM, 0) &&
    matchesVector(mercury.initialPositionM, initial.positionsM, 3) &&
    matchesVector(sun.initialVelocityMps, initial.velocitiesMps, 0) &&
    matchesVector(mercury.initialVelocityMps, initial.velocitiesMps, 3)
  );
}

function writeRelativeVector(
  source: Float64Array,
  firstBodyIndex: number,
  secondBodyIndex: number,
  target: Float64Array
): void {
  const firstOffset = firstBodyIndex * 3;
  const secondOffset = secondBodyIndex * 3;
  target[0] = source[secondOffset] - source[firstOffset];
  target[1] = source[secondOffset + 1] - source[firstOffset + 1];
  target[2] = source[secondOffset + 2] - source[firstOffset + 2];
}

function branchMeasurement(radiansPerOrbit: number): BranchMeasurement {
  const arcsecondsPerOrbit = radiansToArcseconds(radiansPerOrbit);

  return Object.freeze({
    radiansPerOrbit,
    arcsecondsPerOrbit,
    arcsecondsPerCentury:
      arcsecondsPerOrbitToArcsecondsPerCentury(arcsecondsPerOrbit),
  });
}

export class PublicMercuryPrecessionTracker {
  readonly #firstBodyIndex: number;
  readonly #secondBodyIndex: number;
  readonly #orbitalPlaneNormal: Vector3;
  readonly #newtonianPreviousPositionM = new Float64Array(3);
  readonly #newtonianPreviousVelocityMps = new Float64Array(3);
  readonly #newtonianCurrentPositionM = new Float64Array(3);
  readonly #newtonianCurrentVelocityMps = new Float64Array(3);
  readonly #firstPostNewtonianPreviousPositionM = new Float64Array(3);
  readonly #firstPostNewtonianPreviousVelocityMps = new Float64Array(3);
  readonly #firstPostNewtonianCurrentPositionM = new Float64Array(3);
  readonly #firstPostNewtonianCurrentVelocityMps = new Float64Array(3);
  readonly #newtonianEvents: PeriapsisEvent[] = [];
  readonly #firstPostNewtonianEvents: PeriapsisEvent[] = [];
  readonly #initialPositionsM: Float64Array;
  readonly #initialVelocitiesMps: Float64Array;
  #measurement: PublicMercuryPrecessionMeasurement;
  #failed = false;

  constructor(scenario: AppliedScenario) {
    if (!isValidatedSunMercuryScenario(scenario)) {
      throw new RangeError(
        "Public Mercury precession requires the validated Sun-Mercury initial state."
      );
    }

    const initial = createMercuryValidationInitialState();
    this.#initialPositionsM = initial.positionsM.slice();
    this.#initialVelocitiesMps = initial.velocitiesMps.slice();
    this.#firstBodyIndex = scenario.physics.bodies.findIndex(
      ({ id }) => id === "sun"
    );
    this.#secondBodyIndex = scenario.physics.bodies.findIndex(
      ({ id }) => id === "mercury"
    );
    writeRelativeVector(
      this.#initialPositionsM,
      this.#firstBodyIndex,
      this.#secondBodyIndex,
      this.#firstPostNewtonianPreviousPositionM
    );
    writeRelativeVector(
      this.#initialVelocitiesMps,
      this.#firstBodyIndex,
      this.#secondBodyIndex,
      this.#firstPostNewtonianPreviousVelocityMps
    );
    this.#orbitalPlaneNormal = createOrbitalPlaneNormal(
      this.#firstPostNewtonianPreviousPositionM,
      this.#firstPostNewtonianPreviousVelocityMps
    );
    this.#measurement = this.#collectingMeasurement();
    this.reset();
  }

  reset(): void {
    this.#newtonianEvents.length = 0;
    this.#firstPostNewtonianEvents.length = 0;
    this.#failed = false;
    writeRelativeVector(
      this.#initialPositionsM,
      this.#firstBodyIndex,
      this.#secondBodyIndex,
      this.#newtonianPreviousPositionM
    );
    writeRelativeVector(
      this.#initialVelocitiesMps,
      this.#firstBodyIndex,
      this.#secondBodyIndex,
      this.#newtonianPreviousVelocityMps
    );
    this.#firstPostNewtonianPreviousPositionM.set(
      this.#newtonianPreviousPositionM
    );
    this.#firstPostNewtonianPreviousVelocityMps.set(
      this.#newtonianPreviousVelocityMps
    );
    this.#measurement = this.#collectingMeasurement();
  }

  observeSynchronizedStep(
    startTimeSeconds: number,
    timeStepSeconds: number,
    newtonianPositionsM: Float64Array,
    newtonianVelocitiesMps: Float64Array,
    firstPostNewtonianPositionsM: Float64Array,
    firstPostNewtonianVelocitiesMps: Float64Array
  ): void {
    if (this.#failed) {
      return;
    }

    try {
      writeRelativeVector(
        newtonianPositionsM,
        this.#firstBodyIndex,
        this.#secondBodyIndex,
        this.#newtonianCurrentPositionM
      );
      writeRelativeVector(
        newtonianVelocitiesMps,
        this.#firstBodyIndex,
        this.#secondBodyIndex,
        this.#newtonianCurrentVelocityMps
      );
      writeRelativeVector(
        firstPostNewtonianPositionsM,
        this.#firstBodyIndex,
        this.#secondBodyIndex,
        this.#firstPostNewtonianCurrentPositionM
      );
      writeRelativeVector(
        firstPostNewtonianVelocitiesMps,
        this.#firstBodyIndex,
        this.#secondBodyIndex,
        this.#firstPostNewtonianCurrentVelocityMps
      );

      const newtonianEventAdded = this.#appendEvent(
        this.#newtonianEvents,
        detectPeriapsisBetweenStates(
          this.#newtonianPreviousPositionM,
          this.#newtonianPreviousVelocityMps,
          this.#newtonianCurrentPositionM,
          this.#newtonianCurrentVelocityMps,
          startTimeSeconds,
          timeStepSeconds
        )
      );
      const firstPostNewtonianEventAdded = this.#appendEvent(
        this.#firstPostNewtonianEvents,
        detectPeriapsisBetweenStates(
          this.#firstPostNewtonianPreviousPositionM,
          this.#firstPostNewtonianPreviousVelocityMps,
          this.#firstPostNewtonianCurrentPositionM,
          this.#firstPostNewtonianCurrentVelocityMps,
          startTimeSeconds,
          timeStepSeconds
        )
      );
      this.#newtonianPreviousPositionM.set(
        this.#newtonianCurrentPositionM
      );
      this.#newtonianPreviousVelocityMps.set(
        this.#newtonianCurrentVelocityMps
      );
      this.#firstPostNewtonianPreviousPositionM.set(
        this.#firstPostNewtonianCurrentPositionM
      );
      this.#firstPostNewtonianPreviousVelocityMps.set(
        this.#firstPostNewtonianCurrentVelocityMps
      );
      if (newtonianEventAdded || firstPostNewtonianEventAdded) {
        this.#refreshMeasurement();
      }
    } catch {
      this.#failed = true;
      this.#measurement = Object.freeze({
        kind: "unavailable",
        reason: "measurement-failed",
      });
    }
  }

  snapshot(): PublicMercuryPrecessionMeasurement {
    return this.#measurement;
  }

  #appendEvent(
    events: PeriapsisEvent[],
    event: PeriapsisEvent | null
  ): boolean {
    if (event === null) {
      return false;
    }

    events.push(event);
    if (events.length > PUBLIC_MERCURY_MAXIMUM_PERIAPSIS_EVENTS) {
      events.shift();
    }
    return true;
  }

  #refreshMeasurement(): void {
    if (
      this.#newtonianEvents.length < PUBLIC_MERCURY_MINIMUM_PERIAPSIS_EVENTS ||
      this.#firstPostNewtonianEvents.length <
        PUBLIC_MERCURY_MINIMUM_PERIAPSIS_EVENTS
    ) {
      this.#measurement = this.#collectingMeasurement();
      return;
    }

    const newtonian = measurePeriapsisAdvance(
      this.#newtonianEvents,
      this.#orbitalPlaneNormal
    );
    const firstPostNewtonian = measurePeriapsisAdvance(
      this.#firstPostNewtonianEvents,
      this.#orbitalPlaneNormal
    );
    const newtonianPresentation = branchMeasurement(
      newtonian.radiansPerOrbit
    );
    const firstPostNewtonianPresentation = branchMeasurement(
      firstPostNewtonian.radiansPerOrbit
    );
    const differential = branchMeasurement(
      firstPostNewtonian.radiansPerOrbit - newtonian.radiansPerOrbit
    );

    this.#measurement = Object.freeze({
      kind: "ready",
      minimumEventCount: PUBLIC_MERCURY_MINIMUM_PERIAPSIS_EVENTS,
      firstPostNewtonianEventCount:
        this.#firstPostNewtonianEvents.length,
      newtonianEventCount: this.#newtonianEvents.length,
      firstPostNewtonian: firstPostNewtonianPresentation,
      newtonian: newtonianPresentation,
      differential,
      referenceArcsecondsPerOrbit: REFERENCE_ARCSECONDS_PER_ORBIT,
      referenceArcsecondsPerCentury: REFERENCE_ARCSECONDS_PER_CENTURY,
      differenceFromReferenceArcsecondsPerCentury:
        differential.arcsecondsPerCentury -
        REFERENCE_ARCSECONDS_PER_CENTURY,
    });
  }

  #collectingMeasurement(): PublicMercuryPrecessionMeasurement {
    return Object.freeze({
      kind: "collecting",
      minimumEventCount: PUBLIC_MERCURY_MINIMUM_PERIAPSIS_EVENTS,
      firstPostNewtonianEventCount:
        this.#firstPostNewtonianEvents.length,
      newtonianEventCount: this.#newtonianEvents.length,
      referenceArcsecondsPerOrbit: REFERENCE_ARCSECONDS_PER_ORBIT,
      referenceArcsecondsPerCentury: REFERENCE_ARCSECONDS_PER_CENTURY,
    });
  }
}
