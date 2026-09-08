import { describe, expect, it, vi } from "vitest";

import type { GravityPreset } from "../presets/gravityPreset";
import { CIRCULAR_TWO_BODY_PRESET } from "../presets/circularTwoBody";
import { preparePresetDraftLoad } from "./presetDraftLoading";

describe("preset draft loading preparation", () => {
  it("requests confirmation before replacing an altered draft", () => {
    const confirmOverwrite = vi.fn(() => true);
    const result = preparePresetDraftLoad(
      CIRCULAR_TWO_BODY_PRESET,
      true,
      confirmOverwrite
    );

    expect(confirmOverwrite).toHaveBeenCalledOnce();
    expect(result.kind).toBe("ready");
  });

  it("does not request confirmation for a synchronized draft", () => {
    const confirmOverwrite = vi.fn(() => false);
    const result = preparePresetDraftLoad(
      CIRCULAR_TWO_BODY_PRESET,
      false,
      confirmOverwrite
    );

    expect(confirmOverwrite).not.toHaveBeenCalled();
    expect(result.kind).toBe("ready");
  });

  it("does not construct a scenario when confirmation is cancelled", () => {
    const createScenario = vi.fn(
      CIRCULAR_TWO_BODY_PRESET.createScenario
    );
    const preset: GravityPreset = {
      ...CIRCULAR_TWO_BODY_PRESET,
      createScenario,
    };

    const result = preparePresetDraftLoad(preset, true, () => false);

    expect(result).toEqual({ kind: "cancelled" });
    expect(createScenario).not.toHaveBeenCalled();
  });

  it("returns a structured failure without an action when the factory fails", () => {
    const preset: GravityPreset = {
      ...CIRCULAR_TWO_BODY_PRESET,
      id: "failing-preset",
      name: "Preset en échec",
      createScenario: () => {
        throw new Error("factory failure");
      },
    };

    const result = preparePresetDraftLoad(preset, false, vi.fn());

    expect(result).toEqual({
      kind: "failed",
      message:
        "Le preset « Preset en échec » n’a pas pu être chargé. Le brouillon actuel a été conservé.",
    });
    expect("action" in result).toBe(false);
  });
});
