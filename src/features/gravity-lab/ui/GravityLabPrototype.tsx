"use client";

import { useCallback, useEffect, useState } from "react";

import { GravityCanvas } from "../rendering/GravityCanvas";
import {
  GravityPrototypeRuntime,
  TELEMETRY_INTERVAL_SECONDS,
  type PrototypeTelemetry,
} from "../runtime/GravityPrototypeRuntime";

const SECONDS_PER_DAY = 86_400;

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

export function GravityLabPrototype() {
  const [runtime] = useState(() => new GravityPrototypeRuntime());
  const [telemetry, setTelemetry] = useState<PrototypeTelemetry>(() =>
    runtime.telemetry()
  );
  const [renderRevision, setRenderRevision] = useState(0);
  const [rendererReady, setRendererReady] = useState(false);

  useEffect(() => {
    if (!rendererReady) {
      return;
    }

    runtime.resume();

    return () => {
      runtime.pause();
    };
  }, [rendererReady, runtime]);

  const publishTelemetry = useCallback((next: PrototypeTelemetry) => {
    setTelemetry(next);
  }, []);

  const startWhenRendererIsReady = useCallback(() => {
    runtime.resume();
    setTelemetry(runtime.telemetry());
    setRendererReady(true);
  }, [runtime]);

  const pause = useCallback(() => {
    runtime.pause();
    setTelemetry(runtime.telemetry());
    setRenderRevision((current) => current + 1);
  }, [runtime]);

  const resume = useCallback(() => {
    runtime.resume();
    setTelemetry(runtime.telemetry());
    setRenderRevision((current) => current + 1);
  }, [runtime]);

  const reset = useCallback(() => {
    runtime.reset();
    setTelemetry(runtime.telemetry());
    setRenderRevision((current) => current + 1);
  }, [runtime]);

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
              Prototype scientifique 2A
            </p>
            <h2
              id="gravity-prototype-title"
              className="mt-1 text-2xl font-semibold tracking-tight"
            >
              Système binaire incliné
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Caméra fixe · anneau = barycentre
          </p>
        </div>

        <GravityCanvas
          runtime={runtime}
          onTelemetry={publishTelemetry}
          onReady={startWhenRendererIsReady}
          renderRevision={renderRevision}
        />
      </div>

      <aside className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card/70 p-5 shadow-xl shadow-black/10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Commandes
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={pause}
              disabled={telemetry.status !== "running"}
              className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              Pause
            </button>
            <button
              type="button"
              onClick={resume}
              disabled={!rendererReady || telemetry.status !== "paused"}
              className="rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Reprendre
            </button>
            <button
              type="button"
              onClick={reset}
              className="col-span-2 rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
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
