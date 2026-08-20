import { describe, expect, it } from "vitest";

import {
  appliedScenarioToDraft,
  appliedScenarioWithGravityModel,
  createDraftNumberFromSi,
  DISTANCE_DRAFT_UNIT_CONVERTER,
  MASS_DRAFT_UNIT_CONVERTER,
  SPEED_DRAFT_UNIT_CONVERTER,
  TIME_DRAFT_UNIT_CONVERTER,
} from "../core/scenario";
import { compileScenarioDraft } from "../core/scenarioCompiler";
import { createCircularTwoBodyAppliedScenario } from "../presets/circularTwoBody";
import { createGravityLabSchedulerConfig } from "./schedulerPolicy";
import {
  GravityLabSessionHost,
  type GravityLabSessionRequest,
} from "./GravityLabSession";
import {
  SynchronizedGravityComparisonEngine,
  SynchronizedGravityComparisonSession,
} from "./SynchronizedGravityComparison";

const UNIT_POLICY = Object.freeze({
  mass: "kg" as const,
  physicalRadius: "m" as const,
  position: "m" as const,
  velocity: "m/s" as const,
  time: "s" as const,
});

function scenario(modelId: "newtonian" | "first-post-newtonian") {
  return appliedScenarioWithGravityModel(
    createCircularTwoBodyAppliedScenario(),
    modelId
  );
}

function request(
  modelId: "newtonian" | "first-post-newtonian"
): GravityLabSessionRequest {
  const appliedScenario = scenario(modelId);
  return {
    appliedScenario,
    schedulerConfig: createGravityLabSchedulerConfig(
      appliedScenario.numericalPolicy.timeStepSeconds
    ),
  };
}

function advanceOneScheduledStep(host: GravityLabSessionHost): void {
  const session = host.snapshot.session;
  const timeStepSeconds = session.specification.timeStepSeconds;
  const frameDeltaSeconds =
    timeStepSeconds /
    session.schedulerConfig.simulatedSecondsPerRealSecond;

  expect(host.resume().telemetry.status).toBe("running");
  expect(session.runtime.advanceFrame(frameDeltaSeconds)).toBe(false);
  expect(session.runtime.advanceFrame(frameDeltaSeconds)).toBe(false);
}

function fixedAppliedScenario() {
  const source = createCircularTwoBodyAppliedScenario();
  const draft = appliedScenarioToDraft(source, UNIT_POLICY);
  const zero = createDraftNumberFromSi(
    0,
    "m/s",
    SPEED_DRAFT_UNIT_CONVERTER
  );
  const compiled = compileScenarioDraft({
    ...draft,
    bodies: draft.bodies.map((body, index) =>
      index === 0
        ? {
            ...body,
            fixed: true,
            initialVelocity: { x: zero, y: zero, z: zero },
          }
        : body
    ),
  });

  if (!compiled.ok) {
    throw new Error("The fixed-body test scenario must compile.");
  }

  return appliedScenarioWithGravityModel(
    compiled.scenario,
    "first-post-newtonian"
  );
}

function headOnCollisionScenario() {
  const source = createCircularTwoBodyAppliedScenario();
  const draft = appliedScenarioToDraft(source, UNIT_POLICY);
  const mass = createDraftNumberFromSi(
    1e10,
    "kg",
    MASS_DRAFT_UNIT_CONVERTER
  );
  const radius = createDraftNumberFromSi(
    1,
    "m",
    DISTANCE_DRAFT_UNIT_CONVERTER
  );
  const zeroPosition = createDraftNumberFromSi(
    0,
    "m",
    DISTANCE_DRAFT_UNIT_CONVERTER
  );
  const zeroVelocity = createDraftNumberFromSi(
    0,
    "m/s",
    SPEED_DRAFT_UNIT_CONVERTER
  );
  const compiled = compileScenarioDraft({
    ...draft,
    maximumTimeStep: createDraftNumberFromSi(
      2,
      "s",
      TIME_DRAFT_UNIT_CONVERTER
    ),
    bodies: draft.bodies.map((body, index) => ({
      ...body,
      mass,
      physicalRadius: radius,
      initialPosition: {
        x: createDraftNumberFromSi(
          index === 0 ? -100 : 100,
          "m",
          DISTANCE_DRAFT_UNIT_CONVERTER
        ),
        y: zeroPosition,
        z: zeroPosition,
      },
      initialVelocity: {
        x: createDraftNumberFromSi(
          index === 0 ? 60 : -60,
          "m/s",
          SPEED_DRAFT_UNIT_CONVERTER
        ),
        y: zeroVelocity,
        z: zeroVelocity,
      },
    })),
  });

  if (!compiled.ok) {
    throw new Error("The synchronized collision scenario must compile.");
  }

  return compiled.scenario;
}

