import type { PublicMercuryPrecessionMeasurement } from "../experiments/publicMercuryPrecessionMeasurement";
import { ContextualHelp } from "./ContextualHelp";
import { MERCURY_PRECESSION_HELP } from "./gravityLabHelp";

function formatArcseconds(value: number, fractionDigits: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString("fr-FR", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      })
    : "indisponible";
}

export function MercuryPrecessionDiagnostics({
  measurement,
}: Readonly<{
  measurement: PublicMercuryPrecessionMeasurement;
}>) {
  return (
    <section className="min-w-0 border-l-2 border-fuchsia-400/35 py-0.5 pl-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-600/90 dark:text-fuchsia-300/90">
        Précession relativiste
      </h4>

      {measurement.kind === "collecting" ? (
        <div className="mt-3 space-y-2 text-sm">
          <p className="font-medium">
            Mesure en cours — plusieurs périhélies nécessaires
          </p>
          <p className="text-xs text-muted-foreground">
            Passages détectés : 1PN {measurement.firstPostNewtonianEventCount}/
            {measurement.minimumEventCount} · Newtonien {measurement.newtonianEventCount}/
            {measurement.minimumEventCount}
          </p>
          <p className="text-xs text-muted-foreground">
            Référence : ≈ {formatArcseconds(
              measurement.referenceArcsecondsPerCentury,
              2
            )}″/siècle
          </p>
        </div>
      ) : measurement.kind === "ready" ? (
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-foreground">
              Mesurée · 1PN − Newtonien
            </dt>
            <dd className="mt-0.5 break-words font-mono text-[0.8125rem] tabular-nums text-foreground/90">
              {formatArcseconds(
                measurement.differential.arcsecondsPerOrbit,
                6
              )}″/orbite · {formatArcseconds(
                measurement.differential.arcsecondsPerCentury,
                3
              )}″/siècle
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Précession 1PN brute</dt>
            <dd className="mt-0.5 font-mono text-[0.8125rem] tabular-nums">
              {formatArcseconds(
                measurement.firstPostNewtonian.arcsecondsPerCentury,
                3
              )}″/siècle
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Résidu Newtonien</dt>
            <dd className="mt-0.5 font-mono text-[0.8125rem] tabular-nums">
              {formatArcseconds(
                measurement.newtonian.arcsecondsPerCentury,
                3
              )}″/siècle
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Référence analytique</dt>
            <dd className="mt-0.5 font-mono text-[0.8125rem] tabular-nums">
              ≈ {formatArcseconds(
                measurement.referenceArcsecondsPerCentury,
                2
              )}″/siècle
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Écart à la référence</dt>
            <dd className="mt-0.5 font-mono text-[0.8125rem] tabular-nums">
              {formatArcseconds(
                measurement.differenceFromReferenceArcsecondsPerCentury,
                3
              )}″/siècle
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {measurement.reason === "scenario-not-validated"
            ? "Référence analytique indisponible : les conditions initiales ne correspondent plus à l’expérience Soleil–Mercure validée."
            : "Mesure indisponible après une erreur de détection ; aucune valeur n’est publiée."}
        </p>
      )}

      <ContextualHelp
        summary="Comprendre la mesure"
        description={MERCURY_PRECESSION_HELP}
      />
    </section>
  );
}
