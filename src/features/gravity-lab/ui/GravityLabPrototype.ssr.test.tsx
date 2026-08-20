import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
  });
});