describe("relativistic gravity-lab sessions", () => {
  it("keeps every existing applied scenario explicitly Newtonian on Velocity Verlet", () => {
    const appliedScenario = createCircularTwoBodyAppliedScenario();
    const host = new GravityLabSessionHost({
      appliedScenario,
      schedulerConfig: createGravityLabSchedulerConfig(
        appliedScenario.numericalPolicy.timeStepSeconds
      ),
    });

    expect(appliedScenario.physics.modelId).toBe("newtonian");
    expect(host.snapshot.session.specification).toEqual({
      modelId: "newtonian",
      integratorId: "velocity-verlet",
      timeStepSeconds: appliedScenario.numericalPolicy.timeStepSeconds,
    });
    expect(host.snapshot.telemetry).toMatchObject({
      modelId: "newtonian",
      integratorId: "velocity-verlet",
      status: "paused",
    });
  });

  it("runs, pauses, resumes and resets a 1PN session through the existing host", () => {
    const host = new GravityLabSessionHost(
      request("first-post-newtonian")
    );
    const session = host.snapshot.session;
    const timeStepSeconds = session.specification.timeStepSeconds;

    expect(session.specification).toEqual({
      modelId: "first-post-newtonian",
      integratorId: "fixed-rk4",
      timeStepSeconds,
    });
    expect(host.snapshot.telemetry.relativeEnergyDrift).toBeNull();
    expect(host.snapshot.telemetry.firstPostNewtonianDomain).toBe(
      "weak-correction"
    );
    advanceOneScheduledStep(host);
    expect(session.runtime.telemetry().timeSeconds).toBe(timeStepSeconds);
    expect(host.pause().telemetry.status).toBe("paused");
    expect(host.resume().telemetry.status).toBe("running");
    expect(session.runtime.advanceFrame(10)).toBe(false);
    expect(session.runtime.telemetry().timeSeconds).toBe(timeStepSeconds);
    const reset = host.reset();
    expect(reset.telemetry.status).toBe("paused");
    expect(reset.telemetry.timeSeconds).toBe(0);
  });

  it("replaces Newtonian and 1PN sessions atomically without stale state", () => {
    const host = new GravityLabSessionHost(request("newtonian"));
    const previous = host.snapshot.session;
    advanceOneScheduledStep(host);

    const next = host.replace(request("first-post-newtonian"));

    expect(previous.runtime.isDisposed).toBe(true);
    expect(next.session.modelId).toBe("first-post-newtonian");
    expect(next.telemetry).toMatchObject({
      timeSeconds: 0,
      status: "paused",
      modelId: "first-post-newtonian",
      integratorId: "fixed-rk4",
    });
    expect(
      host.publishTelemetry(previous, previous.runtime.telemetry())
    ).toBeNull();

    advanceOneScheduledStep(host);
    host.publishTelemetry(
      host.snapshot.session,
      host.snapshot.session.runtime.telemetry()
    );
    expect(host.snapshot.telemetry.timeSeconds).toBeGreaterThan(0);
    const relativisticSession = host.snapshot.session;
    const restoredNewtonian = host.replace(request("newtonian"));
    expect(relativisticSession.runtime.isDisposed).toBe(true);
    expect(restoredNewtonian.session.specification.integratorId).toBe(
      "velocity-verlet"
    );
    expect(restoredNewtonian.telemetry.timeSeconds).toBe(0);
  });

  it("leaves the current host untouched when a 1PN replacement is invalid", () => {
    const host = new GravityLabSessionHost(request("newtonian"));
    expect(host.resume().telemetry.status).toBe("running");
    const before = host.snapshot;
    const invalid = fixedAppliedScenario();

    expect(() =>
      host.replace({
        appliedScenario: invalid,
        schedulerConfig: createGravityLabSchedulerConfig(
          invalid.numericalPolicy.timeStepSeconds
        ),
      })
    ).toThrow(/Fixed bodies/);
    expect(host.snapshot).toBe(before);
    expect(before.session.runtime.isDisposed).toBe(false);
    expect(before.session.runtime.isRunning).toBe(true);
  });
});

