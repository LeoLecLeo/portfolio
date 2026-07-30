import { describe, expect, it } from "vitest";

import { appliedScenarioToDraft } from "../core/scenario";
import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_SCHEDULER_CONFIG,
} from "../presets/inclinedBinary";
import { GravityLabSessionHost } from "../runtime/GravityLabSession";
import {
  EDITOR_DRAFT_UNIT_POLICY,
  createGravityLabState,
  gravityLabReducer,
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
});
