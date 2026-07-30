import { describe, expect, it } from "vitest";

import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_SCHEDULER_CONFIG,
  INCLINED_BINARY_STEPS_PER_PERIOD,
  INCLINED_BINARY_TIME_STEP_SECONDS,
} from "../presets/inclinedBinary";
import {
  GravityLabSession,
  GravityLabSessionHost,
  type GravityLabSessionRequest,
} from "./GravityLabSession";

function request(
  stepsPerPeriod = INCLINED_BINARY_STEPS_PER_PERIOD
): GravityLabSessionRequest {
  const schedulerConfig = {
    ...INCLINED_BINARY_SCHEDULER_CONFIG,
  };

  return {
    appliedScenario: createInclinedBinaryAppliedScenario(
      schedulerConfig,
      stepsPerPeriod
    ),
    schedulerConfig,
  };
}

function advanceOneRenderedStep(session: GravityLabSession): void {
  const timeStepSeconds =
    session.appliedScenario.numericalPolicy.timeStepSeconds;
  const frameDeltaSeconds =
    timeStepSeconds /
    INCLINED_BINARY_SCHEDULER_CONFIG.simulatedSecondsPerRealSecond;

  expect(session.runtime.resume()).toBe(true);
  expect(session.runtime.advanceFrame(10)).toBe(false);
  expect(session.runtime.advanceFrame(frameDeltaSeconds)).toBe(false);
  expect(session.runtime.telemetry().timeSeconds).toBe(
    timeStepSeconds
  );
}

describe("generic gravity-lab session host", () => {
  it("replaces a complete session in one coherent host snapshot", () => {
    const host = new GravityLabSessionHost(request());
    const previous = host.snapshot;
    const nextRequest = request(4_096);
    const next = host.replace(nextRequest);

    expect(next.revision).toBe(previous.revision + 1);
    expect(next.session).not.toBe(previous.session);
    expect(next.session.appliedScenario).toBe(
      nextRequest.appliedScenario
    );
    expect(next.appliedScenario).toBe(nextRequest.appliedScenario);
    expect(next.telemetry).toEqual(next.session.runtime.telemetry());
    expect(next.telemetry.status).toBe("paused");
    expect(next.telemetry.timeSeconds).toBe(0);
    expect(host.snapshot).toBe(next);
  });

  it("stops the previous runtime only after the replacement is ready", () => {
    const host = new GravityLabSessionHost(request());
    const previousSession = host.snapshot.session;

    expect(previousSession.runtime.resume()).toBe(true);
    host.replace(request(4_096));

    expect(previousSession.runtime.isDisposed).toBe(true);
    expect(previousSession.runtime.isRunning).toBe(false);
    expect(previousSession.runtime.resume()).toBe(false);
    expect(previousSession.runtime.advanceFrame(1 / 60)).toBe(false);
    expect(host.snapshot.session.runtime.isDisposed).toBe(false);
  });

  it("rejects telemetry published by a replaced session", () => {
    const host = new GravityLabSessionHost(request());
    const previousSession = host.snapshot.session;

    advanceOneRenderedStep(previousSession);
    const staleTelemetry = previousSession.runtime.telemetry();
    const current = host.replace(request(4_096));

    expect(staleTelemetry.timeSeconds).toBeGreaterThan(0);
    expect(
      host.publishTelemetry(previousSession, staleTelemetry)
    ).toBeNull();
    expect(host.snapshot).toBe(current);
    expect(host.snapshot.telemetry.timeSeconds).toBe(0);
  });

  it("resets to the applied configuration and remains paused", () => {
    const host = new GravityLabSessionHost(request());
    host.replace(request(4_096));
    const session = host.snapshot.session;
    const bodyId = session.bodies[0].bodyId;
    const initial = { x: 0, y: 0, z: 0 };
    const advanced = { x: 0, y: 0, z: 0 };
    const reset = { x: 0, y: 0, z: 0 };

    session.runtime.positions.writePositionMById(bodyId, initial);
    advanceOneRenderedStep(session);
    session.runtime.positions.writePositionMById(bodyId, advanced);
    expect(advanced).not.toEqual(initial);

    const snapshot = host.reset();
    session.runtime.positions.writePositionMById(bodyId, reset);
    expect(reset).toEqual(initial);
    expect(snapshot.telemetry.status).toBe("paused");
    expect(snapshot.telemetry.timeSeconds).toBe(0);
    expect(snapshot.appliedScenario).toBe(session.appliedScenario);
  });

  it("preserves deterministic pause and resume after replacement", () => {
    const host = new GravityLabSessionHost(request());
    const snapshot = host.replace(request(4_096));
    const runtime = snapshot.session.runtime;
    const timeStepSeconds =
      snapshot.appliedScenario.numericalPolicy.timeStepSeconds;
    const frameDeltaSeconds =
      timeStepSeconds /
      INCLINED_BINARY_SCHEDULER_CONFIG.simulatedSecondsPerRealSecond;

    expect(host.resume().telemetry.status).toBe("running");
    expect(runtime.advanceFrame(5)).toBe(false);
    runtime.advanceFrame(frameDeltaSeconds);
    expect(runtime.telemetry().timeSeconds).toBe(timeStepSeconds);
    expect(host.pause().telemetry.status).toBe("paused");

    expect(host.resume().telemetry.status).toBe("running");
    expect(runtime.advanceFrame(5)).toBe(false);
    expect(runtime.telemetry().timeSeconds).toBe(timeStepSeconds);
    runtime.advanceFrame(frameDeltaSeconds);
    expect(runtime.telemetry().timeSeconds).toBe(
      2 * timeStepSeconds
    );
  });

  it("keeps the current inclined binary compatible with the generic boundary", () => {
    const session = new GravityLabSession(request());
    const first = { x: 0, y: 0, z: 0 };
    const second = { x: 0, y: 0, z: 0 };

    expect(session.bodies.map(({ bodyId }) => bodyId)).toEqual([
      "binary-a",
      "binary-b",
    ]);
    session.writeScenePosition("binary-a", first);
    session.writeScenePosition("binary-b", second);
    expect(Math.hypot(first.x, first.y, first.z)).toBeCloseTo(4, 14);
    expect(Math.hypot(second.x, second.y, second.z)).toBeCloseTo(
      4,
      14
    );
    expect(session.runtime.telemetry()).toMatchObject({
      status: "paused",
      precisionProfile: "balanced",
      timeStepSeconds: INCLINED_BINARY_TIME_STEP_SECONDS,
    });
  });
});
