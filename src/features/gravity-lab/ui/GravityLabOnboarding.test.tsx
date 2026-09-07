import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GravityLabOnboarding } from "./GravityLabOnboarding";

describe("GravityLabOnboarding", () => {
  it("presents the complete lightweight getting-started path", () => {
    const markup = renderToStaticMarkup(<GravityLabOnboarding />);

    expect(markup).toContain("Changer d’expérience en quatre gestes");
    const steps = [...markup.matchAll(/<h3 class="text-sm font-semibold">(.*?)<\/h3>/g)]
      .map((match) => match[1]);
    expect(steps).toEqual([
      "Mettre en pause",
      "Choisir une expérience",
      "Appliquer le scénario",
      "Lancer la simulation",
    ]);
    expect(markup).toContain("Cliquez sur « Stop » avant de changer de scénario");
    expect(markup).toContain("Choisir une expérience");
    expect(markup).toContain("Appliquer le scénario");
    expect(markup).toContain("Lancer la simulation");
    expect(markup).toContain("Scénarios / presets");
    expect(markup).toContain("Corps et paramètres");
    expect(markup).toContain("Appliquer et réinitialiser");
  });

  it("distinguishes the three scientific families honestly", () => {
    const markup = renderToStaticMarkup(<GravityLabOnboarding />);

    expect(markup).toContain("Newtonien");
    expect(markup).toContain("Relativité 1PN");
    expect(markup).toContain("Schwarzschild");
    expect(markup).toContain("équations EIH N-corps");
    expect(markup).toContain("vitesses non relativistes");
    expect(markup).toContain("Ce n’est pas la relativité générale complète");
    expect(markup).toContain("Solution exacte spécialisée");
    expect(markup).toContain("non rotative et non chargée");
    expect(markup).toContain("expérience géométrique spécialisée et indépendante");
  });

  it("explains automatic binary startup without asking for an initial click", () => {
    const markup = renderToStaticMarkup(<GravityLabOnboarding />);

    expect(markup).toContain('aria-label="Point de départ recommandé"');
    const recommendation = markup.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1];
    expect(recommendation).toContain("Le système binaire incliné Newtonien");
    expect(recommendation).toContain("démarre automatiquement");
    expect(recommendation).toContain("dès que la scène est prête");
    expect(recommendation).toContain("immédiatement la caméra et les visualisations");
    expect(recommendation).not.toContain("Lecture");
    expect(markup).not.toContain("<dialog");
    expect(markup).not.toContain("aria-modal");
  });
});
