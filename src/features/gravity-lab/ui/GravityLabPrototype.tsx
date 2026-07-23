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
    telemetry.numericalErrorMessage ??
    telemetry.schedulerMessage;

  return (
    <section
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      aria-labelledby="gravity-prototype-title"
    >
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Prototype technique 1B
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
          échantillonnée dans la boucle puis publiée vers React au plus à{" "}
          {(1 / TELEMETRY_INTERVAL_SECONDS).toFixed(0)} Hz.
        </p>
      </aside>
    </section>
  );
}
