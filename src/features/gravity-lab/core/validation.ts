import {
  MAX_NEWTONIAN_BODIES,
  type NewtonianSimulationConfig,
} from "./types";
import {
  isFiniteVector3,
  magnitudeSquaredVector3,
  subtractVector3,
} from "./vector3";

export class SimulationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationConfigurationError";
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SimulationConfigurationError(
      `${label} must be a finite number greater than zero.`
    );
  }
}

export function validateSimulationConfig(
  config: NewtonianSimulationConfig
): void {
  if (
    config.bodies.length < 1 ||
    config.bodies.length > MAX_NEWTONIAN_BODIES
  ) {
    throw new SimulationConfigurationError(
      `A simulation must contain between 1 and ${MAX_NEWTONIAN_BODIES} bodies.`
    );
  }

  assertPositiveFinite(config.timeStepSeconds, "The fixed time step");
  assertPositiveFinite(
    config.encounterThresholds.maxRelativeDisplacementPerStep,
    "The relative-displacement encounter threshold"
  );
  assertPositiveFinite(
    config.encounterThresholds.maxDynamicalStep,
    "The dynamical-step encounter threshold"
  );

  if (
    config.encounterThresholds.maxRelativeDisplacementPerStep > 1 ||
    config.encounterThresholds.maxDynamicalStep > 1
  ) {
    throw new SimulationConfigurationError(
      "Encounter thresholds must not exceed one."
    );
  }

  const identifiers = new Set<string>();

  for (const body of config.bodies) {
    if (body.id.trim().length === 0) {
      throw new SimulationConfigurationError("Every body needs an identifier.");
    }

    if (identifiers.has(body.id)) {
      throw new SimulationConfigurationError(
        `Body identifiers must be unique; received "${body.id}" twice.`
      );
    }
    identifiers.add(body.id);

    if (body.name.trim().length === 0) {
      throw new SimulationConfigurationError(
        `Body "${body.id}" needs a display name.`
      );
    }

    assertPositiveFinite(body.massKg, `Mass of body "${body.id}"`);

    if (
      !Number.isFinite(body.physicalRadiusM) ||
      body.physicalRadiusM < 0
    ) {
      throw new SimulationConfigurationError(
        `Physical radius of body "${body.id}" must be finite and non-negative.`
      );
    }

    if (
      !isFiniteVector3(body.initialPositionM) ||
      !isFiniteVector3(body.initialVelocityMps)
    ) {
      throw new SimulationConfigurationError(
        `Initial position and velocity of body "${body.id}" must be finite 3D vectors.`
      );
    }

    if (
      body.fixed &&
      magnitudeSquaredVector3(body.initialVelocityMps) !== 0
    ) {
      throw new SimulationConfigurationError(
        `Fixed body "${body.id}" must have a zero initial velocity.`
      );
    }
  }

  for (let firstIndex = 0; firstIndex < config.bodies.length; firstIndex += 1) {
    const firstBody = config.bodies[firstIndex];

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < config.bodies.length;
      secondIndex += 1
    ) {
      const secondBody = config.bodies[secondIndex];
      const difference = subtractVector3(
        secondBody.initialPositionM,
        firstBody.initialPositionM
      );
      const separationSquared = magnitudeSquaredVector3(difference);
      const contactDistance =
        firstBody.physicalRadiusM + secondBody.physicalRadiusM;

      if (
        separationSquared === 0 ||
        separationSquared <= contactDistance * contactDistance
      ) {
        throw new SimulationConfigurationError(
          `Bodies "${firstBody.id}" and "${secondBody.id}" overlap in the initial configuration.`
        );
      }
    }
  }
}
