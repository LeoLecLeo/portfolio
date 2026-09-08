import { vector3, type Vector3 } from "../core/vector3";

const ROOT_BISECTION_ITERATIONS = 64;

export type PeriapsisEvent = Readonly<{
  timeSeconds: number;
  distanceM: number;
  relativePositionM: Vector3;
}>;

export type PeriapsisAdvanceMeasurement = Readonly<{
  eventCount: number;
  radiansPerOrbit: number;
  rmsAngularResidualRadians: number;
}>;

function assertRelativeVector(values: Float64Array, label: string): void {
  if (values.length !== 3) {
    throw new RangeError(`${label} must contain exactly three components.`);
  }

  for (let axis = 0; axis < 3; axis += 1) {
    if (!Number.isFinite(values[axis])) {
      throw new RangeError(`${label} must contain only finite components.`);
    }
  }
}

function hermitePositionComponent(
  startPosition: number,
  startVelocity: number,
  endPosition: number,
  endVelocity: number,
  timeStepSeconds: number,
  fraction: number
): number {
  const fractionSquared = fraction * fraction;
  const fractionCubed = fractionSquared * fraction;
  const startPositionWeight = 2 * fractionCubed - 3 * fractionSquared + 1;
  const startVelocityWeight =
    fractionCubed - 2 * fractionSquared + fraction;
  const endPositionWeight = -2 * fractionCubed + 3 * fractionSquared;
  const endVelocityWeight = fractionCubed - fractionSquared;

  return (
    startPositionWeight * startPosition +
    startVelocityWeight * timeStepSeconds * startVelocity +
    endPositionWeight * endPosition +
    endVelocityWeight * timeStepSeconds * endVelocity
  );
}

function hermiteFractionDerivativeComponent(
  startPosition: number,
  startVelocity: number,
  endPosition: number,
  endVelocity: number,
  timeStepSeconds: number,
  fraction: number
): number {
  const fractionSquared = fraction * fraction;
  const startPositionWeight = 6 * fractionSquared - 6 * fraction;
  const startVelocityWeight =
    3 * fractionSquared - 4 * fraction + 1;
  const endPositionWeight = -6 * fractionSquared + 6 * fraction;
  const endVelocityWeight = 3 * fractionSquared - 2 * fraction;

  return (
    startPositionWeight * startPosition +
    startVelocityWeight * timeStepSeconds * startVelocity +
    endPositionWeight * endPosition +
    endVelocityWeight * timeStepSeconds * endVelocity
  );
}

function radialStationarityAtFraction(
  startPositionM: Float64Array,
  startVelocityMps: Float64Array,
  endPositionM: Float64Array,
  endVelocityMps: Float64Array,
  timeStepSeconds: number,
  fraction: number
): number {
  let dotProduct = 0;

  for (let axis = 0; axis < 3; axis += 1) {
    const position = hermitePositionComponent(
      startPositionM[axis],
      startVelocityMps[axis],
      endPositionM[axis],
      endVelocityMps[axis],
      timeStepSeconds,
      fraction
    );
    const fractionDerivative = hermiteFractionDerivativeComponent(
      startPositionM[axis],
      startVelocityMps[axis],
      endPositionM[axis],
      endVelocityMps[axis],
      timeStepSeconds,
      fraction
    );
    dotProduct += position * fractionDerivative;
  }

  return dotProduct;
}

function radialMotionSign(
  positionM: Float64Array,
  velocityMps: Float64Array
): number {
  return (
    positionM[0] * velocityMps[0] +
    positionM[1] * velocityMps[1] +
    positionM[2] * velocityMps[2]
  );
}

/**
 * Detects a negative-to-positive radial-velocity crossing, then locates the
 * minimum of |r| inside the accepted step. Position is represented by the
 * cubic Hermite interpolant constrained by both endpoint positions and
 * velocities. The root of r(u) dot dr(u)/du is solved by deterministic
 * bisection, so the event is not snapped to a discrete simulation sample.
 */
