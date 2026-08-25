import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GravityLabOnboarding } from "./GravityLabOnboarding";

describe("GravityLabOnboarding", () => {
  it("presents the complete lightweight getting-started path", () => {
    const markup = renderToStaticMarkup(<GravityLabOnboarding />);

    expect(markup).toContain("Une expérience en quatre gestes");
    expect(markup).toContain("Choisir une expérience");
    expect(markup).toContain("Appliquer le scénario");
    expect(markup).toContain("Lancer la simulation");
    expect(markup).toContain("Explorer");
    expect(markup).toContain("Scénarios / presets");
    expect(markup).toContain("Corps et paramètres");
    expect(markup).toContain("Appliquer et réinitialiser");
  });

  it("distinguishes the three scientific families honestly", () => {
    const markup = renderToStaticMarkup(<GravityLabOnboarding />);

    expect(markup).toContain("Newtonien");
    expect(markup).toContain("Relativité 1PN");
    expect(markup).toContain("Schwarzschild");
    expect(markup).toContain("Ce n’est pas la relativité générale complète");
    expect(markup).toContain("masse sphérique fixe");
  });

  it("recommends the ready-to-run binary without introducing an intrusive dialog", () => {
    const markup = renderToStaticMarkup(<GravityLabOnboarding />);

    expect(markup).toContain('aria-label="Point de départ recommandé"');
    expect(markup).toContain("Le système binaire incliné Newtonien est déjà appliqué");
    expect(markup).toContain("Lecture");
    expect(markup).not.toContain("<dialog");
    expect(markup).not.toContain("aria-modal");
  });
});
