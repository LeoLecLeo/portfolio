import { describe, expect, it } from "vitest";

import { isAppliedScenario } from "../core/scenario";
import {
  GRAVITY_PRESETS,
  createGravityPresetCatalog,
  findGravityPresetById,
} from "./catalog";
import {
  INCLINED_BINARY_PRESET,
  INCLINED_BINARY_PRESET_ID,
  INCLINED_BINARY_SCHEDULER_CONFIG,
  createInclinedBinaryAppliedScenario,
} from "./inclinedBinary";

describe("gravity preset catalog", () => {
  it("is immutable and contains no duplicate identifier", () => {
    const ids = GRAVITY_PRESETS.map(({ id }) => id);

    expect(Object.isFrozen(GRAVITY_PRESETS)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(GRAVITY_PRESETS.every(Object.isFrozen)).toBe(true);
    expect(() =>
      createGravityPresetCatalog([
        INCLINED_BINARY_PRESET,
        INCLINED_BINARY_PRESET,
      ])
    ).toThrow(/duplicated/);
  });

  it("finds a preset by stable identifier and returns null for an unknown one", () => {
    expect(findGravityPresetById(INCLINED_BINARY_PRESET_ID)).toBe(
      INCLINED_BINARY_PRESET
    );
    expect(findGravityPresetById("unknown-preset")).toBeNull();
  });

  it("creates independent valid immutable scenarios on every call", () => {
    const first = INCLINED_BINARY_PRESET.createScenario();
    const second = INCLINED_BINARY_PRESET.createScenario();

    expect(first).not.toBe(second);
    expect(first.physics).not.toBe(second.physics);
    expect(first.physics.bodies).not.toBe(second.physics.bodies);
    expect(first.physics.bodies[0]).not.toBe(second.physics.bodies[0]);
    expect(first.physics.bodies[0].initialPositionM).not.toBe(
      second.physics.bodies[0].initialPositionM
    );
    expect(first.presentation).not.toBe(second.presentation);
    expect(isAppliedScenario(first)).toBe(true);
    expect(isAppliedScenario(second)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("preserves the existing inclined-binary scientific scenario exactly", () => {
    const catalogScenario = INCLINED_BINARY_PRESET.createScenario();
    const existingScenario = createInclinedBinaryAppliedScenario(
      INCLINED_BINARY_SCHEDULER_CONFIG
    );

    expect(catalogScenario).toEqual(existingScenario);
  });

  it("keeps every body-count metadata value coherent with its factory", () => {
    for (const preset of GRAVITY_PRESETS) {
      const scenario = preset.createScenario();

      expect(preset.bodyCount).toBe(scenario.physics.bodies.length);
    }
  });
});
