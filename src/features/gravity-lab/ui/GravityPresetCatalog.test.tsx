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
      expect(markup).toContain(preset.pedagogy.learningObjective);
      expect(markup).toContain(preset.pedagogy.observedPhenomenon);
      expect(markup).toContain(preset.pedagogy.expectedResult);
      expect(markup).toContain(
        preset.pedagogy.limitationOrWarning
      );

      for (const parameter of [
        ...preset.pedagogy.keyParameters,
        ...preset.pedagogy.interestingParametersToModify,
      ]) {
        expect(markup).toContain(parameter);
      }
    }

    expect(markup.match(/Charger dans le brouillon/g)).toHaveLength(
      GRAVITY_PRESETS.length
    );
  });

  it("uses one native accessible details disclosure per preset", () => {
    const markup = renderToStaticMarkup(
      <GravityPresetCatalog
        presets={GRAVITY_PRESETS}
        onLoad={vi.fn()}
      />
    );

    expect(markup.match(/<details/g)).toHaveLength(
      GRAVITY_PRESETS.length
    );
    expect(markup.match(/<summary/g)).toHaveLength(
      GRAVITY_PRESETS.length
    );
    expect(markup.match(/Repères pédagogiques/g)).toHaveLength(
      GRAVITY_PRESETS.length
    );
  });

  it("consults metadata without loading a scenario or invoking state changes", () => {
    const source = GRAVITY_PRESETS[0];
    const createScenario = vi.fn(source.createScenario);
    const onLoad = vi.fn();
    const preset = { ...source, createScenario };
    const pedagogy = source.pedagogy;

    renderToStaticMarkup(
      <GravityPresetCatalog presets={[preset]} onLoad={onLoad} />
    );

    expect(createScenario).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
    expect(source.pedagogy).toBe(pedagogy);
  });
});
