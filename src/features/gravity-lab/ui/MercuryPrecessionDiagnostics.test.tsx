import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PublicMercuryPrecessionMeasurement } from "../experiments/publicMercuryPrecessionMeasurement";
import { MercuryPrecessionDiagnostics } from "./MercuryPrecessionDiagnostics";

describe("MercuryPrecessionDiagnostics", () => {
  it("shows progress without publishing a premature measured value", () => {
    const measurement: PublicMercuryPrecessionMeasurement = {
      kind: "collecting",
      minimumEventCount: 5,
      firstPostNewtonianEventCount: 2,
      newtonianEventCount: 2,
      referenceArcsecondsPerOrbit: 0.1035,
      referenceArcsecondsPerCentury: 42.98,
    };
    const markup = renderToStaticMarkup(
      <MercuryPrecessionDiagnostics measurement={measurement} />
    );

    expect(markup).toContain("Mesure en cours");
    expect(markup).toContain("1PN 2/5");
    expect(markup).toContain("Newtonien 2/5");
    expect(markup).not.toContain("Mesurée · 1PN − Newtonien");
  });

  it("presents the differential as the principal result with both branch values", () => {
    const measurement: PublicMercuryPrecessionMeasurement = {
      kind: "ready",
      minimumEventCount: 5,
      firstPostNewtonianEventCount: 5,
      newtonianEventCount: 5,
      firstPostNewtonian: {
        radiansPerOrbit: 5e-7,
        arcsecondsPerOrbit: 0.1036,
        arcsecondsPerCentury: 43.01,
      },
      newtonian: {
        radiansPerOrbit: 1e-10,
        arcsecondsPerOrbit: 0.00002,
        arcsecondsPerCentury: 0.01,
      },
      differential: {
        radiansPerOrbit: 4.999e-7,
        arcsecondsPerOrbit: 0.10358,
        arcsecondsPerCentury: 43,
      },
      referenceArcsecondsPerOrbit: 0.10353,
      referenceArcsecondsPerCentury: 42.98,
      differenceFromReferenceArcsecondsPerCentury: 0.02,
    };
    const markup = renderToStaticMarkup(
      <MercuryPrecessionDiagnostics measurement={measurement} />
    );

    expect(markup).toContain("Mesurée · 1PN − Newtonien");
    expect(markup).toContain("Précession 1PN brute");
    expect(markup).toContain("Résidu Newtonien");
    expect(markup).toContain("Référence analytique");
    expect(markup).toContain("Écart à la référence");
    expect(markup).toContain("RK4");
  });

  it("does not display the Mercury reference for changed initial conditions", () => {
    const measurement: PublicMercuryPrecessionMeasurement = {
      kind: "unavailable",
      reason: "scenario-not-validated",
    };
    const markup = renderToStaticMarkup(
      <MercuryPrecessionDiagnostics measurement={measurement} />
    );

    expect(markup).toContain("conditions initiales");
    expect(markup).not.toContain("42,98");
    expect(markup).not.toContain("Référence analytique</dt>");
  });
});
