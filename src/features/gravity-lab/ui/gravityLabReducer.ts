import {
  DISTANCE_DRAFT_UNIT_CONVERTER,
  MASS_DRAFT_UNIT_CONVERTER,
  SPEED_DRAFT_UNIT_CONVERTER,
  appliedScenarioToDraft,
  changeDraftNumberUnit,
  createDraftNumber,
  defaultBodyDraftColor,
  updateDraftNumberRawText,
  type AppliedScenario,
  type BodyDraft,
  type ScenarioDraft,
  type ScenarioDraftUnitPolicy,
} from "../core/scenario";
import { MAX_NEWTONIAN_BODIES } from "../core/types";
import type {
  DistanceUnit,
  MassUnit,
  SpeedUnit,
} from "../core/units";
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
  draftPreferredSimulatedSecondsPerRealSecond: number | null;
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
      type: "draft-applied";
      snapshot: GravityLabHostSnapshot;
      draft: ScenarioDraft;
      selectedBodyId: string;
      preferredSimulatedSecondsPerRealSecond: number | null;
    }>
  | Readonly<{
      type: "select-draft-body";
      bodyId: string;
    }>
  | Readonly<{
      type: "select-session-body";
      sourceSession: GravityLabSession;
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
    }>
  | Readonly<{
      type: "preset-draft-loaded";
      scenario: AppliedScenario;
      preferredSimulatedSecondsPerRealSecond: number | null;
    }>
  | Readonly<{
      type: "edit-body-name";
      bodyId: string;
      name: string;
    }>
  | Readonly<{
      type: "edit-body-color";
      bodyId: string;
      color: string;
    }>
  | Readonly<{
      type: "set-body-fixed";
      bodyId: string;
      fixed: boolean;
    }>
  | Readonly<{
      type: "edit-number-raw";
      bodyId: string;
      field: DraftNumericField;
      rawText: string;
    }>
  | Readonly<{
      type: "change-mass-unit";
      bodyId: string;
      unit: MassUnit;
    }>
  | Readonly<{
      type: "change-distance-unit";
      bodyId: string;
      field: DraftDistanceField;
      unit: DistanceUnit;
    }>
  | Readonly<{
      type: "change-speed-unit";
      bodyId: string;
      field: DraftSpeedField;
      unit: SpeedUnit;
    }>;

export type DraftDistanceField =
  | "physicalRadius"
  | "position-x"
  | "position-y"
  | "position-z";

export type DraftSpeedField =
  | "velocity-x"
  | "velocity-y"
  | "velocity-z";

export type DraftNumericField =
  | "mass"
  | DraftDistanceField
  | DraftSpeedField;

export function bodyNameError(name: string): string | null {
  return name.trim().length === 0
    ? "Le nom affiché est obligatoire."
    : null;
}

export function bodyColorError(color: string): string | null {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
    ? null
    : "La couleur doit utiliser le format #RRGGBB.";
}

export function hasUnappliedScenarioChanges(
  draft: ScenarioDraft,
  appliedScenario: AppliedScenario
): boolean {
  if (
    draft.precisionProfile !==
      appliedScenario.numericalPolicy.precisionProfile ||
    draft.bodies.length !== appliedScenario.physics.bodies.length
  ) {
    return true;
  }

  const draftMaximumTimeStepSeconds =
    draft.maximumTimeStep?.siValue ?? null;

  if (
    (draft.maximumTimeStep !== null &&
      draftMaximumTimeStepSeconds === null) ||
    draftMaximumTimeStepSeconds !==
      appliedScenario.numericalPolicy.maximumTimeStepSeconds
  ) {
    return true;
  }

  const presentationByBodyId = new Map(
    appliedScenario.presentation.bodies.map((body) => [
      body.bodyId,
      body,
    ])
  );

  return draft.bodies.some((body, bodyIndex) => {
    const appliedBody = appliedScenario.physics.bodies[bodyIndex];
    const presentation = presentationByBodyId.get(body.id);

    return (
      appliedBody === undefined ||
      presentation === undefined ||
      body.id !== appliedBody.id ||
      body.name !== appliedBody.name ||
      body.color !== presentation.color ||
      body.fixed !== appliedBody.fixed ||
      body.mass.siValue === null ||
      body.mass.siValue !== appliedBody.massKg ||
      body.physicalRadius.siValue === null ||
      body.physicalRadius.siValue !== appliedBody.physicalRadiusM ||
      body.initialPosition.x.siValue === null ||
      body.initialPosition.x.siValue !==
        appliedBody.initialPositionM.x ||
      body.initialPosition.y.siValue === null ||
      body.initialPosition.y.siValue !==
        appliedBody.initialPositionM.y ||
      body.initialPosition.z.siValue === null ||
      body.initialPosition.z.siValue !==
        appliedBody.initialPositionM.z ||
      body.initialVelocity.x.siValue === null ||
      body.initialVelocity.x.siValue !==
        appliedBody.initialVelocityMps.x ||
      body.initialVelocity.y.siValue === null ||
      body.initialVelocity.y.siValue !==
        appliedBody.initialVelocityMps.y ||
      body.initialVelocity.z.siValue === null ||
      body.initialVelocity.z.siValue !==
        appliedBody.initialVelocityMps.z
    );
  });
}

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
    color: defaultBodyDraftColor(existingBodyCount),
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

