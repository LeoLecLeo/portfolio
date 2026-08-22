import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SUN_MERCURY_1PN_PRESET } from "../presets/sunMercury1pn";
import { createGravityLabSchedulerConfig } from "../runtime/schedulerPolicy";
import { GravityLabPrototype } from "./GravityLabPrototype";

describe("GravityLabPrototype SSR controls", () => {
  it("renders the safe pre-hydration control state deterministically", () => {
    const markup = renderToStaticMarkup(<GravityLabPrototype />);
    const buttonTag = (accessibleName: string) =>
      markup.match(
        new RegExp(
          `<button[^>]*aria-label="${accessibleName}"[^>]*>`
        )
      )?.[0];

    expect(
      buttonTag("Démarrer ou reprendre la simulation")
    ).toContain('disabled=""');
    expect(buttonTag("Mettre la simulation en pause")).toContain(
      'disabled=""'
    );
    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*>Appliquer et réinitialiser<\/button>/
    );
    expect(
      buttonTag("Réinitialiser l’état physique du scénario appliqué")
    ).not.toContain("disabled");
    expect(markup).toContain("État courant :");
    expect(markup).toContain(">Pause</strong>");
    expect(markup).toMatch(/Newtonien[^<]*Velocity Verlet/);
    expect(markup).toContain("kg·m²·s⁻¹");
    expect(markup).not.toContain(
      "Non suivi — invariant 1PN non spécifié"
    );
  });

  it("does not present Newtonian angular momentum as a 1PN invariant", () => {
    const scenario = SUN_MERCURY_1PN_PRESET.createScenario();
    const markup = renderToStaticMarkup(
      <GravityLabPrototype
        sessionRequest={{
          appliedScenario: scenario,
          schedulerConfig: createGravityLabSchedulerConfig(
            scenario.numericalPolicy.timeStepSeconds,
            SUN_MERCURY_1PN_PRESET.preferredSimulatedSecondsPerRealSecond
          ),
        }}
      />
    );

    expect(markup).toContain(
      "Non suivi — invariant 1PN non spécifié"
    );
    expect(markup).toContain(
      "les invariants conservatifs 1PN n’ont pas encore été spécifiés"
    );
    expect(markup).toContain("convention harmonique du moteur");
  });
});
