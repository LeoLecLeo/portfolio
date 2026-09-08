import { describe, expect, it } from "vitest";

import type {
  CelestialBodyDefinition,
  NewtonianSimulationConfig,
} from "../core/types";
import { SPEED_OF_LIGHT_MPS } from "../core/units";
import { vector3 } from "../core/vector3";
import {
  createInclinedBinaryConfig,
  INCLINED_BINARY_PERIOD_SECONDS,
  INCLINED_BINARY_STEPS_PER_PERIOD,
} from "../presets/inclinedBinary";
import { SimulationEngine } from "./SimulationEngine";

function body(
  id: string,
  position: ReturnType<typeof vector3>,
  velocity = vector3(0, 0, 0)
): CelestialBodyDefinition {
  return {
    id,
    name: id,
    massKg: 1,
    physicalRadiusM: 0,
    fixed: false,
    initialPositionM: position,
    initialVelocityMps: velocity,
  };
}

function config(
  bodies: readonly CelestialBodyDefinition[],
  timeStepSeconds = 0.01
): NewtonianSimulationConfig {
  return {
    bodies,
    timeStepSeconds,
    encounterThresholds: {
      maxRelativeDisplacementPerStep: 0.02,
      maxDynamicalStep: 0.02,
    },
  };
}

describe("mutable Newtonian simulation engine", () => {
  it("accepts and advances three bodies without a specialized branch", () => {
    const engine = new SimulationEngine(
      config([
        body("a", vector3(-1_000, 200, 300), vector3(0, 0.1, -0.2)),
        body("b", vector3(2_000, -500, 100), vector3(-0.1, 0, 0.2)),
        body("c", vector3(400, 3_000, -2_000), vector3(0.2, -0.1, 0)),
      ])
    );

    expect(engine.state.bodyIds).toEqual(["a", "b", "c"]);
    expect(engine.state.positionsM).toHaveLength(9);
    expect(engine.state.velocitiesMps).toHaveLength(9);
    expect(engine.state.accelerationsMps2).toHaveLength(9);
    expect(engine.start()).toBe(true);
    expect(engine.advanceOneStep()).toBe(true);
    expect(engine.state.timeSeconds).toBe(0.01);
  });

  it("keeps a fixed body stationary while it attracts a mobile body", () => {
    const fixedBody: CelestialBodyDefinition = {
      ...body("anchor", vector3(0, 0, 0)),
      massKg: 1e20,
      fixed: true,
    };
    const mobileBody: CelestialBodyDefinition = {
      ...body("mobile", vector3(1e9, 2e8, -3e8)),
      massKg: 1e10,
    };
    const engine = new SimulationEngine(
      config([fixedBody, mobileBody], 1_000)
    );
    const initialFixedPosition = engine.state.positionsM.slice(0, 3);
    const initialMobilePosition = engine.state.positionsM.slice(3, 6);

    engine.start();
    expect(engine.advanceOneStep()).toBe(true);

    expect(Array.from(engine.state.positionsM.slice(0, 3))).toEqual(
      Array.from(initialFixedPosition)
    );
    expect(Array.from(engine.state.velocitiesMps.slice(0, 3))).toEqual([
      0, 0, 0,
    ]);
    expect(Array.from(engine.state.positionsM.slice(3, 6))).not.toEqual(
      Array.from(initialMobilePosition)
    );
    expect(engine.diagnostics().hasFixedBodies).toBe(true);
  });

  it("resets exactly to the validated initial state", () => {
    const engine = new SimulationEngine(createInclinedBinaryConfig());
    const initialPositions = engine.state.positionsM.slice();
    const initialVelocities = engine.state.velocitiesMps.slice();

    engine.start();
    expect(engine.advanceOneStep()).toBe(true);
    engine.reset();

    expect(engine.status).toBe("paused");
    expect(engine.stopEvent).toBeNull();
    expect(engine.state.timeSeconds).toBe(0);
    expect(Array.from(engine.state.positionsM)).toEqual(
      Array.from(initialPositions)
    );
    expect(Array.from(engine.state.velocitiesMps)).toEqual(
      Array.from(initialVelocities)
    );
  });

  it("copies positions without exposing the internal position buffer", () => {
    const engine = new SimulationEngine(createInclinedBinaryConfig());
    const copiedPositions = new Float64Array(engine.bodyCount * 3);
    const initialInternalX = engine.state.positionsM[0];

    engine.copyPositionsTo(copiedPositions);
    expect(Array.from(copiedPositions)).toEqual(
      Array.from(engine.state.positionsM)
    );

    copiedPositions[0] += 123;
    expect(engine.state.positionsM[0]).toBe(initialInternalX);
    expect(() =>
      engine.copyPositionsTo(new Float64Array(copiedPositions.length - 1))
    ).toThrow(/body count/);
  });

  it("pauses before accepting a swept collision and preserves every body", () => {
    const engine = new SimulationEngine(
      config(
        [
          {
            ...body("left", vector3(-1, 0, 0), vector3(2, 0, 0)),
            physicalRadiusM: 0.1,
          },
          {
            ...body("right", vector3(1, 0, 0), vector3(-2, 0, 0)),
            physicalRadiusM: 0.1,
          },
        ],
        1
      )
    );
    const lastValidPositions = engine.state.positionsM.slice();
    const initialMasses = engine.state.massesKg.slice();

    engine.start();
    expect(engine.advanceOneStep()).toBe(false);

    expect(engine.status).toBe("collision");
    expect(engine.stopEvent?.kind).toBe("collision");
    expect(Array.from(engine.state.positionsM)).toEqual(
      Array.from(lastValidPositions)
    );
    expect(Array.from(engine.state.massesKg)).toEqual(
      Array.from(initialMasses)
    );
    expect(engine.state.bodyIds).toEqual(["left", "right"]);
  });

  it("pauses an unresolved encounter without softening or advancing", () => {
    const engine = new SimulationEngine(
      config(
        [
          body("left", vector3(-10, 0, 0), vector3(1, 0, 0)),
          body("right", vector3(10, 0, 0), vector3(-1, 0, 0)),
        ],
        1
      )
    );
    const lastValidPositions = engine.state.positionsM.slice();

    engine.start();
    expect(engine.advanceOneStep()).toBe(false);
    expect(engine.status).toBe("unresolved-encounter");
    expect(engine.stopEvent?.kind).toBe("unresolved-encounter");
    expect(engine.stopEvent?.message).toMatch(
      /Aucun adoucissement gravitationnel/
    );
    expect(Array.from(engine.state.positionsM)).toEqual(
      Array.from(lastValidPositions)
    );
  });

  it("preserves the structured cause of a candidate numerical failure", () => {
    const engine = new SimulationEngine(
      config([body("unstable", vector3(1, 2, 3))])
    );
    engine.state.accelerationsMps2[2] = Number.POSITIVE_INFINITY;

    expect(engine.start()).toBe(true);
    expect(engine.advanceOneStep()).toBe(false);
    expect(engine.status).toBe("error");
    expect(engine.stopEvent).toMatchObject({
      kind: "numerical-error",
      timeSeconds: 0,
      attemptedTimeSeconds: 0.01,
      cause: {
        buffer: "candidate-positions",
        vectorIndex: 2,
        bodyIndex: 0,
        bodyId: "unstable",
        axis: "z",
      },
    });
    expect(Object.isFrozen(engine.stopEvent)).toBe(true);
    expect(
      engine.stopEvent?.kind === "numerical-error"
        ? Object.isFrozen(engine.stopEvent.cause)
        : false
    ).toBe(true);
  });

  it("checks time overflow before committing any candidate field", () => {
    const engine = new SimulationEngine(
      config(
        [
          body(
            "slow",
            vector3(0, 0, 0),
            vector3(Number.MIN_VALUE, 0, 0)
          ),
        ],
        Number.MAX_VALUE
      )
    );

    expect(engine.start()).toBe(true);
    expect(engine.advanceOneStep()).toBe(true);
    expect(engine.state.timeSeconds).toBe(Number.MAX_VALUE);
    expect(engine.state.stepCount).toBe(1);

    const lastValid = {
      bodyIds: [...engine.state.bodyIds],
      massesKg: engine.state.massesKg.slice(),
      physicalRadiiM: engine.state.physicalRadiiM.slice(),
      fixed: engine.state.fixed.slice(),
      positionsM: engine.state.positionsM.slice(),
      velocitiesMps: engine.state.velocitiesMps.slice(),
      accelerationsMps2: engine.state.accelerationsMps2.slice(),
      timeSeconds: engine.state.timeSeconds,
      stepCount: engine.state.stepCount,
    };

    expect(engine.advanceOneStep()).toBe(false);
    expect(engine.status).toBe("error");
    expect(engine.stopEvent?.message).toMatch(
      /dernier état valide a été conservé/
    );
    expect(engine.state.bodyIds).toEqual(lastValid.bodyIds);
    expect(engine.state.massesKg).toEqual(lastValid.massesKg);
    expect(engine.state.physicalRadiiM).toEqual(
      lastValid.physicalRadiiM
    );
    expect(engine.state.fixed).toEqual(lastValid.fixed);
    expect(engine.state.positionsM).toEqual(lastValid.positionsM);
    expect(engine.state.velocitiesMps).toEqual(
      lastValid.velocitiesMps
    );
    expect(engine.state.accelerationsMps2).toEqual(
      lastValid.accelerationsMps2
    );
    expect(engine.state.timeSeconds).toBe(lastValid.timeSeconds);
    expect(engine.state.stepCount).toBe(lastValid.stepCount);
  });

  it(
    "runs a long inclined-binary integration through the real engine",
    () => {
      const engine = new SimulationEngine(
        createInclinedBinaryConfig()
      );
      const initialEnergy = engine.diagnostics().totalEnergyJ;
      const periods = 10;
      const totalSteps =
        periods * INCLINED_BINARY_STEPS_PER_PERIOD;

      expect(engine.start()).toBe(true);
      for (let stepIndex = 0; stepIndex < totalSteps; stepIndex += 1) {
        if (!engine.advanceOneStep()) {
          throw new Error(
            `Engine stopped at step ${stepIndex}: ${engine.stopEvent?.message}`
          );
        }
      }

      const finalEnergy = engine.diagnostics().totalEnergyJ;
      const relativeEnergyError =
        Math.abs(finalEnergy - initialEnergy) /
        Math.abs(initialEnergy);

      expect(engine.status).toBe("running");
      expect(engine.state.stepCount).toBe(totalSteps);
      expect(
        Math.abs(
          engine.state.timeSeconds -
            periods * INCLINED_BINARY_PERIOD_SECONDS
        ) /
          (periods * INCLINED_BINARY_PERIOD_SECONDS)
      ).toBeLessThan(1e-12);
      expect(relativeEnergyError).toBeLessThan(1e-4);
    },
    15_000
  );

  it("rejects a dynamic Newtonian-domain crossing before commit", () => {
    const initialRelativeSpeedMps = 0.0995 * SPEED_OF_LIGHT_MPS;
    const engine = new SimulationEngine(
      config(
        [
          {
            ...body(
              "left",
              vector3(-1e8, 0, 0),
              vector3(initialRelativeSpeedMps * 0.5, 0, 0)
            ),
            massKg: 1e33,
          },
          {
            ...body(
              "right",
              vector3(1e8, 0, 0),
              vector3(-initialRelativeSpeedMps * 0.5, 0, 0)
            ),
            massKg: 1e33,
          },
        ],
        0.0670480593363
      )
    );
    const lastValidPositions = engine.state.positionsM.slice();
    const lastValidVelocities = engine.state.velocitiesMps.slice();
    const lastValidAccelerations = engine.state.accelerationsMps2.slice();
    const lastValidMasses = engine.state.massesKg.slice();
    const lastValidRadii = engine.state.physicalRadiiM.slice();
    const lastValidFixed = engine.state.fixed.slice();
    const lastValidBodyIds = [...engine.state.bodyIds];
    const lastValidStepCount = engine.state.stepCount;
    const lastValidTimeSeconds = engine.state.timeSeconds;

    expect(engine.newtonianValidity().beta.value).toBeLessThan(0.1);
    expect(engine.start()).toBe(true);
    expect(engine.advanceOneStep()).toBe(false);

    expect(engine.status).toBe("newtonian-domain-violation");
    expect(engine.stopEvent).toMatchObject({
      kind: "newtonian-domain-violation",
      timeSeconds: lastValidTimeSeconds,
      attemptedTimeSeconds: 0.0670480593363,
      violation: {
        metric: "beta",
        limit: 0.1,
        velocityFrame: "relative",
        responsibility: {
          kind: "pair",
          firstBodyId: "left",
          secondBodyId: "right",
        },
      },
    });
    expect(
      engine.stopEvent?.kind === "newtonian-domain-violation"
        ? engine.stopEvent.violation.value
        : 0
    ).toBeGreaterThanOrEqual(0.1);
    expect(Object.isFrozen(engine.stopEvent)).toBe(true);
    expect(
      engine.stopEvent?.kind === "newtonian-domain-violation"
        ? Object.isFrozen(engine.stopEvent.violation)
        : false
    ).toBe(true);
    expect(
      engine.stopEvent?.kind === "newtonian-domain-violation"
        ? Object.isFrozen(engine.stopEvent.violation.responsibility)
        : false
    ).toBe(true);
    expect(Object.isFrozen(engine.rejectedNewtonianValidity)).toBe(true);
    expect(Array.from(engine.state.positionsM)).toEqual(
      Array.from(lastValidPositions)
    );
    expect(Array.from(engine.state.velocitiesMps)).toEqual(
      Array.from(lastValidVelocities)
    );
    expect(Array.from(engine.state.accelerationsMps2)).toEqual(
      Array.from(lastValidAccelerations)
    );
    expect(Array.from(engine.state.massesKg)).toEqual(
      Array.from(lastValidMasses)
    );
    expect(Array.from(engine.state.physicalRadiiM)).toEqual(
      Array.from(lastValidRadii)
    );
    expect(Array.from(engine.state.fixed)).toEqual(
      Array.from(lastValidFixed)
    );
    expect(engine.state.bodyIds).toEqual(lastValidBodyIds);
    expect(engine.state.stepCount).toBe(lastValidStepCount);
    expect(engine.state.timeSeconds).toBe(lastValidTimeSeconds);
    expect(engine.start()).toBe(false);

    engine.reset();
    expect(engine.status).toBe("paused");
    expect(engine.stopEvent).toBeNull();
    expect(engine.start()).toBe(true);
  });
});
