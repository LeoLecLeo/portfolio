import { describe, expect, it } from "vitest";

import { createInclinedBinaryConfig } from "../presets/inclinedBinary";
import type {
  CelestialBodyDefinition,
  NewtonianSimulationConfig,
} from "./types";
import {
  MAX_BODY_MASS_KG,
  MAX_PHYSICAL_RADIUS_M,
  MAX_POSITION_COMPONENT_M,
  SimulationConfigurationError,
  analyzeSimulationConfig,
  validateSimulationConfig,
} from "./validation";
import { SPEED_OF_LIGHT_MPS } from "./units";
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
    const sixteenBodies = Array.from({ length: 16 }, (_, index) =>
      bodyAt(index + 1)
    );
    const seventeenBodies = Array.from({ length: 17 }, (_, index) =>
      bodyAt(index + 1)
    );

    expect(() =>
      validateSimulationConfig(withBodies(sixteenBodies))
    ).not.toThrow();
    expect(() => validateSimulationConfig(withBodies([]))).toThrow(
      /between 1 and 16 bodies/
    );
    expect(() =>
      validateSimulationConfig(withBodies(seventeenBodies))
    ).toThrow(/between 1 and 16 bodies/);
  });

  it("accepts the exact product ceilings", () => {
    const report = analyzeSimulationConfig(
      withBodies([
        {
          ...bodyAt(1),
          massKg: MAX_BODY_MASS_KG,
          physicalRadiusM: MAX_PHYSICAL_RADIUS_M,
          initialPositionM: vector3(
            MAX_POSITION_COMPONENT_M,
            -MAX_POSITION_COMPONENT_M,
            MAX_POSITION_COMPONENT_M
          ),
        },
      ])
    );

    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it("rejects values immediately above every product ceiling", () => {
    const report = analyzeSimulationConfig(
      withBodies([
        {
          ...bodyAt(1),
          massKg: MAX_BODY_MASS_KG * (1 + Number.EPSILON * 2),
          physicalRadiusM:
            MAX_PHYSICAL_RADIUS_M * (1 + Number.EPSILON * 2),
          initialPositionM: vector3(
            MAX_POSITION_COMPONENT_M * (1 + Number.EPSILON * 2),
            0,
            0
          ),
        },
      ])
    );

    expect(report.errors.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "body.mass-limit",
        "body.radius-limit",
        "body.position-limit",
      ])
    );
  });

  it("accepts a point radius with an explicit self-compactness warning", () => {
    const report = analyzeSimulationConfig(withBodies([bodyAt(1)]));

    expect(report.valid).toBe(true);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "domain.point-radius-unknown",
          path: "/bodies/0/physicalRadius",
          subject: expect.objectContaining({
            kind: "body",
            bodyId: "body-1",
          }),
        }),
      ])
    );
    expect(report.newtonianValidity?.chiSelf).toBeNull();
    expect(
      report.newtonianValidity?.unknownSelfCompactnessBodyIds
    ).toEqual(["body-1"]);
  });

  it("returns multiple structured diagnostics in one pass", () => {
    const first = {
      ...bodyAt(1),
      id: "duplicate",
      massKg: 0,
      physicalRadiusM: -1,
      fixed: true,
      initialVelocityMps: vector3(1, 0, 0),
    };
    const second = {
      ...bodyAt(2),
      id: "duplicate",
      name: " ",
    };
    const report = analyzeSimulationConfig(withBodies([first, second]));

    expect(report.valid).toBe(false);
    expect(report.errors.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "body.mass-non-positive",
        "body.radius-negative",
        "body.fixed-velocity",
        "body.id-duplicate",
        "body.name-required",
      ])
    );
    expect(
      report.errors.find(
        (diagnostic) => diagnostic.code === "body.id-duplicate"
      )
    ).toEqual(
      expect.objectContaining({
        path: "/bodies/1/id",
        subject: expect.objectContaining({
          kind: "body",
          bodyId: "duplicate",
          bodyIndex: 1,
        }),
      })
    );
  });

  it("rejects exact initial contact and identifies the responsible pair", () => {
    const first = {
      ...bodyAt(1),
      physicalRadiusM: 10,
      initialPositionM: vector3(0, 0, 0),
    };
    const second = {
      ...bodyAt(2),
      physicalRadiusM: 5,
      initialPositionM: vector3(15, 0, 0),
    };
    const report = analyzeSimulationConfig(withBodies([first, second]));
    const contact = report.errors.find(
      (diagnostic) => diagnostic.code === "geometry.initial-contact"
    );

    expect(contact).toEqual(
      expect.objectContaining({
        actualValue: 15,
        limit: 15,
        subject: {
          kind: "pair",
          firstBodyId: first.id,
          secondBodyId: second.id,
          firstBodyIndex: 0,
          secondBodyIndex: 1,
        },
      })
    );
  });

  it("rejects finite inputs that overflow the initial diagnostics", () => {
    const report = analyzeSimulationConfig(
      withBodies([
        {
          ...bodyAt(1),
          initialVelocityMps: vector3(1e200, 0, 0),
        },
      ])
    );

    expect(report.newtonianValidity?.beta.value).toBe(0);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "numeric.initial-diagnostics",
          category: "numerical",
        }),
      ])
    );
  });

  it("rejects a finite time step whose first drift would overflow", () => {
    const base = withBodies([
      {
        ...bodyAt(1),
        initialVelocityMps: vector3(2, 0, 0),
      },
    ]);
    const report = analyzeSimulationConfig({
      ...base,
      timeStepSeconds: Number.MAX_VALUE,
    });

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "numeric.initial-drift",
          category: "numerical",
          path: "/bodies/0/initialPosition/x",
        }),
      ])
    );
  });

  it("rejects a hard beta violation through both report and legacy wrapper", () => {
    const fastBodies = [
      {
        ...bodyAt(1),
        initialPositionM: vector3(-1e9, 0, 0),
        initialVelocityMps: vector3(-0.06 * SPEED_OF_LIGHT_MPS, 0, 0),
      },
      {
        ...bodyAt(2),
        initialPositionM: vector3(1e9, 0, 0),
        initialVelocityMps: vector3(0.06 * SPEED_OF_LIGHT_MPS, 0, 0),
      },
    ];
    const config = withBodies(fastBodies);
    const report = analyzeSimulationConfig(config);

    expect(report.newtonianValidity?.beta.value).toBeCloseTo(0.12, 14);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "domain.beta.limit",
          category: "newtonian-domain",
          subject: expect.objectContaining({
            kind: "pair",
            firstBodyId: "body-1",
            secondBodyId: "body-2",
          }),
        }),
      ])
    );
    expect(() => validateSimulationConfig(config)).toThrow(
      SimulationConfigurationError
    );
  });

  it("reports an independent domain failure even when the step is invalid", () => {
    const config = {
      ...withBodies([
        {
          ...bodyAt(1),
          initialPositionM: vector3(-1e9, 0, 0),
          initialVelocityMps: vector3(
            -0.06 * SPEED_OF_LIGHT_MPS,
            0,
            0
          ),
        },
        {
          ...bodyAt(2),
          initialPositionM: vector3(1e9, 0, 0),
          initialVelocityMps: vector3(
            0.06 * SPEED_OF_LIGHT_MPS,
            0,
            0
          ),
        },
      ]),
      timeStepSeconds: 0,
    };
    const report = analyzeSimulationConfig(config);

    expect(report.newtonianValidity?.beta.value).toBeCloseTo(0.12, 14);
    expect(report.errors.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["config.time-step", "domain.beta.limit"])
    );
    expect(
      report.errors.some(
        (diagnostic) => diagnostic.code === "numeric.initial-drift"
      )
    ).toBe(false);
  });
});
