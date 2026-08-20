import { describe, expect, it } from "vitest";

import { INCLINED_BINARY_PRESET } from "../presets/inclinedBinary";
import { SUN_MERCURY_1PN_PRESET } from "../presets/sunMercury1pn";
import { createGravityLabSchedulerConfig } from "./schedulerPolicy";
import { GravityPrototypeRuntime } from "./GravityPrototypeRuntime";

function mercuryRuntime(): GravityPrototypeRuntime {
  const scenario = SUN_MERCURY_1PN_PRESET.createScenario();

  return new GravityPrototypeRuntime(
    scenario,
    createGravityLabSchedulerConfig(
      scenario.numericalPolicy.timeStepSeconds,
      SUN_MERCURY_1PN_PRESET.preferredSimulatedSecondsPerRealSecond
    )
  );
}

function readPosition(
  runtime: GravityPrototypeRuntime,
  branch: "primary" | "reference",
  bodyId: string
) {
  const target = { x: 0, y: 0, z: 0 };
  const view =
    branch === "primary"
      ? runtime.positions
      : runtime.newtonianComparisonPositions;

  expect(view).not.toBeNull();
  view?.writePositionMById(bodyId, target);
  return target;
}

describe("public synchronized comparison runtime boundary", () => {
  it("is disabled by default and creates no reference branch", () => {
    const runtime = mercuryRuntime();

    expect(runtime.comparisonActive).toBe(false);
    expect(runtime.newtonianComparisonPositions).toBeNull();
    expect(runtime.telemetry()).toMatchObject({
      modelId: "first-post-newtonian",
      integratorId: "fixed-rk4",
      status: "paused",
      timeSeconds: 0,
    });
  });

  it("starts both RK4 branches from identical independent conditions and advances in lockstep", () => {
    const runtime = mercuryRuntime();
    const bodyId = "mercury";

    expect(runtime.enableSynchronizedComparison()).toBe(true);
    const primaryInitial = readPosition(runtime, "primary", bodyId);
    const referenceInitial = readPosition(runtime, "reference", bodyId);
    expect(primaryInitial).toEqual(referenceInitial);
    expect(runtime.positions).not.toBe(
      runtime.newtonianComparisonPositions
    );

    const timeStepSeconds = runtime.telemetry().timeStepSeconds;
    expect(runtime.resume()).toBe(true);
    expect(runtime.advanceFrame(1 / 60)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBe(0);
    expect(runtime.advanceFrame(1 / 60)).toBe(false);
    expect(runtime.telemetry()).toMatchObject({
      modelId: "first-post-newtonian",
      integratorId: "fixed-rk4",
      status: "running",
      timeSeconds: timeStepSeconds,
    });

    runtime.pause();
    const primaryAdvanced = readPosition(runtime, "primary", bodyId);
    const referenceAdvanced = readPosition(runtime, "reference", bodyId);
    expect(primaryAdvanced).not.toEqual(primaryInitial);
    expect(referenceAdvanced).not.toEqual(referenceInitial);

    runtime.reset();
    expect(runtime.telemetry()).toMatchObject({
      status: "paused",
      timeSeconds: 0,
    });
    expect(readPosition(runtime, "primary", bodyId)).toEqual(
      primaryInitial
    );
    expect(readPosition(runtime, "reference", bodyId)).toEqual(
      referenceInitial
    );
  });

  it("releases the reference branch after reset and performs no comparison work when disabled", () => {
    const runtime = mercuryRuntime();

    expect(runtime.enableSynchronizedComparison()).toBe(true);
    expect(runtime.resume()).toBe(true);
    runtime.advanceFrame(1 / 60);
    runtime.advanceFrame(1 / 60);
    runtime.pause();
    expect(runtime.disableSynchronizedComparison()).toBe(false);

    runtime.reset();
    expect(runtime.disableSynchronizedComparison()).toBe(true);
    expect(runtime.comparisonActive).toBe(false);
    expect(runtime.newtonianComparisonPositions).toBeNull();
    expect(runtime.advanceFrame(1 / 60)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBe(0);
  });

  it("never enables the RK4 comparison for an ordinary Newtonian session", () => {
    const scenario = INCLINED_BINARY_PRESET.createScenario();
    const runtime = new GravityPrototypeRuntime(
      scenario,
      createGravityLabSchedulerConfig(
        scenario.numericalPolicy.timeStepSeconds,
        INCLINED_BINARY_PRESET.preferredSimulatedSecondsPerRealSecond
      )
    );

    expect(runtime.enableSynchronizedComparison()).toBe(false);
    expect(runtime.comparisonActive).toBe(false);
    expect(runtime.newtonianComparisonPositions).toBeNull();
  });

  it("disposes an active comparison with its owning runtime", () => {
    const runtime = mercuryRuntime();

    expect(runtime.enableSynchronizedComparison()).toBe(true);
    runtime.dispose();

    expect(runtime.isDisposed).toBe(true);
    expect(runtime.comparisonActive).toBe(false);
    expect(runtime.newtonianComparisonPositions).toBeNull();
    expect(runtime.resume()).toBe(false);
  });
});