export function detectPeriapsisBetweenStates(
  startPositionM: Float64Array,
  startVelocityMps: Float64Array,
  endPositionM: Float64Array,
  endVelocityMps: Float64Array,
  startTimeSeconds: number,
  timeStepSeconds: number
): PeriapsisEvent | null {
  assertRelativeVector(startPositionM, "Periapsis start position");
  assertRelativeVector(startVelocityMps, "Periapsis start velocity");
  assertRelativeVector(endPositionM, "Periapsis end position");
  assertRelativeVector(endVelocityMps, "Periapsis end velocity");

  if (!Number.isFinite(startTimeSeconds) || startTimeSeconds < 0) {
    throw new RangeError("Periapsis start time must be finite and non-negative.");
  }

  if (!Number.isFinite(timeStepSeconds) || timeStepSeconds <= 0) {
    throw new RangeError(
      "Periapsis interpolation step must be finite and strictly positive."
    );
  }

  const startRadialMotion = radialMotionSign(
    startPositionM,
    startVelocityMps
  );
  const endRadialMotion = radialMotionSign(endPositionM, endVelocityMps);

  if (!(startRadialMotion < 0 && endRadialMotion >= 0)) {
    return null;
  }

  let lowerFraction = 0;
  let upperFraction = 1;

  for (let iteration = 0; iteration < ROOT_BISECTION_ITERATIONS; iteration += 1) {
    const middleFraction = (lowerFraction + upperFraction) * 0.5;
    const middleRadialStationarity = radialStationarityAtFraction(
      startPositionM,
      startVelocityMps,
      endPositionM,
      endVelocityMps,
      timeStepSeconds,
      middleFraction
    );

    if (!Number.isFinite(middleRadialStationarity)) {
      throw new RangeError(
        "Periapsis Hermite interpolation produced a non-finite value."
      );
    }

    if (middleRadialStationarity <= 0) {
      lowerFraction = middleFraction;
    } else {
      upperFraction = middleFraction;
    }
  }

  const eventFraction = (lowerFraction + upperFraction) * 0.5;
  const relativePositionM = vector3(
    hermitePositionComponent(
      startPositionM[0],
      startVelocityMps[0],
      endPositionM[0],
      endVelocityMps[0],
      timeStepSeconds,
      eventFraction
    ),
    hermitePositionComponent(
      startPositionM[1],
      startVelocityMps[1],
      endPositionM[1],
      endVelocityMps[1],
      timeStepSeconds,
      eventFraction
    ),
    hermitePositionComponent(
      startPositionM[2],
      startVelocityMps[2],
      endPositionM[2],
      endVelocityMps[2],
      timeStepSeconds,
      eventFraction
    )
  );
  const distanceM = Math.hypot(
    relativePositionM.x,
    relativePositionM.y,
    relativePositionM.z
  );
  const timeSeconds = startTimeSeconds + eventFraction * timeStepSeconds;

  if (!Number.isFinite(distanceM) || distanceM <= 0 || !Number.isFinite(timeSeconds)) {
    throw new RangeError("Periapsis interpolation produced an invalid event.");
  }

  return Object.freeze({
    timeSeconds,
    distanceM,
    relativePositionM: Object.freeze(relativePositionM),
  });
}

export function createOrbitalPlaneNormal(
  relativePositionM: Float64Array,
  relativeVelocityMps: Float64Array
): Vector3 {
  assertRelativeVector(relativePositionM, "Orbital relative position");
  assertRelativeVector(relativeVelocityMps, "Orbital relative velocity");

  const normalX =
    relativePositionM[1] * relativeVelocityMps[2] -
    relativePositionM[2] * relativeVelocityMps[1];
  const normalY =
    relativePositionM[2] * relativeVelocityMps[0] -
    relativePositionM[0] * relativeVelocityMps[2];
  const normalZ =
    relativePositionM[0] * relativeVelocityMps[1] -
    relativePositionM[1] * relativeVelocityMps[0];
  const magnitude = Math.hypot(normalX, normalY, normalZ);

  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    throw new RangeError("Orbital plane is undefined for zero angular momentum.");
  }

  return Object.freeze(
    vector3(normalX / magnitude, normalY / magnitude, normalZ / magnitude)
  );
}