function updateBody(
  state: GravityLabState,
  bodyId: string,
  update: (body: BodyDraft) => BodyDraft
): GravityLabState {
  const bodyIndex = state.draft.bodies.findIndex(
    ({ id }) => id === bodyId
  );

  if (bodyIndex === -1) {
    return state;
  }

  const bodies = [...state.draft.bodies];
  bodies[bodyIndex] = update(bodies[bodyIndex]);

  return {
    ...state,
    draft: {
      ...state.draft,
      bodies,
    },
  };
}

function updateNumberRaw(
  body: BodyDraft,
  field: DraftNumericField,
  rawText: string
): BodyDraft {
  switch (field) {
    case "mass":
      return {
        ...body,
        mass: updateDraftNumberRawText(
          body.mass,
          rawText,
          MASS_DRAFT_UNIT_CONVERTER
        ),
      };
    case "physicalRadius":
      return {
        ...body,
        physicalRadius: updateDraftNumberRawText(
          body.physicalRadius,
          rawText,
          DISTANCE_DRAFT_UNIT_CONVERTER
        ),
      };
    case "position-x":
    case "position-y":
    case "position-z": {
      const axis = field.at(-1) as "x" | "y" | "z";
      return {
        ...body,
        initialPosition: {
          ...body.initialPosition,
          [axis]: updateDraftNumberRawText(
            body.initialPosition[axis],
            rawText,
            DISTANCE_DRAFT_UNIT_CONVERTER
          ),
        },
      };
    }
    case "velocity-x":
    case "velocity-y":
    case "velocity-z": {
      const axis = field.at(-1) as "x" | "y" | "z";
      return {
        ...body,
        initialVelocity: {
          ...body.initialVelocity,
          [axis]: updateDraftNumberRawText(
            body.initialVelocity[axis],
            rawText,
            SPEED_DRAFT_UNIT_CONVERTER
          ),
        },
      };
    }
  }
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
    draftPreferredSimulatedSecondsPerRealSecond:
      snapshot.session.schedulerConfig.simulatedSecondsPerRealSecond,
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
        draftPreferredSimulatedSecondsPerRealSecond:
          action.snapshot.session.schedulerConfig
            .simulatedSecondsPerRealSecond,
        selectedDraftBodyId: firstBodyId,
        selectedSessionBodyId: firstBodyId,
      };
    }

    case "draft-applied": {
      if (
        action.snapshot.appliedScenario !==
        action.snapshot.session.appliedScenario
      ) {
        return state;
      }

      const selectedBodyId =
        action.snapshot.appliedScenario.physics.bodies.some(
          ({ id }) => id === action.selectedBodyId
        )
          ? action.selectedBodyId
          : action.snapshot.appliedScenario.physics.bodies[0].id;

      return {
        ...state,
        draft: action.draft,
        appliedScenario: action.snapshot.appliedScenario,
        activeSession: action.snapshot.session,
        sessionTelemetry: action.snapshot.telemetry,
        sessionRevision: action.snapshot.revision,
        draftPreferredSimulatedSecondsPerRealSecond:
          action.preferredSimulatedSecondsPerRealSecond,
        selectedDraftBodyId: selectedBodyId,
        selectedSessionBodyId: selectedBodyId,
      };
    }

    case "select-draft-body": {
      if (
        !state.draft.bodies.some(({ id }) => id === action.bodyId)
      ) {
        return state;
      }

      const existsInSession = state.activeSession.bodies.some(
        ({ bodyId }) => bodyId === action.bodyId
      );

      return {
        ...state,
        selectedDraftBodyId: action.bodyId,
        selectedSessionBodyId: existsInSession
          ? action.bodyId
          : state.selectedSessionBodyId,
      };
    }

    case "select-session-body": {
      if (
        action.sourceSession !== state.activeSession ||
        !state.activeSession.bodies.some(
          ({ bodyId }) => bodyId === action.bodyId
        )
      ) {
        return state;
      }

      const existsInDraft = state.draft.bodies.some(
        ({ id }) => id === action.bodyId
      );

      return {
        ...state,
        selectedSessionBodyId: action.bodyId,
        selectedDraftBodyId: existsInDraft
          ? action.bodyId
          : state.selectedDraftBodyId,
      };
    }

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
        draftPreferredSimulatedSecondsPerRealSecond: null,
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
      const selectedSessionBodyId =
        state.selectedDraftBodyId === action.bodyId &&
        state.activeSession.bodies.some(
          ({ bodyId }) => bodyId === selectedDraftBodyId
        )
          ? selectedDraftBodyId
          : state.selectedSessionBodyId;

      return {
        ...state,
        draft: { ...state.draft, bodies },
        selectedDraftBodyId,
        selectedSessionBodyId,
        draftPreferredSimulatedSecondsPerRealSecond: null,
      };
    }

    case "edit-body-name":
      return updateBody(state, action.bodyId, (body) => ({
        ...body,
        name: action.name,
      }));

    case "edit-body-color":
      return updateBody(state, action.bodyId, (body) => ({
        ...body,
        color: action.color,
      }));

    case "set-body-fixed": {
      const updated = updateBody(state, action.bodyId, (body) => ({
        ...body,
        fixed: action.fixed,
      }));

      return updated === state
        ? state
        : {
            ...updated,
            draftPreferredSimulatedSecondsPerRealSecond: null,
          };
    }

    case "edit-number-raw": {
      const updated = updateBody(state, action.bodyId, (body) =>
        updateNumberRaw(body, action.field, action.rawText)
      );

      return updated === state
        ? state
        : {
            ...updated,
            draftPreferredSimulatedSecondsPerRealSecond: null,
          };
    }

    case "change-mass-unit":
      return updateBody(state, action.bodyId, (body) => ({
        ...body,
        mass: changeDraftNumberUnit(
          body.mass,
          action.unit,
          MASS_DRAFT_UNIT_CONVERTER
        ).field,
      }));

    case "change-distance-unit":
      return updateBody(state, action.bodyId, (body) => {
        if (action.field === "physicalRadius") {
          return {
            ...body,
            physicalRadius: changeDraftNumberUnit(
              body.physicalRadius,
              action.unit,
              DISTANCE_DRAFT_UNIT_CONVERTER
            ).field,
          };
        }

        const axis = action.field.at(-1) as "x" | "y" | "z";

        return {
          ...body,
          initialPosition: {
            ...body.initialPosition,
            [axis]: changeDraftNumberUnit(
              body.initialPosition[axis],
              action.unit,
              DISTANCE_DRAFT_UNIT_CONVERTER
            ).field,
          },
        };
      });

    case "change-speed-unit":
      return updateBody(state, action.bodyId, (body) => {
        const axis = action.field.at(-1) as "x" | "y" | "z";

        return {
          ...body,
          initialVelocity: {
            ...body.initialVelocity,
            [axis]: changeDraftNumberUnit(
              body.initialVelocity[axis],
              action.unit,
              SPEED_DRAFT_UNIT_CONVERTER
            ).field,
          },
        };
      });

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
        draftPreferredSimulatedSecondsPerRealSecond:
          state.activeSession.schedulerConfig
            .simulatedSecondsPerRealSecond,
        selectedDraftBodyId,
      };
    }

    case "preset-draft-loaded": {
      const draft = draftFromApplied(action.scenario);
      const selectedDraftBodyId = draft.bodies.some(
        ({ id }) => id === state.selectedDraftBodyId
      )
        ? state.selectedDraftBodyId
        : draft.bodies[0].id;

      return {
        ...state,
        draft,
        draftPreferredSimulatedSecondsPerRealSecond:
          action.preferredSimulatedSecondsPerRealSecond,
        selectedDraftBodyId,
      };
    }
  }
}