describe("synchronized Newtonian / 1PN comparison", () => {
  it("starts from independent copies of exactly the same initial phase space", () => {
    const comparison = new SynchronizedGravityComparisonEngine(
      scenario("newtonian")
    );
    const initial = comparison.snapshot();

    expect(initial.newtonian.positionsM).not.toBe(
      initial.firstPostNewtonian.positionsM
    );
    expect([...initial.newtonian.positionsM]).toEqual([
      ...initial.firstPostNewtonian.positionsM,
    ]);
    expect([...initial.newtonian.velocitiesMps]).toEqual([
      ...initial.firstPostNewtonian.velocitiesMps,
    ]);
    initial.newtonian.positionsM[0] = Number.NaN;
    expect(
      Number.isFinite(comparison.snapshot().newtonian.positionsM[0])
    ).toBe(true);
  });

  it("commits the same step count, dt and simulated time on both branches deterministically", () => {
    const first = new SynchronizedGravityComparisonEngine(
      scenario("newtonian")
    );
    const second = new SynchronizedGravityComparisonEngine(
      scenario("first-post-newtonian")
    );

    expect(first.start()).toBe(true);
    expect(second.start()).toBe(true);
    for (let step = 0; step < 32; step += 1) {
      expect(first.advanceOneStep()).toBe(true);
      expect(second.advanceOneStep()).toBe(true);
    }

    const firstSnapshot = first.snapshot();
    const secondSnapshot = second.snapshot();
    expect(firstSnapshot.newtonian.stepCount).toBe(32);
    expect(firstSnapshot.newtonian.timeStepSeconds).toBe(
      firstSnapshot.firstPostNewtonian.timeStepSeconds
    );
    expect(firstSnapshot.newtonian.timeSeconds).toBe(
      firstSnapshot.firstPostNewtonian.timeSeconds
    );
    expect([...firstSnapshot.newtonian.positionsM]).toEqual([
      ...secondSnapshot.newtonian.positionsM,
    ]);
    expect([...firstSnapshot.firstPostNewtonian.positionsM]).toEqual([
      ...secondSnapshot.firstPostNewtonian.positionsM,
    ]);
  });

  it("preserves synchronized pause, scheduler rebase and reset", () => {
    const appliedScenario = scenario("newtonian");
    const schedulerConfig = createGravityLabSchedulerConfig(
      appliedScenario.numericalPolicy.timeStepSeconds
    );
    const comparison = new SynchronizedGravityComparisonSession({
      appliedScenario,
      schedulerConfig,
    });
    const frameDelta =
      appliedScenario.numericalPolicy.timeStepSeconds /
      schedulerConfig.simulatedSecondsPerRealSecond;

    expect(comparison.resume()).toBe(true);
    expect(comparison.advanceFrame(frameDelta).stepsAdvanced).toBe(0);
    expect(comparison.advanceFrame(frameDelta).stepsAdvanced).toBe(1);
    comparison.pause();
    expect(comparison.advanceFrame(frameDelta).stepsAdvanced).toBe(0);
    const paused = comparison.snapshot();
    expect(paused.status).toBe("paused");
    expect(paused.newtonian.timeSeconds).toBe(
      paused.firstPostNewtonian.timeSeconds
    );

    comparison.reset();
    const reset = comparison.snapshot();
    expect(reset.status).toBe("paused");
    expect(reset.newtonian.stepCount).toBe(0);
    expect(reset.firstPostNewtonian.stepCount).toBe(0);
    expect([...reset.newtonian.positionsM]).toEqual([
      ...reset.firstPostNewtonian.positionsM,
    ]);
  });

  it("stops both branches on the last synchronized pair when one candidate fails", () => {
    const comparison = new SynchronizedGravityComparisonEngine(
      headOnCollisionScenario()
    );
    expect(comparison.start()).toBe(true);

    let acceptedSteps = 0;
    while (acceptedSteps < 1_000 && comparison.advanceOneStep()) {
      acceptedSteps += 1;
    }

    const stopped = comparison.snapshot();
    expect(acceptedSteps).toBeLessThan(1_000);
    expect(["collision", "unresolved-encounter"]).toContain(
      stopped.status
    );
    expect(stopped.newtonian.stepCount).toBe(
      stopped.firstPostNewtonian.stepCount
    );
    expect(stopped.newtonian.timeSeconds).toBe(
      stopped.firstPostNewtonian.timeSeconds
    );
  });
});
