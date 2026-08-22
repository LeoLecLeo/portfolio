"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { GravityCanvas } from "../rendering/GravityCanvas";
import {
  TELEMETRY_INTERVAL_SECONDS,
  type PrototypeTelemetry,
} from "../runtime/GravityPrototypeRuntime";
import {
  GravityLabSessionHost,
  type GravityLabSession,
  type GravityLabSessionRequest,
} from "../runtime/GravityLabSession";
import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_SCHEDULER_CONFIG,
} from "../presets/inclinedBinary";
import { GRAVITY_PRESETS } from "../presets/catalog";
import type { GravityPreset } from "../presets/gravityPreset";
import {
  createGravityLabState,
  gravityLabReducer,
  hasUnappliedScenarioChanges,
  type GravityLabAction,
} from "./gravityLabReducer";
import { MAX_NEWTONIAN_BODIES } from "../core/types";
import { BodyDraftEditor } from "./BodyDraftEditor";
import { GravityModelSelector } from "./GravityModelSelector";
import { ContextualHelp } from "./ContextualHelp";
import {
  applyGravityLabDraft,
  validateGravityLabDraft,
} from "./gravityLabApplication";
import {
  bodyListLabel,
  diagnosticMessageFr,
  gravityIntegratorLabel,
  gravityModelLabel,
} from "./gravityLabPresentation";
import {
  SCENARIO_STATE_HELP,
  SCIENTIFIC_DIAGNOSTIC_HELP,
  SIMULATION_CONTROL_HELP,
} from "./gravityLabHelp";
import { GravityPresetCatalog } from "./GravityPresetCatalog";
import {
  GravityLabWorkspace,
  GravityWorkspaceDiagnostics,
  GravityWorkspaceInspector,
  GravityWorkspaceMain,
} from "./GravityLabWorkspace";
import { preparePresetDraftLoad } from "./presetDraftLoading";
import {
  getGravityLabApplyAvailability,
  getGravityLabHydrationControlInput,
  getGravityLabMainControlState,
  invokeGravityLabMainControl,
} from "./gravityLabMainControls";
import { createGravityLabHostLifecycle } from "./gravityLabLifecycle";
import { MercuryPrecessionDiagnostics } from "./MercuryPrecessionDiagnostics";

const SECONDS_PER_DAY = 86_400;
const subscribeToHydration = () => () => {};
const getHydratedClientSnapshot = () => true;
const getHydratedServerSnapshot = () => false;

function createInitialSessionRequest(): GravityLabSessionRequest {
  return {
    appliedScenario: createInclinedBinaryAppliedScenario(
      INCLINED_BINARY_SCHEDULER_CONFIG
    ),
    schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
  };
}

function formatScientific(value: number, fractionDigits = 5): string {
  return Number.isFinite(value)
    ? value.toExponential(fractionDigits)
    : "indisponible";
}

function formatSimulationTime(timeSeconds: number): string {
  const days = timeSeconds / SECONDS_PER_DAY;
  return `${days.toFixed(3)} j (${formatScientific(timeSeconds, 3)} s)`;
}

function profileLabel(
  profile: PrototypeTelemetry["precisionProfile"]
): string {
  if (profile === null) {
    return "Configuration directe non compilée";
  }

  switch (profile) {
    case "fast":
      return "Rapide";
    case "balanced":
      return "Équilibré";
    case "precise":
      return "Précis";
  }
}

function velocityFrameLabel(
  frame: PrototypeTelemetry["newtonianValidity"]["beta"]["responsible"]["frame"]
): string {
  switch (frame) {
    case "barycentric":
      return "référentiel barycentrique";
    case "scenario":
      return "référentiel du scénario";
    case "relative":
      return "vitesse relative de la paire";
  }
}

function validityLevelLabel(
  level: PrototypeTelemetry["newtonianValidity"]["overallLevel"]
): string {
  switch (level) {
    case "recommended":
      return "Domaine recommandé";
    case "caution":
      return "Prudence";
    case "strong-warning":
      return "Avertissement fort";
    case "hard-error":
      return "Hors domaine";
  }
}

