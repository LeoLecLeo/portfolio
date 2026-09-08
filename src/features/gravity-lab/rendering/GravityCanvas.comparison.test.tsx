import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SUN_MERCURY_1PN_PRESET } from "../presets/sunMercury1pn";
import { GravityLabSession } from "../runtime/GravityLabSession";
import { createGravityLabSchedulerConfig } from "../runtime/schedulerPolicy";
import { GravityCanvas } from "./GravityCanvas";

function mercurySession(): GravityLabSession {
  const scenario = SUN_MERCURY_1PN_PRESET.createScenario();

  return new GravityLabSession({
    appliedScenario: scenario,
    schedulerConfig: createGravityLabSchedulerConfig(
      scenario.numericalPolicy.timeStepSeconds,
      SUN_MERCURY_1PN_PRESET.preferredSimulatedSecondsPerRealSecond
    ),
  });
}

function renderCanvas(session: GravityLabSession): string {
  return renderToStaticMarkup(
    <GravityCanvas
      session={session}
      selectedBodyId="mercury"
      onSelectBody={vi.fn()}
      onTelemetry={vi.fn()}
      onReady={vi.fn()}
      renderRevision={0}
      trajectoryResetRevision={0}
    />
  );
}

describe("GravityCanvas synchronized comparison presentation", () => {
  it("offers the compatible comparison disabled by default without mounting its legend", () => {
    const session = mercurySession();
    const markup = renderCanvas(session);
    const button = markup.match(
      /<button[^>]*aria-pressed="false"[^>]*>Comparer au modèle Newtonien<\/button>/
    )?.[0];

    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=""');
    expect(markup).toContain(
      "Mêmes conditions initiales et RK4 des deux côtés"
    );
    expect(markup).not.toContain("Légende de la comparaison");
    session.stop();
  });

  it("identifies the primary 1PN trajectory and the Newtonian ghost reference when active", () => {
    const session = mercurySession();
    expect(session.runtime.enableSynchronizedComparison()).toBe(true);

    const markup = renderCanvas(session);

    expect(markup).toMatch(
      /<button[^>]*aria-pressed="true"[^>]*>Comparer au modèle Newtonien<\/button>/
    );
    expect(markup).toContain("Légende de la comparaison");
    expect(markup).toContain("1PN");
    expect(markup).toContain("Newtonien (référence)");
    session.stop();
  });
});
