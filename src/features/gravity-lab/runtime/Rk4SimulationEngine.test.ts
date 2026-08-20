import { describe, expect, it } from "vitest";

import type {
  CelestialBodyDefinition,
  NewtonianSimulationConfig,
} from "../core/types";
import { vector3 } from "../core/vector3";
import { SPEED_OF_LIGHT_MPS } from "../core/units";
import { classifyFirstPostNewtonianDomain } from "../physics/gravityModel";
import { Rk4SimulationEngine } from "./Rk4SimulationEngine";

const ENCOUNTER_THRESHOLDS = Object.freeze({
  maxRelativeDisplacementPerStep: 0.02,
  maxDynamicalStep: 0.02,
});

function body(
  id: string,
  x: number,
  options: Partial<CelestialBodyDefinition> = {}
): CelestialBodyDefinition {
  return {
    id,
    name: id,
    massKg: 1e10,
    physicalRadiusM: 1,
    fixed: false,
    initialPositionM: vector3(x, 0, 0),
    initialVelocityMps: vector3(0, 0, 0),
    ...options,
  };
}

function config(
  bodies: readonly CelestialBodyDefinition[],
  timeStepSeconds = 1
): NewtonianSimulationConfig {
  return {
    bodies,
    timeStepSeconds,
    encounterThresholds: ENCOUNTER_THRESHOLDS,
  };
}

describe("RK4 production-session engine", () => {
  it("supports deterministic finite 1PN sessions from one to sixteen bodies", () => {
    for (const bodyCount of [1, 16]) {
      const bodies = Array.from({ length: bodyCount }, (_, index) =>
        body(`body-${index}`, index * 1e9)
      );
      const first = new Rk4SimulationEngine(
        config(bodies, 0.25),
        "first-post-newtonian"
      );
      const second = new Rk4SimulationEngine(
        config(bodies, 0.25),
        "first-post-newtonian"
      );

      expect(first.start()).toBe(true);
      expect(second.start()).toBe(true);

      for (let step = 0; step < 8; step += 1) {
        expect(first.advanceOneStep()).toBe(true);
        expect(second.advanceOneStep()).toBe(true);
      }

      expect(first.state.timeSeconds).toBe(2);
      expect(first.state.stepCount).toBe(8);
      expect([...first.state.positionsM]).toEqual([
        ...second.state.positionsM,
      ]);
      expect([...first.state.velocitiesMps]).toEqual([
        ...second.state.velocitiesMps,
      ]);
      expect([...first.state.positionsM].every(Number.isFinite)).toBe(
        true
      );
    }
  });

  it("rejects fixed bodies from validated RK4 sessions", () => {
    expect(
      () =>
        new Rk4SimulationEngine(
          config([body("fixed", 0, { fixed: true })]),
          "first-post-newtonian"
        )
    ).toThrow(/Fixed bodies/);
  });

  it("accepts the documented 1PN transition range and rejects the hard velocity limit", () => {
    const transition = new Rk4SimulationEngine(
      config([
        body("caution-left", -1e12, {
          initialVelocityMps: vector3(
            0.01 * SPEED_OF_LIGHT_MPS,
            0,
            0
          ),
        }),
        body("caution-right", 1e12, {
          initialVelocityMps: vector3(
            -0.01 * SPEED_OF_LIGHT_MPS,
            0,
            0
          ),
        }),
      ]),
      "first-post-newtonian"
    );

    expect(
      classifyFirstPostNewtonianDomain(
        transition.newtonianValidity()
      )
    ).toBe("transition");

    expect(
      () =>
        new Rk4SimulationEngine(
          config([
            body("outside-left", -1e12, {
              initialVelocityMps: vector3(
                0.05 * SPEED_OF_LIGHT_MPS,
                0,
                0
              ),
            }),
            body("outside-right", 1e12, {
              initialVelocityMps: vector3(
                -0.05 * SPEED_OF_LIGHT_MPS,
                0,
                0
              ),
            }),
          ]),
          "first-post-newtonian"
        )
    ).toThrow(/validation|domain/i);
  });

  it("keeps every current-state field unchanged when a swept collision rejects a candidate", () => {
    const engine = new Rk4SimulationEngine(
      config(
        [
          body("left", -100, {
            initialVelocityMps: vector3(60, 0, 0),
          }),
          body("right", 100, {
            initialVelocityMps: vector3(-60, 0, 0),
          }),
        ],
        2
      ),
      "first-post-newtonian"
    );
    const before = {
      positions: [...engine.state.positionsM],
      velocities: [...engine.state.velocitiesMps],
      accelerations: [...engine.state.accelerationsMps2],
      timeSeconds: engine.state.timeSeconds,
      stepCount: engine.state.stepCount,
    };

    expect(engine.start()).toBe(true);
    expect(engine.advanceOneStep()).toBe(false);
    expect(engine.status).toBe("collision");
    expect(engine.stopEvent?.kind).toBe("collision");
    expect([...engine.state.positionsM]).toEqual(before.positions);
    expect([...engine.state.velocitiesMps]).toEqual(before.velocities);
    expect([...engine.state.accelerationsMps2]).toEqual(
      before.accelerations
    );
    expect(engine.state.timeSeconds).toBe(before.timeSeconds);
    expect(engine.state.stepCount).toBe(before.stepCount);
  });
});
