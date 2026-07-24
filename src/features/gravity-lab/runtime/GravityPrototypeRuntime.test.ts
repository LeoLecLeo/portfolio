import { describe, expect, it } from "vitest";

import type { NewtonianSimulationConfig } from "../core/types";
import { SPEED_OF_LIGHT_MPS } from "../core/units";
import { vector3 } from "../core/vector3";
import { createInclinedBinaryConfig } from "../presets/inclinedBinary";
import { GravityPrototypeRuntime } from "./GravityPrototypeRuntime";

describe("gravity prototype runtime", () => {
  it("publishes diagnostics and resets the exact initial positions", () => {
    const runtime = new GravityPrototypeRuntime();
    const initialPosition = { x: 0, y: 0, z: 0 };
    const advancedPosition = { x: 0, y: 0, z: 0 };
    const resetPosition = { x: 0, y: 0, z: 0 };
    const initialTelemetry = runtime.telemetry();

    runtime.positions.writePositionM(0, initialPosition);
    expect(initialTelemetry.status).toBe("paused");
    expect(initialTelemetry.timeSeconds).toBe(0);
    expect(initialTelemetry.relativeEnergyDrift).toBe(0);
    expect(initialTelemetry.precisionProfile).toBe("balanced");
    expect(initialTelemetry.timeStepSeconds).toBeCloseTo(
      974.5534120884115,
      9
    );
    expect(initialTelemetry.recommendedTimeStepSeconds).toBeCloseTo(
      1_588.2751266912621,
      9
    );
    expect(initialTelemetry.newtonianValidity).toMatchObject({
      overallLevel: "recommended",
      velocityFrame: "barycentric",
      hasExternalConstraint: false,
      beta: {
        responsible: {
          kind: "pair",
          firstBodyId: "binary-a",
          secondBodyId: "binary-b",
        },
      },
    });

    runtime.resume();
    runtime.advanceFrame(1);
    runtime.advanceFrame(1 / 60);
    runtime.positions.writePositionM(0, advancedPosition);
    expect(advancedPosition).not.toEqual(initialPosition);

    runtime.reset();
    runtime.positions.writePositionM(0, resetPosition);
    expect(resetPosition).toEqual(initialPosition);
    expect(runtime.telemetry().status).toBe("paused");
  });

  it("reports an excessive frame gap without attempting catch-up", () => {
    const runtime = new GravityPrototypeRuntime();

    runtime.resume();
    runtime.advanceFrame(1 / 60);
    const urgentTelemetry = runtime.advanceFrame(1);
    const telemetry = runtime.telemetry();

    expect(urgentTelemetry).toBe(true);
    expect(telemetry.status).toBe("paused");
    expect(telemetry.timeSeconds).toBe(0);
    expect(telemetry.schedulerMessage).toMatch(/no hidden catch-up/);
  });

  it("reports a substep-budget stop", () => {
    const config = createInclinedBinaryConfig();
    const runtime = new GravityPrototypeRuntime(config, {
      simulatedSecondsPerRealSecond: config.timeStepSeconds * 60,
      maxSubStepsPerTick: 1,
      maxFrameDeltaSeconds: 0.25,
    });

    runtime.resume();
    runtime.advanceFrame(0);
    const urgentTelemetry = runtime.advanceFrame(2 / 60);
    const telemetry = runtime.telemetry();

    expect(urgentTelemetry).toBe(true);
    expect(telemetry.status).toBe("paused");
    expect(telemetry.schedulerMessage).toMatch(/substeps exceeded/);
  });

  it("maps a collision stop to dedicated telemetry", () => {
    const collisionConfig: NewtonianSimulationConfig = {
      bodies: [
        {
          id: "left",
          name: "Left",
          massKg: 1,
          physicalRadiusM: 0.1,
          fixed: false,
          initialPositionM: vector3(-1, 0, 0),
          initialVelocityMps: vector3(2, 0, 0),
        },
        {
          id: "right",
          name: "Right",
          massKg: 1,
          physicalRadiusM: 0.1,
          fixed: false,
          initialPositionM: vector3(1, 0, 0),
          initialVelocityMps: vector3(-2, 0, 0),
        },
      ],
      timeStepSeconds: 1,
      encounterThresholds: {
        maxRelativeDisplacementPerStep: 0.02,
        maxDynamicalStep: 0.02,
      },
    };
    const runtime = new GravityPrototypeRuntime(collisionConfig, {
      simulatedSecondsPerRealSecond: 60,
      maxSubStepsPerTick: 1,
      maxFrameDeltaSeconds: 0.25,
    });

    runtime.resume();
    runtime.advanceFrame(0);
    runtime.advanceFrame(1 / 60);
    const telemetry = runtime.telemetry();

    expect(telemetry.status).toBe("collision");
    expect(telemetry.collisionMessage).toMatch(/Collision detected/);
    expect(telemetry.unresolvedEncounterMessage).toBeNull();
    expect(runtime.resume()).toBe(false);
    expect(runtime.telemetry().status).toBe("collision");
  });

  it("marks relative energy drift as undefined for zero initial energy", () => {
    const zeroEnergyConfig: NewtonianSimulationConfig = {
      bodies: [
        {
          id: "isolated",
          name: "Isolated body",
          massKg: 1,
          physicalRadiusM: 0,
          fixed: false,
          initialPositionM: vector3(0, 0, 0),
          initialVelocityMps: vector3(0, 0, 0),
        },
      ],
      timeStepSeconds: 1,
      encounterThresholds: {
        maxRelativeDisplacementPerStep: 0.02,
        maxDynamicalStep: 0.02,
      },
    };
    const runtime = new GravityPrototypeRuntime(zeroEnergyConfig);

    expect(runtime.telemetry().totalEnergyJ).toBe(0);
    expect(runtime.telemetry().relativeEnergyDrift).toBeNull();
  });

  it("ignores a long voluntary pause and resumes on the following frame", () => {
    const config = createInclinedBinaryConfig();
    const runtime = new GravityPrototypeRuntime(config, {
      simulatedSecondsPerRealSecond: config.timeStepSeconds * 60,
      maxSubStepsPerTick: 8,
      maxFrameDeltaSeconds: 0.25,
    });

    runtime.resume();
    runtime.advanceFrame(1);
    runtime.advanceFrame(1 / 60);
    const timeBeforePause = runtime.telemetry().timeSeconds;

    runtime.pause();
    expect(runtime.resume()).toBe(true);

    const resumedFrame = runtime.advanceFrame(5);
    const afterResumedFrame = runtime.telemetry();
    expect(resumedFrame).toBe(false);
    expect(afterResumedFrame.status).toBe("running");
    expect(afterResumedFrame.schedulerMessage).toBeNull();
    expect(afterResumedFrame.timeSeconds).toBe(timeBeforePause);

    runtime.advanceFrame(1 / 60);
    expect(runtime.telemetry().timeSeconds).toBe(
      timeBeforePause + config.timeStepSeconds
    );
  });

  it("resets while paused without advancing or reporting a frame gap", () => {
    const config = createInclinedBinaryConfig();
    const runtime = new GravityPrototypeRuntime(config, {
      simulatedSecondsPerRealSecond: config.timeStepSeconds * 30,
      maxSubStepsPerTick: 8,
      maxFrameDeltaSeconds: 0.25,
    });
    const initialPosition = { x: 0, y: 0, z: 0 };
    const resetPosition = { x: 0, y: 0, z: 0 };

    runtime.positions.writePositionM(0, initialPosition);
    runtime.resume();
    runtime.advanceFrame(0);
    runtime.advanceFrame(3 / 60);
    expect(runtime.telemetry().timeSeconds).toBe(config.timeStepSeconds);
    runtime.pause();
    runtime.reset();

    const resetRenderFrame = runtime.advanceFrame(5);
    runtime.positions.writePositionM(0, resetPosition);
    const telemetry = runtime.telemetry();

    expect(resetRenderFrame).toBe(false);
    expect(resetPosition).toEqual(initialPosition);
    expect(telemetry.status).toBe("paused");
    expect(telemetry.timeSeconds).toBe(0);
    expect(telemetry.schedulerMessage).toBeNull();

    expect(runtime.resume()).toBe(true);
    expect(runtime.advanceFrame(5)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBe(0);
    runtime.advanceFrame(1 / 60);
    expect(runtime.telemetry().timeSeconds).toBe(0);
    runtime.advanceFrame(1 / 60);
    expect(runtime.telemetry().timeSeconds).toBe(config.timeStepSeconds);
  });

  it("handles repeated pause and resume cycles deterministically", () => {
    const config = createInclinedBinaryConfig();
    const runtime = new GravityPrototypeRuntime(config, {
      simulatedSecondsPerRealSecond: config.timeStepSeconds * 60,
      maxSubStepsPerTick: 8,
      maxFrameDeltaSeconds: 0.25,
    });

    runtime.resume();
    runtime.advanceFrame(0);

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      runtime.advanceFrame(1 / 60);
      runtime.pause();
      expect(runtime.resume()).toBe(true);
      expect(runtime.advanceFrame(cycle)).toBe(false);
      expect(runtime.telemetry().schedulerMessage).toBeNull();
    }

    expect(runtime.telemetry().status).toBe("running");
    expect(runtime.telemetry().timeSeconds).toBe(
      3 * config.timeStepSeconds
    );

    runtime.advanceFrame(1 / 60);
    expect(runtime.telemetry().timeSeconds).toBe(
      4 * config.timeStepSeconds
    );
  });

  it("still pauses on a real frame gap while actively running", () => {
    const runtime = new GravityPrototypeRuntime();

    runtime.resume();
    runtime.advanceFrame(0);
    runtime.advanceFrame(1 / 60);
    const timeBeforeGap = runtime.telemetry().timeSeconds;

    expect(runtime.advanceFrame(1)).toBe(true);
    const telemetry = runtime.telemetry();
    expect(telemetry.status).toBe("paused");
    expect(telemetry.timeSeconds).toBe(timeBeforeGap);
    expect(telemetry.schedulerMessage).toMatch(/no hidden catch-up/);
  });

  it("does not hide a real gap after a redundant resume call", () => {
    const runtime = new GravityPrototypeRuntime();

    expect(runtime.resume()).toBe(true);
    runtime.advanceFrame(0);
    expect(runtime.resume()).toBe(false);

    expect(runtime.advanceFrame(1)).toBe(true);
    expect(runtime.telemetry().status).toBe("paused");
    expect(runtime.telemetry().schedulerMessage).toMatch(
      /no hidden catch-up/
    );
  });

  it("rebases deterministically when resuming after a frame-gap stop", () => {
    const config = createInclinedBinaryConfig();
    const runtime = new GravityPrototypeRuntime(config, {
      simulatedSecondsPerRealSecond: config.timeStepSeconds * 60,
      maxSubStepsPerTick: 8,
      maxFrameDeltaSeconds: 0.25,
    });

    runtime.resume();
    runtime.advanceFrame(0);
    runtime.advanceFrame(1 / 60);
    runtime.advanceFrame(1);
    const timeAtStop = runtime.telemetry().timeSeconds;

    expect(runtime.resume()).toBe(true);
    expect(runtime.telemetry().schedulerMessage).toBeNull();
    expect(runtime.advanceFrame(2)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBe(timeAtStop);

    runtime.advanceFrame(1 / 60);
    expect(runtime.telemetry().status).toBe("running");
    expect(runtime.telemetry().timeSeconds).toBe(
      timeAtStop + config.timeStepSeconds
    );
  });

  it("publishes a dynamic Newtonian-domain stop while retaining valid telemetry", () => {
    const relativeSpeedMps = 0.0995 * SPEED_OF_LIGHT_MPS;
    const timeStepSeconds = 0.0670480593363;
    const domainCrossingConfig: NewtonianSimulationConfig = {
      bodies: [
        {
          id: "left",
          name: "Left",
          massKg: 1e33,
          physicalRadiusM: 0,
          fixed: false,
          initialPositionM: vector3(-1e8, 0, 0),
          initialVelocityMps: vector3(relativeSpeedMps * 0.5, 0, 0),
        },
        {
          id: "right",
          name: "Right",
          massKg: 1e33,
          physicalRadiusM: 0,
          fixed: false,
          initialPositionM: vector3(1e8, 0, 0),
          initialVelocityMps: vector3(-relativeSpeedMps * 0.5, 0, 0),
        },
      ],
      timeStepSeconds,
      encounterThresholds: {
        maxRelativeDisplacementPerStep: 0.02,
        maxDynamicalStep: 0.02,
      },
    };
    const runtime = new GravityPrototypeRuntime(domainCrossingConfig, {
      simulatedSecondsPerRealSecond: timeStepSeconds * 60,
      maxSubStepsPerTick: 1,
      maxFrameDeltaSeconds: 0.25,
    });

    expect(runtime.resume()).toBe(true);
    runtime.advanceFrame(0);
    expect(runtime.advanceFrame(1 / 60)).toBe(true);

    const telemetry = runtime.telemetry();
    expect(telemetry.status).toBe("newtonian-domain-violation");
    expect(telemetry.newtonianDomainMessage).toMatch(
      /last valid state was preserved/
    );
    expect(telemetry.newtonianDomainViolation).toMatchObject({
      metric: "beta",
      value: expect.any(Number),
      limit: 0.1,
      velocityFrame: "relative",
      responsibility: {
        kind: "pair",
        firstBodyId: "left",
        secondBodyId: "right",
      },
    });
    expect(telemetry.timeSeconds).toBe(0);
    expect(telemetry.newtonianValidity.beta.value).toBeLessThan(0.1);
    expect(telemetry.rejectedNewtonianValidity).toMatchObject({
      overallLevel: "hard-error",
      beta: {
        level: "hard-error",
        responsible: {
          kind: "pair",
          firstBodyId: "left",
          secondBodyId: "right",
          frame: "relative",
        },
      },
    });
    expect(runtime.resume()).toBe(false);

    runtime.reset();
    expect(runtime.telemetry().status).toBe("paused");
    expect(runtime.telemetry().rejectedNewtonianValidity).toBeNull();
  });

  it("keeps the physical step independent from scheduler time speed", () => {
    const config = createInclinedBinaryConfig();
    const slow = new GravityPrototypeRuntime(config, {
      simulatedSecondsPerRealSecond: config.timeStepSeconds * 2,
      maxSubStepsPerTick: 32,
      maxFrameDeltaSeconds: 0.25,
    });
    const fast = new GravityPrototypeRuntime(config, {
      simulatedSecondsPerRealSecond: config.timeStepSeconds * 200,
      maxSubStepsPerTick: 32,
      maxFrameDeltaSeconds: 0.25,
    });

    expect(slow.telemetry().timeStepSeconds).toBe(
      config.timeStepSeconds
    );
    expect(fast.telemetry().timeStepSeconds).toBe(
      config.timeStepSeconds
    );
    expect(slow.telemetry().precisionProfile).toBeNull();
    expect(slow.telemetry().recommendedTimeStepSeconds).toBeNull();
    expect(
      slow.telemetry().timeStepBudgetAssessment.exceedsBudget
    ).toBe(false);
    expect(
      fast.telemetry().timeStepBudgetAssessment.exceedsBudget
    ).toBe(true);
  });
});
