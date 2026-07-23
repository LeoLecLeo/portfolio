import { describe, expect, it } from "vitest";

import type {
  CelestialBodyDefinition,
  NewtonianSimulationConfig,
} from "../core/types";
import { vector3 } from "../core/vector3";
import { createInclinedBinaryConfig } from "../presets/inclinedBinary";
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
    expect(engine.stopEvent?.message).toMatch(/No gravitational softening/);
    expect(Array.from(engine.state.positionsM)).toEqual(
      Array.from(lastValidPositions)
    );
  });
});
