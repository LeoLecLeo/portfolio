import { describe, expect, it } from "vitest";

import { createInclinedBinaryConfig } from "../presets/inclinedBinary";
import type {
  CelestialBodyDefinition,
  NewtonianSimulationConfig,
} from "./types";
import {
  SimulationConfigurationError,
  validateSimulationConfig,
} from "./validation";
import { vector3 } from "./vector3";

function bodyAt(index: number): CelestialBodyDefinition {
  return {
    id: `body-${index}`,
    name: `Body ${index}`,
    massKg: 1e20,
    physicalRadiusM: 0,
    fixed: false,
    initialPositionM: vector3(index * 1e9, index * 2e9, index * -3e9),
    initialVelocityMps: vector3(0, 0, 0),
  };
}

function withBodies(
  bodies: readonly CelestialBodyDefinition[]
): NewtonianSimulationConfig {
  return {
    bodies,
    timeStepSeconds: 1,
    encounterThresholds: {
      maxRelativeDisplacementPerStep: 0.02,
      maxDynamicalStep: 0.02,
    },
  };
}

describe("simulation configuration validation", () => {
  it("accepts the inclined binary preset", () => {
    expect(() =>
      validateSimulationConfig(createInclinedBinaryConfig())
    ).not.toThrow();
  });

  it("rejects duplicate identifiers", () => {
    const first = bodyAt(1);
    const second = { ...bodyAt(2), id: first.id };

    expect(() => validateSimulationConfig(withBodies([first, second]))).toThrow(
      SimulationConfigurationError
    );
  });

  it("rejects invalid masses and non-finite 3D coordinates", () => {
    expect(() =>
      validateSimulationConfig(
        withBodies([{ ...bodyAt(1), massKg: 0 }])
      )
    ).toThrow(/Mass/);

    expect(() =>
      validateSimulationConfig(
        withBodies([
          {
            ...bodyAt(1),
            initialPositionM: vector3(0, Number.NaN, 0),
          },
        ])
      )
    ).toThrow(/finite 3D vectors/);
  });

  it("requires a fixed body to have zero initial velocity", () => {
    expect(() =>
      validateSimulationConfig(
        withBodies([
          {
            ...bodyAt(1),
            fixed: true,
            initialVelocityMps: vector3(0, 0, 1),
          },
        ])
      )
    ).toThrow(/zero initial velocity/);
  });

  it("rejects an initial overlap", () => {
    const first = {
      ...bodyAt(1),
      physicalRadiusM: 10,
      initialPositionM: vector3(0, 0, 0),
    };
    const second = {
      ...bodyAt(2),
      physicalRadiusM: 10,
      initialPositionM: vector3(15, 0, 0),
    };

    expect(() => validateSimulationConfig(withBodies([first, second]))).toThrow(
      /overlap/
    );
  });

  it("enforces the public body-count ceiling without specializing N=2", () => {
    const seventeenBodies = Array.from({ length: 17 }, (_, index) =>
      bodyAt(index + 1)
    );

    expect(() =>
      validateSimulationConfig(withBodies(seventeenBodies))
    ).toThrow(/between 1 and 16 bodies/);
  });
});