function responsibilityLabel(
  responsible:
    | Readonly<{ kind: "body"; bodyId: string }>
    | Readonly<{
        kind: "pair";
        firstBodyId: string;
        secondBodyId: string;
      }>
): string {
  return responsible.kind === "body"
    ? responsible.bodyId
    : `${responsible.firstBodyId} / ${responsible.secondBodyId}`;
}

function statusLabel(
  status: PrototypeTelemetry["status"],
  modelId: PrototypeTelemetry["modelId"] = "newtonian"
): string {
  switch (status) {
    case "running":
      return "En cours";
    case "paused":
      return "En pause";
    case "collision":
      return "Collision détectée";
    case "unresolved-encounter":
      return "Rencontre non résolue";
    case "newtonian-domain-violation":
      return modelId === "newtonian"
        ? "Domaine newtonien dépassé"
        : "Domaine d’utilisation 1PN dépassé";
    case "error":
      return "Erreur numérique";
  }
}

export type GravityLabPrototypeProps = Readonly<{
  sessionRequest?: GravityLabSessionRequest;
}>;

export function GravityLabPrototype({
  sessionRequest,
}: GravityLabPrototypeProps = {}) {
  const initialExternalRequest = useRef(sessionRequest);
  const previousExternalRequest = useRef(sessionRequest);
  const [host] = useState(
    () =>
      new GravityLabSessionHost(
        sessionRequest ?? createInitialSessionRequest()
      )
  );
  const [hostLifecycle] = useState(() =>
    createGravityLabHostLifecycle(host)
  );
  const [labState, dispatch] = useReducer(
    gravityLabReducer,
    host.snapshot,
    createGravityLabState
  );
  const [renderRevision, setRenderRevision] = useState(0);
  const [trajectoryResetRevision, setTrajectoryResetRevision] = useState(0);
  const [rendererReady, setRendererReady] = useState(false);
  const [applicationFailure, setApplicationFailure] = useState<
    string | null
  >(null);
  const [applicationConfirmation, setApplicationConfirmation] =
    useState<string | null>(null);
  const [presetLoadFailure, setPresetLoadFailure] = useState<
    string | null
  >(null);
  const bodySelectionButtonRefs = useRef(
    new Map<string, HTMLButtonElement>()
  );
  const pendingBodyListFocus = useRef(false);
  const initialRendererStartHandled = useRef(false);
  const telemetry = labState.sessionTelemetry;
  const session = labState.activeSession;
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedClientSnapshot,
    getHydratedServerSnapshot
  );
  const draftValidation = useMemo(
    () =>
      validateGravityLabDraft(
        labState.draft,
        labState.draftPreferredSimulatedSecondsPerRealSecond
      ),
    [
      labState.draft,
      labState.draftPreferredSimulatedSecondsPerRealSecond,
    ]
  );
  const hasUnappliedChanges = useMemo(
    () =>
      hasUnappliedScenarioChanges(
        labState.draft,
        labState.appliedScenario
      ),
    [labState.appliedScenario, labState.draft]
  );
  const hydrationControlInput = getGravityLabHydrationControlInput(
    {
      status: telemetry.status,
      rendererReady,
      hasUnappliedChanges,
      draftIsValid: draftValidation.ok,
    },
    hydrated
  );
  const mainControlState = getGravityLabMainControlState(
    hydrationControlInput
  );
  const applyAvailability = getGravityLabApplyAvailability({
    status: hydrationControlInput.status,
    hasUnappliedChanges,
    draftIsValid: draftValidation.ok,
  });

  useEffect(() => hostLifecycle.activate(), [hostLifecycle]);

  useEffect(() => {
    if (
      sessionRequest === undefined ||
      sessionRequest === previousExternalRequest.current
    ) {
      return;
    }

    previousExternalRequest.current = sessionRequest;
    dispatch({
      type: "session-replaced",
      snapshot: host.replace(sessionRequest),
    });
    setApplicationFailure(null);
    setApplicationConfirmation(null);
    setPresetLoadFailure(null);
    setRenderRevision((current) => current + 1);
  }, [host, sessionRequest]);

  const publishTelemetry = useCallback(
    (source: GravityLabSession, next: PrototypeTelemetry) => {
      const published = host.publishTelemetry(source, next);

      if (published !== null) {
        dispatch({
          type: "session-updated",
          snapshot: published,
        });
      }
    },
    [host]
  );

  const startWhenRendererIsReady = useCallback(() => {
    if (initialRendererStartHandled.current) {
      setRendererReady(true);
      return;
    }

    initialRendererStartHandled.current = true;

    if (
      initialExternalRequest.current === sessionRequest &&
      host.snapshot.revision === 0
    ) {
      dispatch({
        type: "session-updated",
        snapshot: host.resume(),
      });
    }

    setRendererReady(true);
  }, [host, sessionRequest]);

  const pause = useCallback(() => {
    dispatch({
      type: "session-updated",
      snapshot: host.pause(),
    });
    setRenderRevision((current) => current + 1);
  }, [host]);

  const resume = useCallback(() => {
    dispatch({
      type: "session-updated",
      snapshot: host.resume(),
    });
    setRenderRevision((current) => current + 1);
  }, [host]);

  const reset = useCallback(() => {
    dispatch({
      type: "session-updated",
      snapshot: host.reset(),
    });
    setRenderRevision((current) => current + 1);
    setTrajectoryResetRevision((current) => current + 1);
  }, [host]);

  const updateDraft = useCallback((action: GravityLabAction) => {
    setApplicationFailure(null);
    setApplicationConfirmation(null);
    setPresetLoadFailure(null);
    dispatch(action);
  }, []);

  const addBody = useCallback(() => {
    if (labState.draft.bodies.length >= MAX_NEWTONIAN_BODIES) {
      return;
    }

    pendingBodyListFocus.current = true;
    updateDraft({ type: "add-body" });
  }, [labState.draft.bodies.length, updateDraft]);

  const removeBody = useCallback(
    (bodyId: string) => {
      if (
        labState.draft.bodies.length <= 1 ||
        !labState.draft.bodies.some(({ id }) => id === bodyId)
      ) {
        return;
      }

      pendingBodyListFocus.current = true;
      updateDraft({ type: "remove-body", bodyId });
    },
    [labState.draft.bodies, updateDraft]
  );

  const cancelDraft = useCallback(() => {
    dispatch({ type: "cancel-draft" });
    setApplicationFailure(null);
    setApplicationConfirmation(null);
    setPresetLoadFailure(null);
  }, []);

  const loadPresetIntoDraft = useCallback(
    (preset: GravityPreset) => {
      const result = preparePresetDraftLoad(
        preset,
        hasUnappliedChanges,
        () =>
          window.confirm(
            "Le brouillon contient des modifications non appliquées. Les remplacer par ce preset ?"
          )
      );

      if (result.kind === "cancelled") {
        return;
      }

      if (result.kind === "failed") {
        setPresetLoadFailure(result.message);
        return;
      }

      updateDraft(result.action);
    },
    [hasUnappliedChanges, updateDraft]
  );

  const selectSessionBody = useCallback(
    (sourceSession: GravityLabSession, bodyId: string) => {
      dispatch({
        type: "select-session-body",
        sourceSession,
        bodyId,
      });
    },
    []
  );

  useEffect(() => {
    if (!pendingBodyListFocus.current) {
      return;
    }

    const target = bodySelectionButtonRefs.current.get(
      labState.selectedDraftBodyId
    );

    if (target !== undefined) {
      target.focus();
      pendingBodyListFocus.current = false;
    }
  }, [labState.draft.bodies, labState.selectedDraftBodyId]);

  const applyDraft = useCallback(() => {
    const result = applyGravityLabDraft(labState, host);

    if (!result.ok) {
      setApplicationFailure(
        result.message ??
          "Le brouillon contient des erreurs et n’a pas été appliqué."
      );
      return;
    }

    dispatch(result.action);
    setApplicationFailure(null);
    setPresetLoadFailure(null);
    setApplicationConfirmation(
      "Scénario appliqué : une nouvelle session a été créée à t = 0 et mise en pause."
    );
    setRenderRevision((current) => current + 1);
  }, [host, labState]);
  const mainControlHandlers = {
    resume,
    pause,
    apply: applyDraft,
  };

  const notice =
    telemetry.collisionMessage ??
    telemetry.unresolvedEncounterMessage ??
    telemetry.newtonianDomainMessage ??
    telemetry.numericalErrorMessage ??
    telemetry.schedulerMessage;
  const validity =
    telemetry.rejectedNewtonianValidity ?? telemetry.newtonianValidity;
  const precessionMeasurement =
    session.runtime.comparisonPrecessionMeasurement();
  const unknownSelfCompactness =
    validity.unknownSelfCompactnessBodyIds.length === 0
      ? null
      : `inconnue pour ${validity.unknownSelfCompactnessBodyIds.join(", ")}`;

  return (
    <section
      className="min-w-0 space-y-5"
      aria-labelledby="gravity-prototype-title"
    >
      <header className="flex flex-col gap-4 border-b border-border/45 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Laboratoire gravitationnel · N-corps 3D
          </p>
          <h2
            id="gravity-prototype-title"
            className="mt-1 text-2xl font-semibold tracking-[-0.02em]"
          >
            Session de simulation
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            La scène montre le scénario appliqué ; les paramètres se
            préparent séparément dans le brouillon.
          </p>
          <ContextualHelp
            summary="Comprendre les trois états"
            items={SCENARIO_STATE_HELP}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs sm:justify-end">
          <span className="rounded-full border border-border/60 bg-card/45 px-3 py-1.5 font-medium text-muted-foreground">
            Scénario simulé · {session.bodies.length} corps
          </span>
          <span className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 font-medium text-primary/90">
            {gravityModelLabel(telemetry.modelId)} ·{" "}
            {gravityIntegratorLabel(telemetry.integratorId)}
          </span>
          <span
            id="draft-state-message"
            role="status"
            aria-atomic="true"
            className={
              hasUnappliedChanges
                ? "rounded-full border border-amber-400/35 bg-amber-400/8 px-3 py-1.5 font-medium text-amber-700 dark:text-amber-300"
                : "rounded-full border border-emerald-500/30 bg-emerald-500/8 px-3 py-1.5 font-medium text-emerald-700 dark:text-emerald-300"
            }
          >
            {hasUnappliedChanges
              ? "Brouillon · modifications non appliquées"
              : "Brouillon · synchronisé"}
          </span>
        </div>
      </header>

      <section
        aria-labelledby="gravity-simulation-controls-title"
        className="min-w-0 overflow-hidden rounded-xl border border-border/55 bg-card/45 p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.035)_inset]"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p
              id="gravity-simulation-controls-title"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80"
            >
              Simulation
            </p>
            <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
              className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span
                className={`size-2 rounded-full ${mainControlState.mode === "Lecture" ? "bg-emerald-400" : "bg-muted-foreground/55"}`}
                aria-hidden="true"
              />
            État courant :{" "}
            <strong className="text-foreground">
              {mainControlState.mode}
            </strong>
            {telemetry.status === "running" ||
            telemetry.status === "paused"
              ? null
              : ` · ${statusLabel(telemetry.status, telemetry.modelId)}`}
            </p>
            <p
              id="apply-availability-message"
              className={
                applyAvailability.tone === "blocked"
                  ? "mt-1 text-xs text-amber-700 dark:text-amber-300"
                  : "mt-1 text-xs text-muted-foreground"
              }
            >
              {applyAvailability.message}
            </p>
          </div>
          <div
            role="group"
            aria-label="Contrôles principaux de la simulation"
            className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end"
          >
            <button
              type="button"
              aria-label="Démarrer ou reprendre la simulation"
              onClick={() =>
                invokeGravityLabMainControl("resume", mainControlHandlers)
              }
              disabled={mainControlState.resumeDisabled}
              className="min-w-0 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_8px_22px_-12px_color-mix(in_oklab,var(--primary)_65%,transparent)] transition-[background-color,opacity,transform] hover:bg-primary/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none motion-reduce:transition-none"
            >
              <span aria-hidden="true">▶ </span>
              Lecture
            </button>
            <button
              type="button"
              aria-label="Mettre la simulation en pause"
              onClick={() =>
                invokeGravityLabMainControl("pause", mainControlHandlers)
              }
              disabled={mainControlState.pauseDisabled}
              className="min-w-0 rounded-md border border-border/65 bg-secondary/55 px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
            >
              <span aria-hidden="true">■ </span>
              Stop
            </button>
            <button
              type="button"
              aria-describedby="apply-availability-message draft-state-message"
              onClick={() =>
                invokeGravityLabMainControl("apply", mainControlHandlers)
              }
              disabled={mainControlState.applyDisabled}
              className="col-span-2 min-w-0 break-words rounded-md border border-primary/55 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/80 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border/45 disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-50 sm:whitespace-nowrap motion-reduce:transition-none"
            >
              Appliquer et réinitialiser
            </button>
            <button
              type="button"
              aria-label="Réinitialiser l’état physique du scénario appliqué"
              onClick={reset}
              className="col-span-2 min-w-0 rounded-md border border-transparent bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border/60 hover:bg-secondary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:col-span-1 motion-reduce:transition-none"
            >
              Reset physique
            </button>
          </div>
        </div>
        {applicationFailure === null ? null : (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {applicationFailure}
          </p>
        )}
        {applicationConfirmation === null ? null : (
          <p
            role="status"
            aria-live="polite"
            className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
          >
            {applicationConfirmation}
          </p>
        )}
        <ContextualHelp
          summary="Comprendre les commandes"
          items={SIMULATION_CONTROL_HELP}
        />
      </section>

      <GravityLabWorkspace>
        <GravityWorkspaceInspector
          side="left"
          eyebrow="Bibliothèque"
          title="Scénarios / presets"
        >
          {() => (
            <>
              <GravityPresetCatalog
                presets={GRAVITY_PRESETS}
                onLoad={loadPresetIntoDraft}
              />
              {presetLoadFailure === null ? null : (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  {presetLoadFailure}
                </p>
              )}
            </>
          )}
        </GravityWorkspaceInspector>

        <GravityWorkspaceMain>
          <GravityCanvas
            session={session}
            selectedBodyId={labState.selectedSessionBodyId}
            onSelectBody={selectSessionBody}
            onTelemetry={publishTelemetry}
            onReady={startWhenRendererIsReady}
            renderRevision={renderRevision}
            trajectoryResetRevision={trajectoryResetRevision}
          />
        </GravityWorkspaceMain>

        <GravityWorkspaceInspector
          side="right"
          eyebrow="Inspecteur"
          title="Corps et paramètres"
        >
          {() => (
            <>
            <div className="grid min-w-0 grid-cols-2 gap-3 border-b border-border/55 pb-3 text-xs">
              <div className="min-w-0">
                <span className="block text-muted-foreground">
                  Scénario actif
                </span>
                <strong className="mt-0.5 block truncate text-foreground">
                  {session.bodies.length} corps simulés
                </strong>
                <span className="mt-0.5 block text-[0.6875rem] text-primary/80">
                  {gravityModelLabel(telemetry.modelId)} ·{" "}
                  {gravityIntegratorLabel(telemetry.integratorId)}
                </span>
              </div>
              <div className="min-w-0 text-right">
                <span className="block text-muted-foreground">
                  Brouillon
                </span>
                <strong
                  className={
                    hasUnappliedChanges
                      ? "mt-0.5 block text-amber-700 dark:text-amber-300"
                      : "mt-0.5 block text-emerald-700 dark:text-emerald-300"
                  }
                >
                  {hasUnappliedChanges ? "Non appliqué" : "Synchronisé"}
                </strong>
              </div>
            </div>
            <div className="mt-3">
              <GravityModelSelector
                modelId={labState.draft.modelId}
                onChange={(modelId) =>
                  updateDraft({ type: "set-gravity-model", modelId })
                }
              />
            </div>
            <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Corps du brouillon
            </p>
            <span className="text-xs text-muted-foreground">
              {labState.draft.bodies.length}/{MAX_NEWTONIAN_BODIES}
            </span>
          </div>
          <ul
            aria-label="Corps du brouillon"
                    className="gravity-lab-scrollbar mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1"
          >
            {labState.draft.bodies.map((body) => {
              const selected =
                body.id === labState.selectedDraftBodyId;
              const label = bodyListLabel(body);

              return (
                <li
                  key={body.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
                >
                  <button
                    ref={(element) => {
                      if (element === null) {
                        bodySelectionButtonRefs.current.delete(body.id);
                      } else {
                        bodySelectionButtonRefs.current.set(body.id, element);
                      }
                    }}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      dispatch({
                        type: "select-draft-body",
                        bodyId: body.id,
                      })
                    }
                    className={
                      selected
                        ? "truncate rounded-md border-l-2 border-primary bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        : "truncate rounded-md border-l-2 border-transparent bg-secondary/25 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
                    }
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer ${label}`}
                    disabled={labState.draft.bodies.length === 1}
                    onClick={() => removeBody(body.id)}
                    className="rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={addBody}
              disabled={
                labState.draft.bodies.length >= MAX_NEWTONIAN_BODIES
              }
              className="rounded-md border border-border/60 bg-secondary/45 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
            >
              Ajouter un corps
            </button>
            <button
              type="button"
              onClick={cancelDraft}
              disabled={!hasUnappliedChanges}
              className="rounded-md border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border/60 hover:bg-secondary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
            >
              Annuler les modifications
            </button>
          </div>
          {draftValidation.report.errors.length > 0 ? (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-destructive/60 bg-destructive/10 p-3"
            >
              <p className="text-xs font-semibold text-destructive">
                {draftValidation.report.errors.length} erreur
                {draftValidation.report.errors.length > 1 ? "s" : ""}{" "}
                empêche
                {draftValidation.report.errors.length > 1
                  ? "nt"
                  : ""}{" "}
                l’application.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-destructive">
                {draftValidation.report.errors.map((error, index) => (
                  <li key={`${error.code}-${error.path}-${index}`}>
                    {diagnosticMessageFr(error)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p
            aria-live="polite"
            aria-atomic="true"
            className="mt-2 text-xs text-muted-foreground"
          >
            Corps affiché sélectionné :{" "}
            <strong className="text-foreground">
              {session.bodies.find(
                ({ bodyId }) =>
                  bodyId === labState.selectedSessionBodyId
              )?.name ?? labState.selectedSessionBodyId}
            </strong>
          </p>
        </div>

        <BodyDraftEditor
          draft={labState.draft}
          validationReport={draftValidation.report}
          selectedBodyId={labState.selectedDraftBodyId}
          dispatch={updateDraft}
        />
            </>
          )}
        </GravityWorkspaceInspector>

        <GravityWorkspaceDiagnostics>
          <details className="group min-w-0 overflow-hidden rounded-xl border border-border/55 bg-card/35 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
            <summary className="cursor-pointer list-none rounded-xl p-4 transition-colors hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
                    Diagnostics scientifiques
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {statusLabel(telemetry.status, telemetry.modelId)} ·{" "}
                    {validityLevelLabel(validity.overallLevel)}
                  </span>
                  {notice === null || notice === undefined ? null : (
                    <span className="mt-1 block text-xs text-destructive">
                      {notice}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="text-lg text-muted-foreground transition-transform group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </span>
            </summary>
            <div className="space-y-5 border-t border-border/50 p-4 sm:p-5">
        <ContextualHelp
          summary="Comprendre les diagnostics"
          items={SCIENTIFIC_DIAGNOSTIC_HELP}
        />
        <div className="grid min-w-0 gap-x-8 gap-y-6 md:grid-cols-2">
          <section className="min-w-0 border-l-2 border-primary/25 py-0.5 pl-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/75">
              État de la simulation
            </h4>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">État</dt>
                <dd className="text-right font-medium">
                  {statusLabel(telemetry.status, telemetry.modelId)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Temps simulé</dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {formatSimulationTime(telemetry.timeSeconds)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Profil</dt>
                <dd className="text-right font-medium">
                  {profileLabel(telemetry.precisionProfile)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Modèle</dt>
                <dd className="text-right font-medium">
                  {gravityModelLabel(telemetry.modelId)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Intégrateur</dt>
                <dd className="text-right font-medium">
                  {gravityIntegratorLabel(telemetry.integratorId)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="min-w-0 border-l-2 border-chart-2/25 py-0.5 pl-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-chart-2/85">
              Conservation
            </h4>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Énergie totale</dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {telemetry.modelId === "first-post-newtonian"
                    ? "non suivie — invariant 1PN non spécifié"
                    : `${formatScientific(telemetry.totalEnergyJ)} J`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Dérive énergétique relative
                </dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {telemetry.modelId === "first-post-newtonian"
                    ? "non utilisée avec le modèle 1PN"
                    : telemetry.relativeEnergyDrift === null
                      ? "indéfinie (E₀ = 0)"
                      : formatScientific(telemetry.relativeEnergyDrift, 3)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Norme du moment cinétique
                </dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {telemetry.modelId === "first-post-newtonian" ? (
                    "Non suivi — invariant 1PN non spécifié"
                  ) : (
                    <>
                      {formatScientific(
                        telemetry.angularMomentumNormKgM2ps
                      )}{" "}
                      kg·m²·s⁻¹
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="min-w-0 border-l-2 border-chart-3/25 py-0.5 pl-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-chart-3/85">
              Intégration
            </h4>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Pas physique fixe</dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {formatScientific(telemetry.timeStepSeconds, 6)} s
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pas recommandé</dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {telemetry.recommendedTimeStepSeconds === null
                    ? telemetry.precisionProfile === null
                      ? "non disponible — configuration directe"
                      : "non contraint — plafond explicite"
                    : `${formatScientific(
                        telemetry.recommendedTimeStepSeconds,
                        6
                      )} s`}
                </dd>
              </div>
              {telemetry.timeStepBudgetAssessment.exceedsBudget ? (
                <div>
                  <dt className="text-destructive">Budget de sous-pas</dt>
                  <dd className="mt-0.5 text-xs text-destructive">
                    {
                      telemetry.timeStepBudgetAssessment
                        .requiredSubStepsAtMaximumFrame
                    }{" "}
                    sous-pas seraient requis au delta maximal ; le pas n’a pas
                    été agrandi.
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {precessionMeasurement === null ? null : (
            <MercuryPrecessionDiagnostics
              measurement={precessionMeasurement}
            />
          )}

          <section className="min-w-0 border-l-2 border-primary/20 py-0.5 pl-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/75">
              Validité du modèle
            </h4>
            {telemetry.rejectedNewtonianValidity !== null ? (
              <p className="mt-2 text-xs text-destructive">
                Mesures du candidat rejeté ; la scène conserve le dernier état
                valide.
              </p>
            ) : null}
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">
                  β maximal · {responsibilityLabel(validity.beta.responsible)}
                </dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {formatScientific(validity.beta.value, 6)}
                  {" · "}
                  {velocityFrameLabel(validity.beta.responsible.frame)}
                  {validity.hasExternalConstraint
                    ? " · contrainte externe présente"
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  χ paire
                  {validity.chiPair === null
                    ? ""
                    : ` · ${responsibilityLabel(
                        validity.chiPair.responsible
                      )}`}
                </dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {validity.chiPair === null
                    ? "sans paire"
                    : formatScientific(validity.chiPair.value, 6)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  χ propre
                  {validity.chiSelf === null
                    ? ""
                    : ` · ${responsibilityLabel(
                        validity.chiSelf.responsible
                      )}`}
                </dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {validity.chiSelf === null
                    ? unknownSelfCompactness ?? "sans valeur connue"
                    : `${formatScientific(validity.chiSelf.value, 6)}${
                        unknownSelfCompactness === null
                          ? ""
                          : ` · ${unknownSelfCompactness}`
                      }`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  ψ local · {responsibilityLabel(validity.psi.responsible)}
                </dt>
                <dd className="mt-0.5 break-all font-mono text-[0.8125rem] tabular-nums text-foreground/90">
                  {formatScientific(validity.psi.value, 6)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Synthèse</dt>
                <dd className="text-right font-medium">
                  {validityLevelLabel(validity.overallLevel)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Les seuils β sont une politique pédagogique fondée sur l’ordre
              attendu des corrections en β², et non une garantie universelle
              d’erreur.
            </p>
          </section>
        </div>

        <div
          aria-live="polite"
          className={
            notice
              ? "rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm"
              : "rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground"
          }
        >
          {notice ??
            "Aucun arrêt de sûreté. Le moteur ne fusionne pas les corps et n’applique aucun adoucissement gravitationnel."}
        </div>

        <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
          Calculs internes en unités SI. Le mode de taille visuelle des astres
          ne sert jamais à la détection physique. La télémétrie est
          échantillonnée dans la boucle avec une publication périodique à{" "}
          {(1 / TELEMETRY_INTERVAL_SECONDS).toFixed(0)} Hz, complétée par les
          actions et arrêts urgents.
        </p>
            </div>
          </details>
        </GravityWorkspaceDiagnostics>
      </GravityLabWorkspace>
    </section>
  );
}
