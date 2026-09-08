import { describe, expect, it } from "vitest";

import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_SCHEDULER_CONFIG,
} from "../presets/inclinedBinary";
import { GravityLabSessionHost } from "../runtime/GravityLabSession";
import { createGravityLabHostLifecycle } from "./gravityLabLifecycle";

function createHost(): GravityLabSessionHost {
  return new GravityLabSessionHost({
    appliedScenario: createInclinedBinaryAppliedScenario(
      INCLINED_BINARY_SCHEDULER_CONFIG
    ),
    schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
  });
}

function createDeferredQueue(): Readonly<{
  defer: (cleanup: () => void) => void;
  flush: () => void;
  size: () => number;
}> {
  const pending: Array<() => void> = [];

  return {
    defer: (cleanup) => pending.push(cleanup),
    flush: () => {
      for (const cleanup of pending.splice(0)) {
        cleanup();
      }
    },
    size: () => pending.length,
  };
}

describe("gravity-lab host lifecycle", () => {
  it("stops the current runtime after the route lifecycle is released", () => {
    const host = createHost();
    const deferred = createDeferredQueue();
    const lifecycle = createGravityLabHostLifecycle(host, deferred.defer);
    const cleanup = lifecycle.activate();

    host.resume();
    cleanup();
    expect(host.snapshot.session.runtime.isDisposed).toBe(false);

    deferred.flush();
    expect(host.snapshot.session.runtime.isDisposed).toBe(true);
    expect(host.snapshot.session.runtime.isRunning).toBe(false);
  });

  it("does not dispose the retained host during a Strict Mode effect replay", () => {
    const host = createHost();
    const deferred = createDeferredQueue();
    const lifecycle = createGravityLabHostLifecycle(host, deferred.defer);
    const firstCleanup = lifecycle.activate();

    firstCleanup();
    const finalCleanup = lifecycle.activate();
    deferred.flush();

    expect(host.snapshot.session.runtime.isDisposed).toBe(false);
    expect(host.resume().telemetry.status).toBe("running");

    finalCleanup();
    deferred.flush();
    expect(host.snapshot.session.runtime.isDisposed).toBe(true);
  });

  it("makes repeated cleanup requests idempotent", () => {
    const host = createHost();
    const deferred = createDeferredQueue();
    const cleanup = createGravityLabHostLifecycle(
      host,
      deferred.defer
    ).activate();

    cleanup();
    cleanup();
    expect(deferred.size()).toBe(1);

    deferred.flush();
    expect(host.snapshot.session.runtime.isDisposed).toBe(true);
  });

  it("disposes the latest session after successive replacements", () => {
    const host = createHost();
    const deferred = createDeferredQueue();
    const cleanup = createGravityLabHostLifecycle(
      host,
      deferred.defer
    ).activate();
    const firstSession = host.snapshot.session;
    const secondSession = host.replace({
      appliedScenario: createInclinedBinaryAppliedScenario(
        INCLINED_BINARY_SCHEDULER_CONFIG
      ),
      schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
    }).session;
    const latestSession = host.replace({
      appliedScenario: createInclinedBinaryAppliedScenario(
        INCLINED_BINARY_SCHEDULER_CONFIG
      ),
      schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
    }).session;

    expect(firstSession.runtime.isDisposed).toBe(true);
    expect(secondSession.runtime.isDisposed).toBe(true);
    expect(latestSession.runtime.isDisposed).toBe(false);

    cleanup();
    deferred.flush();
    expect(latestSession.runtime.isDisposed).toBe(true);
  });
});
