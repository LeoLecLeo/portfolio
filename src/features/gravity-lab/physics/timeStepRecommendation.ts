import type { CelestialBodyDefinition } from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";

export type PrecisionProfile = "fast" | "balanced" | "precise";

export const PRECISION_PROFILE_TARGETS = Object.freeze({
  fast: 0.01,
  balanced: 0.005,
  precise: 0.0025,
} as const satisfies Readonly<Record<PrecisionProfile, number>>);

export type TimeStepTimescaleKind =
  | "relative-traversal"
  | "gravitational-dynamical"
  | "time-to-contact";

export type TimeStepTimescaleMinimum = Readonly<{
  kind: TimeStepTimescaleKind;
  seconds: number;
  firstBodyId: string;
  secondBodyId: string;
}>;

type TimeStepRecommendationBase = Readonly<{
  profile: PrecisionProfile;
  qTarget: number;
  relativeTraversal: TimeStepTimescaleMinimum | null;
  gravitationalDynamical: TimeStepTimescaleMinimum | null;
  timeToContact: TimeStepTimescaleMinimum | null;
}>;

export type BoundedTimeStepRecommendation =
  TimeStepRecommendationBase &
    Readonly<{
      kind: "bounded";
      recommendedTimeStepSeconds: number;
      limiter: TimeStepTimescaleMinimum;
    }>;

export type UnconstrainedTimeStepRecommendation =
  TimeStepRecommendationBase &
    Readonly<{
      kind: "unconstrained";
      recommendedTimeStepSeconds: null;
      limiter: null;
    }>;

export type TimeStepRecommendation =
  | BoundedTimeStepRecommendation
  | UnconstrainedTimeStepRecommendation;

export type TimeStepBudget = Readonly<{
  simulatedSecondsPerRealSecond: number;
  maxSubStepsPerTick: number;
  maxFrameDeltaSeconds: number;
}>;

