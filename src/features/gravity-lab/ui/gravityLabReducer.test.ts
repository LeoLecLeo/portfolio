import { describe, expect, it } from "vitest";

import { appliedScenarioToDraft } from "../core/scenario";
import { compileScenarioDraft } from "../core/scenarioCompiler";
import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_SCHEDULER_CONFIG,
} from "../presets/inclinedBinary";
import { STAR_PLANET_PRESET } from "../presets/starPlanet";
import { GravityLabSessionHost } from "../runtime/GravityLabSession";
import {
  EDITOR_DRAFT_UNIT_POLICY,
  bodyColorError,
  bodyNameError,
  createGravityLabState,
  gravityLabReducer,
  hasUnappliedScenarioChanges,
  type GravityLabState,
} from "./gravityLabReducer";

function initialState(): GravityLabState {
  const host = new GravityLabSessionHost({
    appliedScenario: createInclinedBinaryAppliedScenario(
      INCLINED_BINARY_SCHEDULER_CONFIG
    ),
    schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
  });

  return createGravityLabState(host.snapshot);
}

function addBody(state: GravityLabState): GravityLabState {
  return gravityLabReducer(state, { type: "add-body" });
}

describe("gravity-lab draft reducer", () => {
  it("starts Newtonian and keeps a model change confined to the draft", () => {
    const initial = initialState();
    const activeSession = initial.activeSession;
    const appliedScenario = initial.appliedScenario;

    expect(initial.draft.modelId).toBe("newtonian");
    expect(initial.sessionTelemetry).toMatchObject({
      modelId: "newtonian",
      integratorId: "velocity-verlet",
    });

    const changed = gravityLabReducer(initial, {
      type: "set-gravity-model",
      modelId: "first-post-newtonian",
    });

    expect(changed.draft.modelId).toBe("first-post-newtonian");
    expect(changed.activeSession).toBe(activeSession);
    expect(changed.appliedScenario).toBe(appliedScenario);
    expect(changed.sessionTelemetry).toBe(initial.sessionTelemetry);
    expect(
      hasUnappliedScenarioChanges(
        changed.draft,
        changed.appliedScenario
      )
    ).toBe(true);

    const cancelled = gravityLabReducer(changed, {
      type: "cancel-draft",
    });
    expect(cancelled.draft.modelId).toBe("newtonian");
    expect(cancelled.activeSession).toBe(activeSession);
  });

  it("distinguishes a synchronized draft from unapplied changes", () => {
    const initial = initialState();

    expect(
      hasUnappliedScenarioChanges(
        initial.draft,
        initial.appliedScenario
      )
    ).toBe(false);

    const changed = gravityLabReducer(initial, {
      type: "edit-body-name",
      bodyId: initial.selectedDraftBodyId,
      name: "Nom non appliqué",
    });
    expect(
      hasUnappliedScenarioChanges(
        changed.draft,
        changed.appliedScenario
      )
    ).toBe(true);

    const cancelled = gravityLabReducer(changed, {
      type: "cancel-draft",
    });
    expect(
      hasUnappliedScenarioChanges(
        cancelled.draft,
        cancelled.appliedScenario
      )
    ).toBe(false);
  });

  it("treats invalid input as unapplied without using its valid history", () => {
    const initial = initialState();
    const invalid = gravityLabReducer(initial, {
      type: "edit-number-raw",
      bodyId: initial.selectedDraftBodyId,
      field: "mass",
      rawText: "5 kg",
    });

    expect(
      hasUnappliedScenarioChanges(
        invalid.draft,
        invalid.appliedScenario
      )
    ).toBe(true);
  });

  it("does not report a display-unit change when the SI value is unchanged", () => {
    const initial = initialState();
    const changedUnit = gravityLabReducer(initial, {
      type: "change-mass-unit",
      bodyId: initial.selectedDraftBodyId,
      unit: "solar-mass",
    });

    expect(
      hasUnappliedScenarioChanges(
        changedUnit.draft,
        changedUnit.appliedScenario
      )
    ).toBe(false);
  });

  it("adds explicit bodies up to the approved limit of 16", () => {
    let state = initialState();

    while (state.draft.bodies.length < 16) {
      state = addBody(state);
    }

    expect(state.draft.bodies).toHaveLength(16);
    const added = state.draft.bodies.at(-1);
    expect(added).toMatchObject({
      id: "draft-body-14",
      name: "Corps 14",
      fixed: false,
      mass: { rawText: "1e20", unit: "kg", siValue: 1e20 },
      physicalRadius: {
        rawText: "1e6",
        unit: "m",
        siValue: 1e6,
      },
    });
    expect(added?.initialPosition.z.siValue).toBe(0);
    expect(added?.initialVelocity.z.siValue).toBe(0);
  });

  it("refuses a seventeenth body without changing state", () => {
    let state = initialState();

    while (state.draft.bodies.length < 16) {
      state = addBody(state);
    }

    expect(addBody(state)).toBe(state);
  });

  it("never removes the final remaining body", () => {
    let state = initialState();
    state = gravityLabReducer(state, {
      type: "remove-body",
      bodyId: state.draft.bodies[0].id,
    });
    expect(state.draft.bodies).toHaveLength(1);

    const unchanged = gravityLabReducer(state, {
      type: "remove-body",
      bodyId: state.draft.bodies[0].id,
    });
    expect(unchanged).toBe(state);
  });

  it("keeps generated IDs unique and does not reuse a deleted ID", () => {
    let state = addBody(initialState());
    const firstGeneratedId = state.selectedDraftBodyId;
    state = addBody(state);
    const secondGeneratedId = state.selectedDraftBodyId;
    state = gravityLabReducer(state, {
      type: "remove-body",
      bodyId: firstGeneratedId,
    });
    state = addBody(state);
    const thirdGeneratedId = state.selectedDraftBodyId;
    const ids = state.draft.bodies.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(secondGeneratedId).not.toBe(firstGeneratedId);
    expect(thirdGeneratedId).not.toBe(firstGeneratedId);
    expect(thirdGeneratedId).not.toBe(secondGeneratedId);
  });

  it("selects each newly added body", () => {
    const before = initialState();
    const after = addBody(before);
    const addedId = after.draft.bodies.at(-1)?.id;

    expect(addedId).toBeDefined();
    expect(after.selectedDraftBodyId).toBe(addedId);
    expect(after.selectedDraftBodyId).not.toBe(
      before.selectedDraftBodyId
    );
  });

  it("synchronizes a list selection with the active session", () => {
    const initial = initialState();
    const secondBodyId = initial.draft.bodies[1].id;
    const selected = gravityLabReducer(initial, {
      type: "select-draft-body",
      bodyId: secondBodyId,
    });

    expect(selected.selectedDraftBodyId).toBe(secondBodyId);
    expect(selected.selectedSessionBodyId).toBe(secondBodyId);
  });

  it("synchronizes a Canvas selection with the draft", () => {
    const initial = initialState();
    const secondBodyId = initial.activeSession.bodies[1].bodyId;
    const selected = gravityLabReducer(initial, {
      type: "select-session-body",
      sourceSession: initial.activeSession,
      bodyId: secondBodyId,
    });

    expect(selected.selectedSessionBodyId).toBe(secondBodyId);
    expect(selected.selectedDraftBodyId).toBe(secondBodyId);
  });

  it("projects selections bidirectionally only for shared body IDs", () => {
    const initial = initialState();
    const withDraftOnlyBody = addBody(initial);
    const draftOnlyBodyId = withDraftOnlyBody.selectedDraftBodyId;
    const sessionBodyId =
      withDraftOnlyBody.activeSession.bodies[1].bodyId;

    expect(withDraftOnlyBody.selectedSessionBodyId).toBe(
      initial.selectedSessionBodyId
    );

    const fromCanvas = gravityLabReducer(withDraftOnlyBody, {
      type: "select-session-body",
      sourceSession: withDraftOnlyBody.activeSession,
      bodyId: sessionBodyId,
    });
    expect(fromCanvas.selectedDraftBodyId).toBe(sessionBodyId);
    expect(fromCanvas.selectedSessionBodyId).toBe(sessionBodyId);

    const fromList = gravityLabReducer(fromCanvas, {
      type: "select-draft-body",
      bodyId: draftOnlyBodyId,
    });
    expect(fromList.selectedDraftBodyId).toBe(draftOnlyBodyId);
    expect(fromList.selectedSessionBodyId).toBe(sessionBodyId);
  });

  it("reconciles both selections after deleting a shared selected body", () => {
    const initial = initialState();
    const secondBodyId = initial.draft.bodies[1].id;
    const selected = gravityLabReducer(initial, {
      type: "select-draft-body",
      bodyId: secondBodyId,
    });
    const removed = gravityLabReducer(selected, {
      type: "remove-body",
      bodyId: secondBodyId,
    });
    const remainingBodyId = removed.draft.bodies[0].id;

    expect(removed.selectedDraftBodyId).toBe(remainingBodyId);
    expect(removed.selectedSessionBodyId).toBe(remainingBodyId);
  });

  it("selects the deterministic neighbour after deleting the selection", () => {
    let state = addBody(initialState());
    const selectedId = state.selectedDraftBodyId;
    const selectedIndex = state.draft.bodies.findIndex(
      ({ id }) => id === selectedId
    );
    const expectedNeighbour =
      state.draft.bodies[selectedIndex - 1].id;

    state = gravityLabReducer(state, {
      type: "remove-body",
      bodyId: selectedId,
    });

    expect(
      state.draft.bodies.some(
        ({ id }) => id === state.selectedDraftBodyId
      )
    ).toBe(true);
    expect(state.selectedDraftBodyId).toBe(expectedNeighbour);
  });

  it("keeps the applied scenario and active session independent from CRUD", () => {
    const before = initialState();
    const appliedScenario = before.appliedScenario;
    const activeSession = before.activeSession;
    const selectedSessionBodyId = before.selectedSessionBodyId;
    const sessionBodyCount = activeSession.runtime.bodyCount;
    let after = addBody(before);
    after = gravityLabReducer(after, {
      type: "remove-body",
      bodyId: before.draft.bodies[0].id,
    });

    expect(after.appliedScenario).toBe(appliedScenario);
    expect(after.activeSession).toBe(activeSession);
    expect(after.selectedSessionBodyId).toBe(selectedSessionBodyId);
    expect(after.activeSession.runtime.bodyCount).toBe(
      sessionBodyCount
    );
    expect(after.activeSession.runtime.telemetry().timeSeconds).toBe(
      0
    );
  });

  it("cancels changes by rebuilding the draft from the applied scenario", () => {
    const initial = initialState();
    let changed = addBody(initial);
    changed = gravityLabReducer(changed, {
      type: "remove-body",
      bodyId: initial.draft.bodies[0].id,
    });
    const changedDraft = changed.draft;
    const cancelled = gravityLabReducer(changed, {
      type: "cancel-draft",
    });
    const expected = appliedScenarioToDraft(
      initial.appliedScenario,
      EDITOR_DRAFT_UNIT_POLICY
    );

    expect(cancelled.draft).toEqual(expected);
    expect(cancelled.draft).not.toBe(changedDraft);
    expect(cancelled.appliedScenario).toBe(
      initial.appliedScenario
    );
    expect(cancelled.activeSession).toBe(initial.activeSession);
    expect(
      cancelled.draft.bodies.some(
        ({ id }) => id === cancelled.selectedDraftBodyId
      )
    ).toBe(true);
  });

  it("loads a preset only into the draft and reconciles its selection", () => {
    const initial = initialState();
    const activeSession = initial.activeSession;
    const appliedScenario = initial.appliedScenario;
    const selectedSessionBodyId = initial.selectedSessionBodyId;
    const telemetry = initial.sessionTelemetry;
    const presetScenario = STAR_PLANET_PRESET.createScenario();
    const loaded = gravityLabReducer(initial, {
      type: "preset-draft-loaded",
      scenario: presetScenario,
      preferredSimulatedSecondsPerRealSecond:
        STAR_PLANET_PRESET.preferredSimulatedSecondsPerRealSecond,
    });
    const expectedDraft = appliedScenarioToDraft(
      presetScenario,
      EDITOR_DRAFT_UNIT_POLICY
    );

    expect(loaded.draft).toEqual(expectedDraft);
    expect(loaded.draft).not.toBe(initial.draft);
    expect(
      loaded.draft.bodies.some(
        ({ id }) => id === loaded.selectedDraftBodyId
      )
    ).toBe(true);
    expect(loaded.selectedDraftBodyId).toBe(
      presetScenario.physics.bodies[0].id
    );
    expect(loaded.appliedScenario).toBe(appliedScenario);
    expect(loaded.activeSession).toBe(activeSession);
    expect(loaded.sessionTelemetry).toBe(telemetry);
    expect(loaded.selectedSessionBodyId).toBe(selectedSessionBodyId);
    expect(
      hasUnappliedScenarioChanges(
        loaded.draft,
        loaded.appliedScenario
      )
    ).toBe(true);
  });

  it("cancels a loaded preset by restoring the applied scenario", () => {
    const initial = initialState();
    const loaded = gravityLabReducer(initial, {
      type: "preset-draft-loaded",
      scenario: STAR_PLANET_PRESET.createScenario(),
      preferredSimulatedSecondsPerRealSecond:
        STAR_PLANET_PRESET.preferredSimulatedSecondsPerRealSecond,
    });
    const cancelled = gravityLabReducer(loaded, {
      type: "cancel-draft",
    });

    expect(cancelled.draft).toEqual(initial.draft);
    expect(cancelled.appliedScenario).toBe(initial.appliedScenario);
    expect(cancelled.activeSession).toBe(initial.activeSession);
    expect(
      hasUnappliedScenarioChanges(
        cancelled.draft,
        cancelled.appliedScenario
      )
    ).toBe(false);
  });

  it("edits every selected-body field only in the draft", () => {
    const initial = initialState();
    const bodyId = initial.selectedDraftBodyId;
    const appliedScenario = initial.appliedScenario;
    const activeSession = initial.activeSession;
    let state = gravityLabReducer(initial, {
      type: "edit-body-name",
      bodyId,
      name: "Étoile éditée",
    });
    state = gravityLabReducer(state, {
      type: "edit-body-color",
      bodyId,
      color: "#12AbEf",
    });
    state = gravityLabReducer(state, {
      type: "edit-number-raw",
      bodyId,
      field: "mass",
      rawText: "2e30",
    });
    state = gravityLabReducer(state, {
      type: "edit-number-raw",
      bodyId,
      field: "physicalRadius",
      rawText: "7e8",
    });
    state = gravityLabReducer(state, {
      type: "edit-number-raw",
      bodyId,
      field: "position-z",
      rawText: "42",
    });
    state = gravityLabReducer(state, {
      type: "edit-number-raw",
      bodyId,
      field: "velocity-y",
      rawText: "-1250",
    });
    state = gravityLabReducer(state, {
      type: "set-body-fixed",
      bodyId,
      fixed: true,
    });
    const body = state.draft.bodies.find(({ id }) => id === bodyId);

    expect(body).toMatchObject({
      id: bodyId,
      name: "Étoile éditée",
      color: "#12AbEf",
      fixed: true,
      mass: { rawText: "2e30", siValue: 2e30 },
      physicalRadius: { rawText: "7e8", siValue: 7e8 },
      initialPosition: { z: { rawText: "42", siValue: 42 } },
      initialVelocity: {
        y: { rawText: "-1250", siValue: -1250 },
      },
    });
    expect(state.appliedScenario).toBe(appliedScenario);
    expect(state.activeSession).toBe(activeSession);
  });

  it("preserves invalid raw values and their field errors", () => {
    const initial = initialState();
    const bodyId = initial.selectedDraftBodyId;
    let state = gravityLabReducer(initial, {
      type: "edit-number-raw",
      bodyId,
      field: "mass",
      rawText: "5 kg",
    });
    state = gravityLabReducer(state, {
      type: "edit-body-name",
      bodyId,
      name: "   ",
    });
    state = gravityLabReducer(state, {
      type: "edit-body-color",
      bodyId,
      color: "#12ZZ00",
    });
    const body = state.draft.bodies.find(({ id }) => id === bodyId);

    expect(body?.mass.rawText).toBe("5 kg");
    expect(body?.mass.siValue).toBeNull();
    expect(body?.mass.errors).toEqual([
      expect.objectContaining({ code: "parse.invalid-syntax" }),
    ]);
    expect(bodyNameError(body?.name ?? "")).not.toBeNull();
    expect(bodyColorError(body?.color ?? "")).not.toBeNull();
  });

  it("changes units without changing the canonical physical value", () => {
    const initial = initialState();
    const bodyId = initial.selectedDraftBodyId;
    const original = initial.draft.bodies.find(
      ({ id }) => id === bodyId
    );
    let state = gravityLabReducer(initial, {
      type: "change-mass-unit",
      bodyId,
      unit: "solar-mass",
    });
    state = gravityLabReducer(state, {
      type: "change-distance-unit",
      bodyId,
      field: "position-x",
      unit: "au",
    });
    state = gravityLabReducer(state, {
      type: "change-speed-unit",
      bodyId,
      field: "velocity-z",
      unit: "km/s",
    });
    const changed = state.draft.bodies.find(
      ({ id }) => id === bodyId
    );

    expect(changed?.mass.unit).toBe("solar-mass");
    expect(changed?.mass.siValue).toBe(original?.mass.siValue);
    expect(changed?.initialPosition.x.unit).toBe("au");
    expect(changed?.initialPosition.x.siValue).toBe(
      original?.initialPosition.x.siValue
    );
    expect(changed?.initialVelocity.z.unit).toBe("km/s");
    expect(changed?.initialVelocity.z.siValue).toBe(
      original?.initialVelocity.z.siValue
    );
  });

  it("does not replace invalid text with history during a unit change", () => {
    const initial = initialState();
    const bodyId = initial.selectedDraftBodyId;
    const invalid = gravityLabReducer(initial, {
      type: "edit-number-raw",
      bodyId,
      field: "mass",
      rawText: "5 kg",
    });
    const before = invalid.draft.bodies.find(
      ({ id }) => id === bodyId
    )?.mass;
    const after = gravityLabReducer(invalid, {
      type: "change-mass-unit",
      bodyId,
      unit: "solar-mass",
    });
    const field = after.draft.bodies.find(
      ({ id }) => id === bodyId
    )?.mass;

    expect(field).toBe(before);
    expect(field?.rawText).toBe("5 kg");
    expect(field?.siValue).toBeNull();
  });

  it("reports a fixed body with non-zero velocity without correcting it", () => {
    const initial = initialState();
    const bodyId = initial.selectedDraftBodyId;
    const beforeVelocity = initial.draft.bodies.find(
      ({ id }) => id === bodyId
    )?.initialVelocity;
    const fixed = gravityLabReducer(initial, {
      type: "set-body-fixed",
      bodyId,
      fixed: true,
    });
    const result = compileScenarioDraft(fixed.draft);
    const bodyIndex = fixed.draft.bodies.findIndex(
      ({ id }) => id === bodyId
    );
    const analyzed =
      result.report.analyzedDraft.bodies[bodyIndex];

    expect(result.ok).toBe(false);
    expect(result.report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "body.fixed-velocity",
          path: `/bodies/${bodyIndex}/initialVelocity`,
        }),
      ])
    );
    expect(analyzed.initialVelocity.x.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "body.fixed-velocity" }),
      ])
    );
    for (const axis of ["x", "y", "z"] as const) {
      expect(analyzed.initialVelocity[axis].rawText).toBe(
        beforeVelocity?.[axis].rawText
      );
      expect(analyzed.initialVelocity[axis].siValue).toBe(
        beforeVelocity?.[axis].siValue
      );
    }
    expect(fixed.appliedScenario).toBe(initial.appliedScenario);
    expect(fixed.activeSession).toBe(initial.activeSession);
  });
});
