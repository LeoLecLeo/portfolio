import { describe, expect, it, vi } from "vitest";

import { compileScenarioDraft } from "../core/scenarioCompiler";
import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_SCHEDULER_CONFIG,
} from "../presets/inclinedBinary";
import { GravityLabSessionHost } from "../runtime/GravityLabSession";
import {
  createGravityLabState,
  gravityLabReducer,
  hasUnappliedScenarioChanges,
  type GravityLabState,
} from "./gravityLabReducer";
import { applyGravityLabDraft } from "./gravityLabApplication";

function setup(): Readonly<{
  host: GravityLabSessionHost;
  state: GravityLabState;
}> {
  const host = new GravityLabSessionHost({
    appliedScenario: createInclinedBinaryAppliedScenario(
      INCLINED_BINARY_SCHEDULER_CONFIG
    ),
    schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
  });

  return {
    host,
    state: createGravityLabState(host.snapshot),
  };
}

function editName(
  state: GravityLabState,
  name = "Binaire appliqué"
): GravityLabState {
  return gravityLabReducer(state, {
    type: "edit-body-name",
    bodyId: state.selectedDraftBodyId,
    name,
  });
}

describe("gravity-lab draft application", () => {
  it("does not apply an invalid draft", () => {
    const { host, state: initial } = setup();
    const invalid = gravityLabReducer(initial, {
      type: "edit-number-raw",
      bodyId: initial.selectedDraftBodyId,
      field: "mass",
      rawText: "invalid mass",
    });
    const previousSnapshot = host.snapshot;
    const result = applyGravityLabDraft(invalid, host);

    expect(result.ok).toBe(false);
    expect(result.report?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "parse.invalid-syntax",
        }),
      ])
    );
    expect(host.snapshot).toBe(previousSnapshot);
    expect(invalid.appliedScenario).toBe(initial.appliedScenario);
    expect(invalid.activeSession).toBe(initial.activeSession);
    expect(initial.activeSession.runtime.isDisposed).toBe(false);
  });

  it("refuses application when the host is running but React state is still paused", () => {
    const { host, state: pausedReactState } = setup();
    const edited = editName(pausedReactState);
    const session = pausedReactState.activeSession;
    const appliedScenario = pausedReactState.appliedScenario;

    expect(pausedReactState.sessionTelemetry.status).toBe("paused");
    expect(host.resume().telemetry.status).toBe("running");
    expect(session.runtime.isRunning).toBe(true);

    const replace = vi.spyOn(host, "replace");
    const authoritativeSnapshot = host.snapshot;
    const result = applyGravityLabDraft(edited, host);

    expect(result).toEqual({
      ok: false,
      report: null,
      message:
        "Mettez la simulation en pause avant d’appliquer le brouillon.",
    });
    expect(replace).not.toHaveBeenCalled();
    expect(host.snapshot).toBe(authoritativeSnapshot);
    expect(host.snapshot.session).toBe(session);
    expect(host.snapshot.appliedScenario).toBe(appliedScenario);
    expect(session.runtime.isRunning).toBe(true);
    expect(edited.activeSession).toBe(session);
    expect(edited.appliedScenario).toBe(appliedScenario);
  });

  it("creates an immutable applied scenario and a new active session", () => {
    const { host, state: initial } = setup();
    let edited = editName(initial);
    edited = gravityLabReducer(edited, {
      type: "edit-body-color",
      bodyId: edited.selectedDraftBodyId,
      color: "#1234Ab",
    });
    const previousSession = initial.activeSession;
    const result = applyGravityLabDraft(edited, host);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the valid draft to be applied.");
    }

    const applied = gravityLabReducer(edited, result.action);
    expect(applied.activeSession).not.toBe(previousSession);
    expect(applied.appliedScenario).toBe(
      applied.activeSession.appliedScenario
    );
    expect(applied.appliedScenario.physics.bodies[0].name).toBe(
      "Binaire appliqué"
    );
    expect(applied.appliedScenario.presentation.bodies[0].color).toBe(
      "#1234Ab"
    );
    expect(Object.isFrozen(applied.appliedScenario)).toBe(true);
    expect(
      Object.isFrozen(applied.appliedScenario.presentation.bodies[0])
    ).toBe(true);
    expect(previousSession.runtime.isDisposed).toBe(true);
    expect(applied.sessionTelemetry).toMatchObject({
      modelId: "newtonian",
      integratorId: "velocity-verlet",
    });
    expect(
      hasUnappliedScenarioChanges(
        applied.draft,
        applied.appliedScenario
      )
    ).toBe(false);
  });

  it("applies a 1PN draft through a fresh paused RK4 session", () => {
    const { host, state: initial } = setup();
    const relativisticDraft = gravityLabReducer(initial, {
      type: "set-gravity-model",
      modelId: "first-post-newtonian",
    });

    expect(relativisticDraft.activeSession).toBe(initial.activeSession);
    expect(relativisticDraft.sessionTelemetry.modelId).toBe("newtonian");

    const result = applyGravityLabDraft(relativisticDraft, host);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the valid 1PN draft to be applied.");
    }

    const applied = gravityLabReducer(
      relativisticDraft,
      result.action
    );
    expect(applied.draft.modelId).toBe("first-post-newtonian");
    expect(applied.appliedScenario.physics.modelId).toBe(
      "first-post-newtonian"
    );
    expect(applied.activeSession.specification).toEqual({
      modelId: "first-post-newtonian",
      integratorId: "fixed-rk4",
      timeStepSeconds:
        applied.appliedScenario.numericalPolicy.timeStepSeconds,
    });
    expect(applied.sessionTelemetry).toMatchObject({
      modelId: "first-post-newtonian",
      integratorId: "fixed-rk4",
      firstPostNewtonianDomain: "weak-correction",
      status: "paused",
      timeSeconds: 0,
      relativeEnergyDrift: null,
    });
    expect(initial.activeSession.runtime.isDisposed).toBe(true);
  });

  it("refuses a 1PN draft outside the documented domain without replacing the session", () => {
    const { host, state: initial } = setup();
    let invalid = gravityLabReducer(initial, {
      type: "set-gravity-model",
      modelId: "first-post-newtonian",
    });
    invalid = gravityLabReducer(invalid, {
      type: "edit-number-raw",
      bodyId: invalid.selectedDraftBodyId,
      field: "velocity-x",
      rawText: "1e8",
    });
    const before = host.snapshot;

    const result = applyGravityLabDraft(invalid, host);

    expect(result.ok).toBe(false);
    expect(result.report?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "domain.beta.limit" }),
      ])
    );
    expect(host.snapshot).toBe(before);
    expect(initial.activeSession.runtime.isDisposed).toBe(false);
    expect(invalid.activeSession).toBe(initial.activeSession);
    expect(invalid.appliedScenario).toBe(initial.appliedScenario);
  });

  it("refuses fixed bodies in a 1PN draft before session replacement", () => {
    const { host, state: initial } = setup();
    const bodyId = initial.selectedDraftBodyId;
    let invalid = gravityLabReducer(initial, {
      type: "set-gravity-model",
      modelId: "first-post-newtonian",
    });

    for (const field of [
      "velocity-x",
      "velocity-y",
      "velocity-z",
    ] as const) {
      invalid = gravityLabReducer(invalid, {
        type: "edit-number-raw",
        bodyId,
        field,
        rawText: "0",
      });
    }
    invalid = gravityLabReducer(invalid, {
      type: "set-body-fixed",
      bodyId,
      fixed: true,
    });
    const before = host.snapshot;

    const result = applyGravityLabDraft(invalid, host);

    expect(result.ok).toBe(false);
    expect(result.report?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "body.first-post-newtonian-fixed",
          path: "/bodies/0/fixed",
        }),
      ])
    );
    expect(host.snapshot).toBe(before);
    expect(initial.activeSession.runtime.isDisposed).toBe(false);
  });

  it("publishes the replacement as one coherent reducer transition", () => {
    const { host, state: initial } = setup();
    const edited = editName(initial);
    const result = applyGravityLabDraft(edited, host);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the valid draft to be applied.");
    }

    expect(result.action.snapshot).toBe(host.snapshot);
    expect(result.action.snapshot.appliedScenario).toBe(
      result.action.snapshot.session.appliedScenario
    );
    const applied = gravityLabReducer(edited, result.action);
    expect(applied).toMatchObject({
      appliedScenario: result.action.snapshot.appliedScenario,
      activeSession: result.action.snapshot.session,
      sessionTelemetry: result.action.snapshot.telemetry,
      sessionRevision: result.action.snapshot.revision,
    });
  });

  it("starts the replacement at time zero and paused", () => {
    const { host, state: initial } = setup();
    const oldRuntime = initial.activeSession.runtime;

    expect(oldRuntime.resume()).toBe(true);
    oldRuntime.advanceFrame(0);
    oldRuntime.advanceFrame(1 / 60);
    oldRuntime.pause();
    const advancedSnapshot = host.publishTelemetry(
      initial.activeSession,
      oldRuntime.telemetry()
    );
    if (advancedSnapshot === null) {
      throw new Error("Expected current-session telemetry.");
    }
    const advancedState = gravityLabReducer(initial, {
      type: "session-updated",
      snapshot: advancedSnapshot,
    });
    expect(advancedState.sessionTelemetry.timeSeconds).toBeGreaterThan(
      0
    );

    const result = applyGravityLabDraft(
      editName(advancedState),
      host
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const applied = gravityLabReducer(advancedState, result.action);
      expect(applied.sessionTelemetry.status).toBe("paused");
      expect(applied.sessionTelemetry.timeSeconds).toBe(0);
      expect(applied.activeSession.runtime.isRunning).toBe(false);
    }
  });

  it("keeps the successful draft synchronized with its applied scenario", () => {
    const { host, state: initial } = setup();
    let edited = editName(initial, "Scénario synchronisé");
    edited = gravityLabReducer(edited, {
      type: "change-mass-unit",
      bodyId: edited.selectedDraftBodyId,
      unit: "solar-mass",
    });
    const result = applyGravityLabDraft(edited, host);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the valid draft to be applied.");
    }

    const applied = gravityLabReducer(edited, result.action);
    const recompiled = compileScenarioDraft(applied.draft, {
      budget: applied.activeSession.schedulerConfig,
    });
    expect(recompiled.ok).toBe(true);
    if (recompiled.ok) {
      expect(recompiled.scenario.physics).toEqual(
        applied.appliedScenario.physics
      );
      expect(recompiled.scenario.presentation).toEqual(
        applied.appliedScenario.presentation
      );
      expect(recompiled.scenario.numericalPolicy).toEqual(
        applied.appliedScenario.numericalPolicy
      );
    }
    expect(applied.draft.bodies[0].mass.unit).toBe("solar-mass");
  });

  it("leaves all state unchanged when session construction fails", () => {
    const { host, state: initial } = setup();
    const edited = editName(initial);
    const previousSnapshot = host.snapshot;
    vi.spyOn(host, "replace").mockImplementation(() => {
      throw new Error("synthetic construction failure");
    });

    const result = applyGravityLabDraft(edited, host);
    expect(result).toMatchObject({
      ok: false,
      message:
        "La nouvelle session n’a pas pu être créée. Le scénario et la session précédents ont été conservés.",
    });
    expect(host.snapshot).toBe(previousSnapshot);
    expect(edited.appliedScenario).toBe(initial.appliedScenario);
    expect(edited.activeSession).toBe(initial.activeSession);
    expect(edited.draft).not.toBe(initial.draft);
    expect(initial.activeSession.runtime.isDisposed).toBe(false);
  });

  it("ignores telemetry from the replaced session", () => {
    const { host, state: initial } = setup();
    const previousSession = initial.activeSession;
    const staleTelemetry = previousSession.runtime.telemetry();
    const previousSnapshot = host.snapshot;
    const edited = editName(initial);
    const result = applyGravityLabDraft(edited, host);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the valid draft to be applied.");
    }

    const applied = gravityLabReducer(edited, result.action);
    expect(
      host.publishTelemetry(previousSession, staleTelemetry)
    ).toBeNull();
    const afterStaleReducerAction = gravityLabReducer(applied, {
      type: "session-updated",
      snapshot: previousSnapshot,
    });
    expect(afterStaleReducerAction).toBe(applied);
  });

  it("reconciles the session selection with the applied draft selection", () => {
    const { host, state: initial } = setup();
    const secondBodyId = initial.draft.bodies[1].id;
    const selected = gravityLabReducer(initial, {
      type: "select-draft-body",
      bodyId: secondBodyId,
    });
    const result = applyGravityLabDraft(selected, host);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const applied = gravityLabReducer(selected, result.action);
      expect(applied.selectedDraftBodyId).toBe(secondBodyId);
      expect(applied.selectedSessionBodyId).toBe(secondBodyId);
      expect(
        applied.activeSession.bodies.some(
          ({ bodyId }) => bodyId === secondBodyId
        )
      ).toBe(true);
    }
  });
});
