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

    expect(markup).toContain("Lumière diffusée");
    expect(markup).toContain("Proche du seuil");
    expect(markup).toContain("Lumière capturée");
    expect(markup).toContain("paramètre d’impact critique");
    expect(markup).toContain("pas un rayon concentrique");
    expect(markup).toContain("orbite lumineuse circulaire instable");
    expect(markup).toContain("pas une image complète de lentille gravitationnelle");
  });
});
