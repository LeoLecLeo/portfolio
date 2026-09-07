import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { GRAVITY_PRESETS } from "../presets/catalog";
import { CIRCULAR_TWO_BODY_PRESET_ID } from "../presets/circularTwoBody";
import { HYPERBOLIC_FLYBY_PRESET_ID } from "../presets/hyperbolicFlyby";
import { INCLINED_BINARY_PRESET_ID } from "../presets/inclinedBinary";
import { STAR_PLANET_PRESET_ID } from "../presets/starPlanet";
import { SUN_MERCURY_1PN_PRESET_ID } from "../presets/sunMercury1pn";
import {
  GravityPresetCatalog,
  presentGravityPreset,
  presentGravityPresetShowcase,
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

  it("places three complementary showcase presets before the other scenarios", () => {
    const markup = renderToStaticMarkup(
      <GravityPresetCatalog presets={GRAVITY_PRESETS} onLoad={vi.fn()} />
    );
    const showcasedPresetIds = [
      INCLINED_BINARY_PRESET_ID,
      HYPERBOLIC_FLYBY_PRESET_ID,
      SUN_MERCURY_1PN_PRESET_ID,
    ];
    const otherScenariosIndex = markup.indexOf("Autres scénarios");

    expect(markup.match(/Expérience vitrine/g)).toHaveLength(3);
    expect(otherScenariosIndex).toBeGreaterThan(0);

    for (const presetId of showcasedPresetIds) {
      const preset = GRAVITY_PRESETS.find(({ id }) => id === presetId);
      const showcase = presentGravityPresetShowcase(presetId);

      expect(preset).toBeDefined();
      expect(showcase).not.toBeNull();
      expect(markup.indexOf(preset?.name ?? "")).toBeLessThan(
        otherScenariosIndex
      );
      expect(markup).toContain(showcase?.whatYouWillSee);
      expect(markup).toContain(showcase?.timingHint);
      expect(markup.indexOf(preset?.name ?? "")).toBeLessThan(
        markup.indexOf(showcase?.whatYouWillSee ?? "")
      );
    }

    expect(presentGravityPresetShowcase(CIRCULAR_TWO_BODY_PRESET_ID)).toBeNull();
    expect(presentGravityPresetShowcase(STAR_PLANET_PRESET_ID)).toBeNull();
  });

  it("presents the 1PN showcase with its scientific scope and validated reference", () => {
    const mercury = GRAVITY_PRESETS.find(
      ({ id }) => id === SUN_MERCURY_1PN_PRESET_ID
    );
    const showcase = presentGravityPresetShowcase(SUN_MERCURY_1PN_PRESET_ID);

    expect(mercury).toBeDefined();
    expect(presentGravityPreset(mercury!).physicalDomain).toContain(
      "vitesses non relativistes"
    );
    expect(showcase?.whatYouWillSee).toContain("EIH 1PN ↔ Newton");
    expect(showcase?.whatYouWillSee).toContain("42,98″ par siècle");
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
