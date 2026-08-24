import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SchwarzschildCanvas } from "./SchwarzschildCanvas";

describe("SchwarzschildCanvas lifecycle presentation", () => {
  it("mounts no Canvas or visual geodesic content when the scene is hidden", () => {
    const markup = renderToStaticMarkup(
      <SchwarzschildCanvas initialSceneVisible={false} />
    );

    expect(markup).toContain("Afficher la scène");
    expect(markup).not.toContain('id="schwarzschild-scene-content"');
    expect(markup).not.toContain("Lumière diffusée");
    expect(markup).not.toContain("Visualisation Schwarzschild tridimensionnelle");
  });

  it("presents the three physical light cases and their interpretation", () => {
    const markup = renderToStaticMarkup(<SchwarzschildCanvas />);

    expect(markup).toContain("Module expérimental indépendant");
    expect(markup).toContain(
      "ne modifie pas la session N-corps Newtonienne ou 1PN"
    );
    expect(markup).toContain("Lumière diffusée");
    expect(markup).toContain("Proche du seuil");
    expect(markup).toContain("Lumière capturée");
    expect(markup).toContain("paramètre critique b_c");
    expect(markup).toContain("pas un rayon");
    expect(markup).toContain("orbites lumineuses circulaires sont instables");
    expect(markup).toContain("image réaliste de lentille gravitationnelle");
    expect(markup).toContain("Comprendre la scène");
    expect(markup).toContain("aucun franchissement n’est simulé");
  });

  it("exposes independent accessible controls for the three visual layers", () => {
    const visibleMarkup = renderToStaticMarkup(<SchwarzschildCanvas />);
    const hiddenMarkup = renderToStaticMarkup(
      <SchwarzschildCanvas
        initialFlammVisible={false}
        initialMassiveOrbitVisible={false}
        initialLightRaysVisible={false}
      />
    );

    expect(visibleMarkup).toMatch(
      /<button[^>]*aria-pressed="true"[^>]*>Flamm · affiché<\/button>/
    );
    expect(visibleMarkup).toMatch(
      /<button[^>]*aria-pressed="true"[^>]*>Orbite massive · affichée<\/button>/
    );
    expect(visibleMarkup).toMatch(
      /<button[^>]*aria-pressed="true"[^>]*>Rayons lumineux · affichés<\/button>/
    );
    expect(hiddenMarkup).toMatch(
      /<button[^>]*aria-pressed="false"[^>]*>Flamm · masqué<\/button>/
    );
    expect(hiddenMarkup).toMatch(
      /<button[^>]*aria-pressed="false"[^>]*>Orbite massive · masquée<\/button>/
    );
    expect(hiddenMarkup).toMatch(
      /<button[^>]*aria-pressed="false"[^>]*>Rayons lumineux · masqués<\/button>/
    );
  });
});