export type TimeStepBudgetAssessment = Readonly<{
  requiredSubStepsAtMaximumFrame: number;
  exceedsBudget: boolean;
}>;

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and greater than zero.`);
  }
}

function assertValidatedBodies(
  bodies: readonly CelestialBodyDefinition[]
): void {
  if (bodies.length < 1) {
    throw new RangeError(
      "A time-step recommendation needs at least one body."
    );
  }

  for (const body of bodies) {
    assertPositiveFinite(body.massKg, `Mass of body "${body.id}"`);

    if (
      !Number.isFinite(body.physicalRadiusM) ||
      body.physicalRadiusM < 0
    ) {
      throw new RangeError(
        `Physical radius of body "${body.id}" must be finite and non-negative.`
      );
    }

    const position = body.initialPositionM;
    const velocity = body.initialVelocityMps;

    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z) ||
      !Number.isFinite(velocity.x) ||
      !Number.isFinite(velocity.y) ||
      !Number.isFinite(velocity.z)
    ) {
      throw new RangeError(
        `Position and velocity of body "${body.id}" must be finite.`
      );
    }
  }
}

function createMinimum(
  kind: TimeStepTimescaleKind,
  seconds: number,
  firstBodyId: string,
  secondBodyId: string
): TimeStepTimescaleMinimum {
  return {
    kind,
    seconds,
    firstBodyId,
    secondBodyId,
  };
}

function updateMinimum(
  current: TimeStepTimescaleMinimum | null,
  kind: TimeStepTimescaleKind,
  seconds: number,
  firstBodyId: string,
  secondBodyId: string
): TimeStepTimescaleMinimum {
  return current === null || seconds < current.seconds
    ? createMinimum(
        kind,
        seconds,
        firstBodyId,
        secondBodyId
      )
    : current;
}

export function recommendTimeStep(
  bodies: readonly CelestialBodyDefinition[],
  profile: PrecisionProfile
): TimeStepRecommendation {
  assertValidatedBodies(bodies);

  const qTarget = PRECISION_PROFILE_TARGETS[profile];
  let relativeTraversal: TimeStepTimescaleMinimum | null = null;
  let gravitationalDynamical: TimeStepTimescaleMinimum | null = null;
  let timeToContact: TimeStepTimescaleMinimum | null = null;

  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    const firstBody = bodies[firstIndex];

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < bodies.length;
      secondIndex += 1
    ) {
      const secondBody = bodies[secondIndex];

      if (firstBody.fixed && secondBody.fixed) {
        continue;
      }

      const separationX =
        secondBody.initialPositionM.x -
        firstBody.initialPositionM.x;
      const separationY =
        secondBody.initialPositionM.y -
        firstBody.initialPositionM.y;
      const separationZ =
        secondBody.initialPositionM.z -
        firstBody.initialPositionM.z;
      const separationM = Math.hypot(
        separationX,
        separationY,
        separationZ
      );

      if (!Number.isFinite(separationM) || separationM <= 0) {
        throw new RangeError(
          `Bodies "${firstBody.id}" and "${secondBody.id}" need a positive finite separation.`
        );
      }

      const relativeVelocityX =
        secondBody.initialVelocityMps.x -
        firstBody.initialVelocityMps.x;
      const relativeVelocityY =
        secondBody.initialVelocityMps.y -
        firstBody.initialVelocityMps.y;
      const relativeVelocityZ =
        secondBody.initialVelocityMps.z -
        firstBody.initialVelocityMps.z;
      const relativeSpeedMps = Math.hypot(
        relativeVelocityX,
        relativeVelocityY,
        relativeVelocityZ
      );

      if (!Number.isFinite(relativeSpeedMps)) {
        throw new RangeError(
          `Relative speed of bodies "${firstBody.id}" and "${secondBody.id}" must be finite.`
        );
      }

      if (relativeSpeedMps > 0) {
        const traversalSeconds = separationM / relativeSpeedMps;

        if (
          Number.isNaN(traversalSeconds) ||
          traversalSeconds <= 0
        ) {
          throw new RangeError(
            `Relative traversal time of bodies "${firstBody.id}" and "${secondBody.id}" is not numerically usable.`
          );
        }

        relativeTraversal = updateMinimum(
          relativeTraversal,
          "relative-traversal",
          traversalSeconds,
          firstBody.id,
          secondBody.id
        );
      }

      const massSumKg = firstBody.massKg + secondBody.massKg;
      const gravitationalParameter =
        GRAVITATIONAL_CONSTANT_M3_KG_S2 * massSumKg;
      const dynamicalSeconds =
        separationM *
        Math.sqrt(separationM / gravitationalParameter);

      if (
        Number.isNaN(dynamicalSeconds) ||
        dynamicalSeconds <= 0
      ) {
        throw new RangeError(
          `Gravitational timescale of bodies "${firstBody.id}" and "${secondBody.id}" is not numerically usable.`
        );
      }

      gravitationalDynamical = updateMinimum(
        gravitationalDynamical,
        "gravitational-dynamical",
        dynamicalSeconds,
        firstBody.id,
        secondBody.id
      );

      const radialRelativeSpeedMps =
        (separationX / separationM) * relativeVelocityX +
        (separationY / separationM) * relativeVelocityY +
        (separationZ / separationM) * relativeVelocityZ;

      if (!Number.isFinite(radialRelativeSpeedMps)) {
        throw new RangeError(
          `Radial relative speed of bodies "${firstBody.id}" and "${secondBody.id}" is not numerically usable.`
        );
      }

      if (radialRelativeSpeedMps < 0) {
        const clearanceM =
          separationM -
          (firstBody.physicalRadiusM +
            secondBody.physicalRadiusM);

        if (!Number.isFinite(clearanceM) || clearanceM <= 0) {
          throw new RangeError(
            `Bodies "${firstBody.id}" and "${secondBody.id}" need a positive finite clearance.`
          );
        }

        const contactSeconds =
          clearanceM / -radialRelativeSpeedMps;

        if (
          Number.isNaN(contactSeconds) ||
          contactSeconds <= 0
        ) {
          throw new RangeError(
            `Time to contact of bodies "${firstBody.id}" and "${secondBody.id}" is not numerically usable.`
          );
        }

        timeToContact = updateMinimum(
          timeToContact,
          "time-to-contact",
          contactSeconds,
          firstBody.id,
          secondBody.id
        );
      }
    }
  }

  let limiter = relativeTraversal;

  if (
    gravitationalDynamical !== null &&
    (limiter === null ||
      gravitationalDynamical.seconds < limiter.seconds)
  ) {
    limiter = gravitationalDynamical;
  }

  if (
    timeToContact !== null &&
    (limiter === null || timeToContact.seconds < limiter.seconds)
  ) {
    limiter = timeToContact;
  }

  if (
    limiter === null ||
    limiter.seconds === Number.POSITIVE_INFINITY
  ) {
    return {
      kind: "unconstrained",
      profile,
      qTarget,
      recommendedTimeStepSeconds: null,
      limiter: null,
      relativeTraversal,
      gravitationalDynamical,
      timeToContact,
    };
  }

  const recommendedTimeStepSeconds = qTarget * limiter.seconds;

  if (
    !Number.isFinite(recommendedTimeStepSeconds) ||
    recommendedTimeStepSeconds <= 0
  ) {
    throw new RangeError(
      "The recommended fixed time step is not numerically usable."
    );
  }

  return {
    kind: "bounded",
    profile,
    qTarget,
    recommendedTimeStepSeconds,
    limiter,
    relativeTraversal,
    gravitationalDynamical,
    timeToContact,
  };
}

export function assessTimeStepBudget(
  timeStepSeconds: number,
  budget: TimeStepBudget
): TimeStepBudgetAssessment {
  assertPositiveFinite(timeStepSeconds, "Fixed time step");
  assertPositiveFinite(
    budget.simulatedSecondsPerRealSecond,
    "Simulation time scale"
  );
  assertPositiveFinite(
    budget.maxFrameDeltaSeconds,
    "Maximum frame delta"
  );
  assertPositiveFinite(
    budget.maxSubStepsPerTick,
    "Substep budget"
  );

  if (!Number.isInteger(budget.maxSubStepsPerTick)) {
    throw new RangeError("Substep budget must be an integer.");
  }

  const stepRatio =
    (budget.maxFrameDeltaSeconds *
      budget.simulatedSecondsPerRealSecond) /
    timeStepSeconds;
  const schedulerRoundingAllowance =
    Number.EPSILON * Math.max(1, Math.abs(stepRatio + 1)) * 8;
  // The scheduler may enter a frame with an accumulator arbitrarily close
  // to one full step, and its own floating-point allowance may round that
  // residual up at an integer boundary. Adding the same conservative allowance
  // before the ceiling avoids under-counting a hard-budget edge.
  const requiredSubStepsAtMaximumFrame = Number.isFinite(stepRatio)
    ? Math.max(
        1,
        Math.ceil(
          Math.max(0, stepRatio + schedulerRoundingAllowance)
        )
      )
    : Number.POSITIVE_INFINITY;

  return {
    requiredSubStepsAtMaximumFrame,
    exceedsBudget:
      requiredSubStepsAtMaximumFrame >
      budget.maxSubStepsPerTick,
  };
}
