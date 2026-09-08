import {
  ASTRONOMICAL_UNIT_M,
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SOLAR_MASS_KG,
  SOLAR_RADIUS_M,
  SECONDS_PER_HOUR,
  SPEED_OF_LIGHT_MPS,
} from "../core/units";
import {
  createNewtonianValidityWorkspace,
  evaluateNewtonianValidityInto,
  materializeNewtonianValidityReport,
  type NewtonianValidityReport,
} from "../physics/newtonianValidity";
import {
  createOrbitalPlaneNormal,
  detectPeriapsisBetweenStates,
  measurePeriapsisAdvance,
  type PeriapsisAdvanceMeasurement,
  type PeriapsisEvent,
} from "../physics/periapsisMeasurement";
import {
  HeadlessGravitySimulation,
  type HeadlessGravityInitialState,
  type HeadlessGravityModel,
} from "./headlessGravitySimulation";

export const MERCURY_MASS_KG = 3.3011e23;
export const MERCURY_RADIUS_M = 2_439_700;
export const MERCURY_SEMIMAJOR_AXIS_M =
  0.387_098_93 * ASTRONOMICAL_UNIT_M;
export const MERCURY_ECCENTRICITY = 0.205_630;
export const MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS =
  SECONDS_PER_HOUR;

const MERCURY_TOTAL_MASS_KG = SOLAR_MASS_KG + MERCURY_MASS_KG;
const MERCURY_GRAVITATIONAL_PARAMETER =
  GRAVITATIONAL_CONSTANT_M3_KG_S2 * MERCURY_TOTAL_MASS_KG;
export const MERCURY_ORBITAL_PERIOD_SECONDS =
  2 *
  Math.PI *
  Math.sqrt(
    (MERCURY_SEMIMAJOR_AXIS_M *
      MERCURY_SEMIMAJOR_AXIS_M *
      MERCURY_SEMIMAJOR_AXIS_M) /
      MERCURY_GRAVITATIONAL_PARAMETER
  );
export const MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT =
  (6 *
    Math.PI *
    MERCURY_GRAVITATIONAL_PARAMETER) /
  (MERCURY_SEMIMAJOR_AXIS_M *
    (1 - MERCURY_ECCENTRICITY * MERCURY_ECCENTRICITY) *
    SPEED_OF_LIGHT_MPS *
    SPEED_OF_LIGHT_MPS);

export type MercuryObservedDomain = Readonly<{
  maximumBeta: number;
  maximumChiPair: number;
  maximumChiSelf: number;
  maximumPsi: number;
}>;

export type MercuryPerihelionRun = Readonly<{
  model: HeadlessGravityModel;
  timeStepSeconds: number;
  stepCount: number;
  simulatedTimeSeconds: number;
  periapsisEvents: readonly PeriapsisEvent[];
  measurement: PeriapsisAdvanceMeasurement;
  initialValidity: NewtonianValidityReport;
  observedDomain: MercuryObservedDomain;
}>;

export type MercuryPerihelionComparison = Readonly<{
  timeStepSeconds: number;
  analyticalAdvanceRadiansPerOrbit: number;
  newtonian: MercuryPerihelionRun;
  firstPostNewtonian: MercuryPerihelionRun;
  differentialAdvanceRadiansPerOrbit: number;
  relativeError: number;
}>;

export function createMercuryValidationInitialState(): HeadlessGravityInitialState {
  const perihelionDistanceM =
    MERCURY_SEMIMAJOR_AXIS_M * (1 - MERCURY_ECCENTRICITY);
  const relativePerihelionSpeedMps = Math.sqrt(
    (MERCURY_GRAVITATIONAL_PARAMETER * (1 + MERCURY_ECCENTRICITY)) /
      perihelionDistanceM
  );
  const solarMassFraction = SOLAR_MASS_KG / MERCURY_TOTAL_MASS_KG;
  const mercuryMassFraction = MERCURY_MASS_KG / MERCURY_TOTAL_MASS_KG;

  return Object.freeze({
    massesKg: new Float64Array([SOLAR_MASS_KG, MERCURY_MASS_KG]),
    positionsM: new Float64Array([
      -mercuryMassFraction * perihelionDistanceM,
      0,
      0,
      solarMassFraction * perihelionDistanceM,
      0,
      0,
    ]),
    velocitiesMps: new Float64Array([
      0,
      -mercuryMassFraction * relativePerihelionSpeedMps,
      0,
      0,
      solarMassFraction * relativePerihelionSpeedMps,
      0,
    ]),
  });
}

function writeRelativeVector(
  firstBodyVector: Float64Array,
  outputRelativeVector: Float64Array
): void {
  outputRelativeVector[0] = firstBodyVector[3] - firstBodyVector[0];
  outputRelativeVector[1] = firstBodyVector[4] - firstBodyVector[1];
  outputRelativeVector[2] = firstBodyVector[5] - firstBodyVector[2];
}

