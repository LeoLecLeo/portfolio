import {
  DISTANCE_DRAFT_UNIT_CONVERTER,
  MASS_DRAFT_UNIT_CONVERTER,
  SPEED_DRAFT_UNIT_CONVERTER,
  appliedScenarioToDraft,
  createDraftNumber,
  type AppliedScenario,
  type BodyDraft,
  type ScenarioDraft,
  type ScenarioDraftUnitPolicy,
} from "../core/scenario";
import { MAX_NEWTONIAN_BODIES } from "../core/types";
import type { PrototypeTelemetry } from "../runtime/GravityPrototypeRuntime";
import type {
  GravityLabHostSnapshot,
  GravityLabSession,
} from "../runtime/GravityLabSession";

export const EDITOR_DRAFT_UNIT_POLICY: ScenarioDraftUnitPolicy =
  Object.freeze({
    mass: "kg",
    physicalRadius: "m",
    position: "m",
    velocity: "m/s",
    time: "s",
  });

export type GravityLabState = Readonly<{
  draft: ScenarioDraft;
  appliedScenario: AppliedScenario;
  activeSession: GravityLabSession;
  sessionTelemetry: PrototypeTelemetry;
  sessionRevision: number;
  selectedDraftBodyId: string;
  selectedSessionBodyId: string;
  nextBodyOrdinal: number;
}>;

export type GravityLabAction =
  | Readonly<{
      type: "session-updated";
      snapshot: GravityLabHostSnapshot;
    }>
  | Readonly<{
      type: "session-replaced";
      snapshot: GravityLabHostSnapshot;
    }>
  | Readonly<{
      type: "select-draft-body";
      bodyId: string;
    }>
  | Readonly<{
      type: "add-body";
    }>
  | Readonly<{
      type: "remove-body";
      bodyId: string;
    }>
  | Readonly<{
      type: "cancel-draft";
    }>;

function draftFromApplied(
  appliedScenario: AppliedScenario
): ScenarioDraft {
  return appliedScenarioToDraft(
    appliedScenario,
    EDITOR_DRAFT_UNIT_POLICY
  );
}

function createExplicitBodyDraft(
  id: string,
  ordinal: number,
  existingBodyCount: number
): BodyDraft {
  const mass = createDraftNumber(
    "1e20",
    "kg",
    MASS_DRAFT_UNIT_CONVERTER
  );
  const radius = createDraftNumber(
    "1e6",
    "m",
    DISTANCE_DRAFT_UNIT_CONVERTER
  );
  const position = (value: string) =>
    createDraftNumber(
      value,
      "m",
      DISTANCE_DRAFT_UNIT_CONVERTER
    );
  const velocity = (value: string) =>
    createDraftNumber(
      value,
      "m/s",
      SPEED_DRAFT_UNIT_CONVERTER
    );

  return {
    id,
    name: `Corps ${ordinal}`,
    fixed: false,
    mass,
    physicalRadius: radius,
    initialPosition: {
      x: position(String(existingBodyCount * 1e9)),
      y: position("0"),
      z: position("0"),
    },
    initialVelocity: {
      x: velocity("0"),
      y: velocity("0"),
      z: velocity("0"),
    },
  };
}

function nextUniqueBodyId(
  draft: ScenarioDraft,
  startingOrdinal: number
): Readonly<{ id: string; ordinal: number }> {
  const existingIds = new Set(draft.bodies.map(({ id }) => id));
  let ordinal = startingOrdinal;
  let id = `draft-body-${ordinal}`;

  while (existingIds.has(id)) {
    ordinal += 1;
    id = `draft-body-${ordinal}`;
  }

  return { id, ordinal };
}

export function createGravityLabState(
  snapshot: GravityLabHostSnapshot
): GravityLabState {
  const firstBodyId =
    snapshot.appliedScenario.physics.bodies[0].id;

  return {
    draft: draftFromApplied(snapshot.appliedScenario),
    appliedScenario: snapshot.appliedScenario,
    activeSession: snapshot.session,
    sessionTelemetry: snapshot.telemetry,
    sessionRevision: snapshot.revision,
    selectedDraftBodyId: firstBodyId,
    selectedSessionBodyId: firstBodyId,
    nextBodyOrdinal: 1,
  };
}

export function gravityLabReducer(
  state: GravityLabState,
  action: GravityLabAction
): GravityLabState {
  switch (action.type) {
    case "session-updated":
      if (
        action.snapshot.session !== state.activeSession ||
        action.snapshot.appliedScenario !== state.appliedScenario
      ) {
        return state;
      }

      return {
        ...state,
        sessionTelemetry: action.snapshot.telemetry,
        sessionRevision: action.snapshot.revision,
      };

    case "session-replaced": {
      const firstBodyId =
        action.snapshot.appliedScenario.physics.bodies[0].id;

      return {
        ...state,
        draft: draftFromApplied(action.snapshot.appliedScenario),
        appliedScenario: action.snapshot.appliedScenario,
        activeSession: action.snapshot.session,
        sessionTelemetry: action.snapshot.telemetry,
        sessionRevision: action.snapshot.revision,
        selectedDraftBodyId: firstBodyId,
        selectedSessionBodyId: firstBodyId,
      };
    }

    case "select-draft-body":
      return state.draft.bodies.some(
        ({ id }) => id === action.bodyId
      )
        ? { ...state, selectedDraftBodyId: action.bodyId }
        : state;

    case "add-body": {
      if (state.draft.bodies.length >= MAX_NEWTONIAN_BODIES) {
        return state;
      }

      const next = nextUniqueBodyId(
        state.draft,
        state.nextBodyOrdinal
      );
      const newBody = createExplicitBodyDraft(
        next.id,
        next.ordinal,
        state.draft.bodies.length
      );

      return {
        ...state,
        draft: {
          ...state.draft,
          bodies: [...state.draft.bodies, newBody],
        },
        selectedDraftBodyId: newBody.id,
        nextBodyOrdinal: next.ordinal + 1,
      };
    }

    case "remove-body": {
      if (state.draft.bodies.length <= 1) {
        return state;
      }

      const removedIndex = state.draft.bodies.findIndex(
        ({ id }) => id === action.bodyId
      );

      if (removedIndex === -1) {
        return state;
      }

      const bodies = state.draft.bodies.filter(
        ({ id }) => id !== action.bodyId
      );
      const selectedDraftBodyId =
        state.selectedDraftBodyId === action.bodyId
          ? bodies[Math.min(removedIndex, bodies.length - 1)].id
          : state.selectedDraftBodyId;

      return {
        ...state,
        draft: { ...state.draft, bodies },
        selectedDraftBodyId,
      };
    }

    case "cancel-draft": {
      const draft = draftFromApplied(state.appliedScenario);
      const selectedDraftBodyId = draft.bodies.some(
        ({ id }) => id === state.selectedDraftBodyId
      )
        ? state.selectedDraftBodyId
        : draft.bodies.some(
              ({ id }) => id === state.selectedSessionBodyId
            )
          ? state.selectedSessionBodyId
          : draft.bodies[0].id;

      return {
        ...state,
        draft,
        selectedDraftBodyId,
      };
    }
  }
}
