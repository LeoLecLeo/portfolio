"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
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
import {
  applyGravityLabDraft,
  validateGravityLabDraft,
} from "./gravityLabApplication";
import {
  bodyListLabel,
  diagnosticMessageFr,
} from "./gravityLabPresentation";
import { GravityPresetCatalog } from "./GravityPresetCatalog";
import { preparePresetDraftLoad } from "./presetDraftLoading";
import {
  getGravityLabMainControlState,
  invokeGravityLabMainControl,
} from "./gravityLabMainControls";

const SECONDS_PER_DAY = 86_400;

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

function statusLabel(status: PrototypeTelemetry["status"]): string {
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
      return "Domaine newtonien dépassé";
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
  const [labState, dispatch] = useReducer(
    gravityLabReducer,
    host.snapshot,
    createGravityLabState
  );
  const [renderRevision, setRenderRevision] = useState(0);
  const [rendererReady, setRendererReady] = useState(false);
  const [applicationFailure, setApplicationFailure] = useState<
    string | null
  >(null);
  const [applicationConfirmation, setApplicationConfirmation] =
    useState<string | null>(null);
  const [presetLoadFailure, setPresetLoadFailure] = useState<
    string | null
  >(null);
  const initialRendererStartHandled = useRef(false);
  const telemetry = labState.sessionTelemetry;
  const session = labState.activeSession;
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
  const mainControlState = getGravityLabMainControlState({
    status: telemetry.status,
    rendererReady,
    hasUnappliedChanges,
    draftIsValid: draftValidation.ok,
  });

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
    setRendererReady(true);

    if (initialRendererStartHandled.current) {
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
  }, [host]);

  const updateDraft = useCallback((action: GravityLabAction) => {
    setApplicationFailure(null);
    setApplicationConfirmation(null);
    setPresetLoadFailure(null);
    dispatch(action);
  }, []);

  const addBody = useCallback(() => {
    updateDraft({ type: "add-body" });
  }, [updateDraft]);

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
  const unknownSelfCompactness =
    validity.unknownSelfCompactnessBodyIds.length === 0
      ? null
      : `inconnue pour ${validity.unknownSelfCompactnessBodyIds.join(", ")}`;

  return (
    <section
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      aria-labelledby="gravity-prototype-title"
    >
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Laboratoire newtonien · phase 2C
            </p>
            <h2
              id="gravity-prototype-title"
              className="mt-1 text-2xl font-semibold tracking-tight"
            >
              Simulation active
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Caméra orbitale · anneau = barycentre
          </p>
        </div>

        <div
          role="group"
          aria-label="Contrôles principaux de la simulation"
          className="mb-4 flex flex-col gap-3 rounded-xl border border-border/80 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            État courant :{" "}
            <strong className="text-foreground">
              {mainControlState.mode}
            </strong>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              type="button"
              aria-label="Démarrer ou reprendre la simulation"
              onClick={() =>
                invokeGravityLabMainControl("resume", mainControlHandlers)
              }
              disabled={mainControlState.resumeDisabled}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
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
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span aria-hidden="true">■ </span>
              Stop
            </button>
            <button
              type="button"
              aria-describedby="draft-state-message"
              onClick={() =>
                invokeGravityLabMainControl("apply", mainControlHandlers)
              }
              disabled={mainControlState.applyDisabled}
              className="col-span-2 whitespace-nowrap rounded-lg border border-primary bg-background px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Appliquer et réinitialiser
            </button>
          </div>
        </div>

        <GravityCanvas
          session={session}
          selectedBodyId={labState.selectedSessionBodyId}
          onSelectBody={selectSessionBody}
          onTelemetry={publishTelemetry}
          onReady={startWhenRendererIsReady}
          renderRevision={renderRevision}
        />
      </div>

      <aside className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card/70 p-5 shadow-xl shadow-black/10">
        <GravityPresetCatalog
          presets={GRAVITY_PRESETS}
          onLoad={loadPresetIntoDraft}
        />
        {presetLoadFailure === null ? null : (
          <p
            role="alert"
            className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {presetLoadFailure}
          </p>
        )}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Corps du brouillon
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                id="draft-state-message"
                role="status"
                className={
                  hasUnappliedChanges
                    ? "rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
                    : "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                }
              >
                {hasUnappliedChanges
                  ? "Modifications non appliquées"
                  : "Synchronisé avec le scénario appliqué"}
              </span>
              <span className="text-xs text-muted-foreground">
                {labState.draft.bodies.length}/{MAX_NEWTONIAN_BODIES}
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {hasUnappliedChanges
              ? "La simulation active utilise encore le dernier scénario appliqué."
              : "Les valeurs éditées correspondent au scénario de la session active."}
          </p>
          <ul
            aria-label="Corps du brouillon"
            className="mt-3 max-h-48 space-y-2 overflow-y-auto"
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
                        ? "truncate rounded-lg border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                        : "truncate rounded-lg border border-border bg-secondary/50 px-3 py-2 text-left text-sm hover:bg-secondary"
                    }
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer ${label}`}
                    disabled={labState.draft.bodies.length === 1}
                    onClick={() =>
                      updateDraft({
                        type: "remove-body",
                        bodyId: body.id,
                      })
                    }
                    className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
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
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              Ajouter un corps
            </button>
            <button
              type="button"
              onClick={cancelDraft}
              disabled={!hasUnappliedChanges}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45"
            >
              Annuler les modifications
            </button>
          </div>
          {hasUnappliedChanges &&
          draftValidation.ok &&
          telemetry.status === "running" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Mettez la simulation en pause avant d’appliquer les
              modifications.
            </p>
          ) : null}
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
          {applicationFailure === null ? null : (
            <p
              role="alert"
              className="mt-3 text-xs text-destructive"
            >
              {applicationFailure}
            </p>
          )}
          {applicationConfirmation === null ? null : (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300"
            >
              {applicationConfirmation}
            </p>
          )}
          <p
            aria-live="polite"
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

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Réinitialisation
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
            >
              Réinitialiser en pause
            </button>
          </div>
        </div>

        <div className="border-t border-border/80 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Diagnostics newtoniens
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">État</dt>
              <dd className="text-right font-medium">
                {statusLabel(telemetry.status)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Temps simulé</dt>
              <dd className="mt-0.5 break-all font-mono text-xs">
                {formatSimulationTime(telemetry.timeSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Énergie totale</dt>
              <dd className="mt-0.5 break-all font-mono text-xs">
                {formatScientific(telemetry.totalEnergyJ)} J
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Dérive énergétique relative
              </dt>
              <dd className="mt-0.5 break-all font-mono text-xs">
                {telemetry.relativeEnergyDrift === null
                  ? "indéfinie (E₀ = 0)"
                  : formatScientific(telemetry.relativeEnergyDrift, 3)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Norme du moment cinétique
              </dt>
              <dd className="mt-0.5 break-all font-mono text-xs">
                {formatScientific(
                  telemetry.angularMomentumNormKgM2ps
                )}{" "}
                kg·m²·s⁻¹
              </dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-border/80 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Validité du modèle
          </p>
          {telemetry.rejectedNewtonianValidity !== null ? (
            <p className="mt-2 text-xs text-destructive">
              Mesures du candidat rejeté ; la scène conserve le dernier état
              valide.
            </p>
          ) : null}
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">Profil</dt>
              <dd className="text-right font-medium">
                {profileLabel(telemetry.precisionProfile)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pas physique fixe</dt>
              <dd className="mt-0.5 break-all font-mono text-xs">
                {formatScientific(telemetry.timeStepSeconds, 6)} s
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pas recommandé</dt>
              <dd className="mt-0.5 break-all font-mono text-xs">
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
            <div>
              <dt className="text-muted-foreground">
                β maximal ·{" "}
                {responsibilityLabel(validity.beta.responsible)}
              </dt>
              <dd className="mt-0.5 break-all font-mono text-xs">
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
              <dd className="mt-0.5 break-all font-mono text-xs">
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
              <dd className="mt-0.5 break-all font-mono text-xs">
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
              <dd className="mt-0.5 break-all font-mono text-xs">
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
          Calculs internes en unités SI. Les sphères sont volontairement
          agrandies pour rester visibles&nbsp;: leurs rayons graphiques ne
          servent jamais à la détection physique. La télémétrie est
          échantillonnée dans la boucle avec une publication périodique à{" "}
          {(1 / TELEMETRY_INTERVAL_SECONDS).toFixed(0)} Hz, complétée par les
          actions et arrêts urgents.
        </p>
      </aside>
    </section>
  );
}