export function measurePeriapsisAdvance(
  events: readonly PeriapsisEvent[],
  orbitalPlaneNormal: Vector3
): PeriapsisAdvanceMeasurement {
  if (events.length < 3) {
    throw new RangeError(
      "Periapsis advance requires at least three detected events."
    );
  }

  const normalMagnitude = Math.hypot(
    orbitalPlaneNormal.x,
    orbitalPlaneNormal.y,
    orbitalPlaneNormal.z
  );

  if (!Number.isFinite(normalMagnitude) || normalMagnitude <= 0) {
    throw new RangeError("Periapsis measurement requires a finite plane normal.");
  }

  const normalX = orbitalPlaneNormal.x / normalMagnitude;
  const normalY = orbitalPlaneNormal.y / normalMagnitude;
  const normalZ = orbitalPlaneNormal.z / normalMagnitude;
  const reference = events[0].relativePositionM;
  const referenceMagnitude = events[0].distanceM;
  const referenceX = reference.x / referenceMagnitude;
  const referenceY = reference.y / referenceMagnitude;
  const referenceZ = reference.z / referenceMagnitude;
  const unwrappedAngles = new Float64Array(events.length);
  let previousWrappedAngle = 0;
  let previousUnwrappedAngle = 0;

  for (let eventIndex = 1; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    const directionX = event.relativePositionM.x / event.distanceM;
    const directionY = event.relativePositionM.y / event.distanceM;
    const directionZ = event.relativePositionM.z / event.distanceM;
    const crossX = referenceY * directionZ - referenceZ * directionY;
    const crossY = referenceZ * directionX - referenceX * directionZ;
    const crossZ = referenceX * directionY - referenceY * directionX;
    const sine = normalX * crossX + normalY * crossY + normalZ * crossZ;
    const cosine =
      referenceX * directionX +
      referenceY * directionY +
      referenceZ * directionZ;
    const wrappedAngle = Math.atan2(sine, cosine);
    let angularIncrement = wrappedAngle - previousWrappedAngle;

    if (angularIncrement > Math.PI) {
      angularIncrement -= 2 * Math.PI;
    } else if (angularIncrement < -Math.PI) {
      angularIncrement += 2 * Math.PI;
    }

    const unwrappedAngle = previousUnwrappedAngle + angularIncrement;
    unwrappedAngles[eventIndex] = unwrappedAngle;
    previousWrappedAngle = wrappedAngle;
    previousUnwrappedAngle = unwrappedAngle;
  }

  const meanIndex = (events.length - 1) * 0.5;
  let meanAngle = 0;

  for (const angle of unwrappedAngles) {
    meanAngle += angle;
  }

  meanAngle /= events.length;
  let covariance = 0;
  let indexVariance = 0;

  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const centeredIndex = eventIndex - meanIndex;
    covariance += centeredIndex * (unwrappedAngles[eventIndex] - meanAngle);
    indexVariance += centeredIndex * centeredIndex;
  }

  const radiansPerOrbit = covariance / indexVariance;
  const intercept = meanAngle - radiansPerOrbit * meanIndex;
  let squaredResidualSum = 0;

  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const residual =
      unwrappedAngles[eventIndex] -
      (intercept + radiansPerOrbit * eventIndex);
    squaredResidualSum += residual * residual;
  }

  const rmsAngularResidualRadians = Math.sqrt(
    squaredResidualSum / events.length
  );

  if (
    !Number.isFinite(radiansPerOrbit) ||
    !Number.isFinite(rmsAngularResidualRadians)
  ) {
    throw new RangeError("Periapsis advance measurement is non-finite.");
  }

  return Object.freeze({
    eventCount: events.length,
    radiansPerOrbit,
    rmsAngularResidualRadians,
  });
}
