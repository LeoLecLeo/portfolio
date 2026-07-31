import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { GRAVITY_PRESETS } from "../presets/catalog";
import {
  GravityPresetCatalog,
  presentGravityPreset,
} from "./GravityPresetCatalog";

describe("GravityPresetCatalog", () => {
  it("displays every catalogue preset and all required metadata", () => {
    const markup = renderToStaticMarkup(
      <GravityPresetCatalog
        presets={GRAVITY_PRESETS}
        onLoad={vi.fn()}
      />
    );

    for (const preset of GRAVITY_PRESETS) {
      const presentation = presentGravityPreset(preset);

      expect(markup).toContain(preset.name);
      expect(markup).toContain(preset.shortDescription);
      expect(markup).toContain(presentation.category);
      expect(markup).toContain(presentation.educationalLevel);
      expect(markup).toContain(presentation.bodyCount);
      expect(markup).toContain(presentation.physicalDomain);
    }

    expect(markup.match(/Charger dans le brouillon/g)).toHaveLength(
      GRAVITY_PRESETS.length
    );
  });
});