export function runMercuryPerihelionExperiment(
  model: HeadlessGravityModel,
  timeStepSeconds: number,
  requestedEventCount = 12
): MercuryPerihelionRun {
  if (!Number.isInteger(requestedEventCount) || requestedEventCount < 3) {
    throw new RangeError(
      "Mercury validation requires at least three periapsis events."
    );
  }

  const initialState = createMercuryValidationInitialState();
  const simulation = new HeadlessGravitySimulation({
    model,
    timeStepSeconds,
    initialState,
  });
  const previousPositionsM = new Float64Array(6);
  const previousVelocitiesMps = new Float64Array(6);
  const currentPositionsM = initialState.positionsM.slice();
  const currentVelocitiesMps = initialState.velocitiesMps.slice();
  const startRelativePositionM = new Float64Array(3);
  const startRelativeVelocityMps = new Float64Array(3);
  const endRelativePositionM = new Float64Array(3);
  const endRelativeVelocityMps = new Float64Array(3);
  writeRelativeVector(currentPositionsM, startRelativePositionM);
  writeRelativeVector(currentVelocitiesMps, startRelativeVelocityMps);
  const orbitalPlaneNormal = createOrbitalPlaneNormal(
    startRelativePositionM,
    startRelativeVelocityMps
  );
  const validityWorkspace = createNewtonianValidityWorkspace(2);
  const physicalRadiiM = new Float64Array([
    SOLAR_RADIUS_M,
    MERCURY_RADIUS_M,
  ]);
  const fixed = new Uint8Array(2);
  evaluateNewtonianValidityInto(
    initialState.massesKg,
    physicalRadiiM,
    fixed,
    initialState.positionsM,
    initialState.velocitiesMps,
    validityWorkspace
  );
  const initialValidity = materializeNewtonianValidityReport(
    ["sun", "mercury"],
    validityWorkspace
  );
  let maximumBeta = validityWorkspace.maximumBeta;
  let maximumChiPair = validityWorkspace.maximumPairCompactness;
  let maximumChiSelf = validityWorkspace.maximumSelfCompactness;
  let maximumPsi = validityWorkspace.maximumLocalPotential;
  const periapsisEvents: PeriapsisEvent[] = [];
  const fixedStepCount = Math.ceil(
    ((requestedEventCount + 0.25) * MERCURY_ORBITAL_PERIOD_SECONDS) /
      timeStepSeconds
  );

  while (simulation.stepCount < fixedStepCount) {
    previousPositionsM.set(currentPositionsM);
    previousVelocitiesMps.set(currentVelocitiesMps);
    const startTimeSeconds = simulation.timeSeconds;
    simulation.advanceOneStep();
    simulation.copyPositionsTo(currentPositionsM);
    simulation.copyVelocitiesTo(currentVelocitiesMps);
    writeRelativeVector(previousPositionsM, startRelativePositionM);
    writeRelativeVector(previousVelocitiesMps, startRelativeVelocityMps);
    writeRelativeVector(currentPositionsM, endRelativePositionM);
    writeRelativeVector(currentVelocitiesMps, endRelativeVelocityMps);
    const event = detectPeriapsisBetweenStates(
      startRelativePositionM,
      startRelativeVelocityMps,
      endRelativePositionM,
      endRelativeVelocityMps,
      startTimeSeconds,
      timeStepSeconds
    );

    if (event !== null) {
      periapsisEvents.push(event);
    }

    evaluateNewtonianValidityInto(
      initialState.massesKg,
      physicalRadiiM,
      fixed,
      currentPositionsM,
      currentVelocitiesMps,
      validityWorkspace
    );
    maximumBeta = Math.max(maximumBeta, validityWorkspace.maximumBeta);
    maximumChiPair = Math.max(
      maximumChiPair,
      validityWorkspace.maximumPairCompactness
    );
    maximumChiSelf = Math.max(
      maximumChiSelf,
      validityWorkspace.maximumSelfCompactness
    );
    maximumPsi = Math.max(
      maximumPsi,
      validityWorkspace.maximumLocalPotential
    );
  }

  if (periapsisEvents.length < requestedEventCount) {
    throw new RangeError(
      `Mercury validation detected ${periapsisEvents.length} of ${requestedEventCount} requested periapsis events.`
    );
  }

  const measuredPeriapsisEvents = periapsisEvents.slice(
    0,
    requestedEventCount
  );

  return Object.freeze({
    model,
    timeStepSeconds,
    stepCount: simulation.stepCount,
    simulatedTimeSeconds: simulation.timeSeconds,
    periapsisEvents: Object.freeze(measuredPeriapsisEvents),
    measurement: measurePeriapsisAdvance(
      measuredPeriapsisEvents,
      orbitalPlaneNormal
    ),
    initialValidity,
    observedDomain: Object.freeze({
      maximumBeta,
      maximumChiPair,
      maximumChiSelf,
      maximumPsi,
    }),
  });
}

export function runMercuryPerihelionComparison(
  timeStepSeconds: number,
  requestedEventCount = 12
): MercuryPerihelionComparison {
  const newtonian = runMercuryPerihelionExperiment(
    "newtonian",
    timeStepSeconds,
    requestedEventCount
  );
  const firstPostNewtonian = runMercuryPerihelionExperiment(
    "first-post-newtonian",
    timeStepSeconds,
    requestedEventCount
  );
  const differentialAdvanceRadiansPerOrbit =
    firstPostNewtonian.measurement.radiansPerOrbit -
    newtonian.measurement.radiansPerOrbit;
  const relativeError = Math.abs(
    (differentialAdvanceRadiansPerOrbit -
      MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT) /
      MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT
  );

  return Object.freeze({
    timeStepSeconds,
    analyticalAdvanceRadiansPerOrbit:
      MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT,
    newtonian,
    firstPostNewtonian,
    differentialAdvanceRadiansPerOrbit,
    relativeError,
  });
}
