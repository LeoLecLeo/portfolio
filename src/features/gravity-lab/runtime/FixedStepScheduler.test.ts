import { describe, expect, it } from "vitest";

import { createInclinedBinaryConfig } from "../presets/inclinedBinary";
import { FixedStepScheduler } from "./FixedStepScheduler";
import { SimulationEngine } from "./SimulationEngine";

function createRunningScheduler(
  maxSubStepsPerTick = 8,
  simulatedStepsPerRealSecond = 60
) {
  const engine = new SimulationEngine(createInclinedBinaryConfig());
  const scheduler = new FixedStepScheduler(engine, {
    simulatedSecondsPerRealSecond:
      engine.timeStepSeconds * simulatedStepsPerRealSecond,
    maxSubStepsPerTick,
    maxFrameDeltaSeconds: 0.25,
  });
  engine.start();

  return { engine, scheduler };
}

describe("fixed-step scheduler", () => {
  it("produces the same state for different render-delta chunking", () => {
    const first = createRunningScheduler();
    const second = createRunningScheduler();
    let firstSteps = 0;
    let secondSteps = 0;

    for (let frame = 0; frame < 10; frame += 1) {
      firstSteps += first.scheduler.tick(1 / 60).stepsAdvanced;
    }

    for (let frame = 0; frame < 5; frame += 1) {
      secondSteps += second.scheduler.tick(1 / 30).stepsAdvanced;
    }

    expect(firstSteps).toBe(10);
    expect(secondSteps).toBe(10);
    expect(first.engine.state.timeSeconds).toBe(
      second.engine.state.timeSeconds
    );
    expect(Array.from(first.engine.state.positionsM)).toEqual(
      Array.from(second.engine.state.positionsM)
    );
    expect(Array.from(first.engine.state.velocitiesMps)).toEqual(
      Array.from(second.engine.state.velocitiesMps)
    );
  });

  it("does not advance a paused engine", () => {
    const { engine, scheduler } = createRunningScheduler();
    engine.pause();

    const result = scheduler.tick(1 / 60);

    expect(result.stepsAdvanced).toBe(0);
    expect(result.stopReason).toBe("engine-not-running");
    expect(engine.state.timeSeconds).toBe(0);
  });

  it("pauses explicitly after an excessive frame gap", () => {
    const { engine, scheduler } = createRunningScheduler();

    const result = scheduler.tick(1);

    expect(result.stopReason).toBe("frame-gap");
    expect(result.message).toMatch(/no hidden catch-up/);
    expect(engine.status).toBe("paused");
    expect(engine.state.timeSeconds).toBe(0);
  });

  it("pauses before work when the substep budget would be exceeded", () => {
    const { engine, scheduler } = createRunningScheduler(2);

    const result = scheduler.tick(3 / 60);

    expect(result.stopReason).toBe("substep-budget");
    expect(result.stepsAdvanced).toBe(0);
    expect(engine.status).toBe("paused");
    expect(engine.state.timeSeconds).toBe(0);
  });

  it("discards exactly one rebased frame without clearing the accumulator", () => {
    const { engine, scheduler } = createRunningScheduler(8, 30);

    expect(scheduler.tick(1 / 60).stepsAdvanced).toBe(0);
    scheduler.rebaseFrameClock();

    const rebasedFrame = scheduler.tick(2);
    expect(rebasedFrame.stepsAdvanced).toBe(0);
    expect(rebasedFrame.stopReason).toBeNull();
    expect(engine.status).toBe("running");
    expect(engine.state.timeSeconds).toBe(0);

    const nextFrame = scheduler.tick(1 / 60);
    expect(nextFrame.stepsAdvanced).toBe(1);
    expect(engine.state.timeSeconds).toBe(engine.timeStepSeconds);
  });

  it("keeps frame-gap protection active after the rebased frame", () => {
    const { engine, scheduler } = createRunningScheduler();

    scheduler.rebaseFrameClock();
    expect(scheduler.tick(2).stopReason).toBeNull();

    const actualGap = scheduler.tick(2);
    expect(actualGap.stopReason).toBe("frame-gap");
    expect(engine.status).toBe("paused");
  });
});
