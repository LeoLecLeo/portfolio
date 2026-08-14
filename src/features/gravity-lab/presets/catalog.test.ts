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
  INCLINED_BINARY_PERIOD_SECONDS,
  INCLINED_BINARY_SCHEDULER_CONFIG,
  createInclinedBinaryAppliedScenario,
} from "./inclinedBinary";
import { CIRCULAR_TWO_BODY_PRESET } from "./circularTwoBody";
import { HYPERBOLIC_FLYBY_PRESET } from "./hyperbolicFlyby";
import type { GravityPreset } from "./gravityPreset";
import {
  HYPERBOLIC_FLYBY_PREFERRED_CADENCE,
  STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE,
} from "./presetSchedulerPolicies";
import { STAR_PLANET_PRESET } from "./starPlanet";

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
    for (const preset of GRAVITY_PRESETS) {
      const first = preset.createScenario();
      const second = preset.createScenario();

      expect(first).not.toBe(second);
      expect(first.physics).not.toBe(second.physics);
      expect(first.physics.bodies).not.toBe(second.physics.bodies);
      expect(first.physics.bodies[0]).not.toBe(
        second.physics.bodies[0]
      );
      expect(first.physics.bodies[0].initialPositionM).not.toBe(
        second.physics.bodies[0].initialPositionM
      );
      expect(first.presentation).not.toBe(second.presentation);
      expect(first.physics.bodies.map(({ id }) => id)).toEqual(
        second.physics.bodies.map(({ id }) => id)
      );
      expect(
        new Set(first.physics.bodies.map(({ id }) => id)).size
      ).toBe(first.physics.bodies.length);
      expect(isAppliedScenario(first)).toBe(true);
      expect(isAppliedScenario(second)).toBe(true);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(second)).toBe(true);
    }
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

  it("provides complete immutable pedagogical metadata for every preset", () => {
    for (const preset of GRAVITY_PRESETS) {
      const pedagogy = preset.pedagogy;

      expect(pedagogy.learningObjective.trim()).not.toBe("");
      expect(pedagogy.observedPhenomenon.trim()).not.toBe("");
      expect(pedagogy.keyParameters.length).toBeGreaterThan(0);
      expect(
        pedagogy.interestingParametersToModify.length
      ).toBeGreaterThan(0);
      expect(pedagogy.expectedResult.trim()).not.toBe("");
      expect(pedagogy.limitationOrWarning.trim()).not.toBe("");
      expect(
        pedagogy.keyParameters.every(
          (parameter) => parameter.trim().length > 0
        )
      ).toBe(true);
      expect(
        pedagogy.interestingParametersToModify.every(
          (parameter) => parameter.trim().length > 0
        )
      ).toBe(true);
      expect(Object.isFrozen(pedagogy)).toBe(true);
      expect(Object.isFrozen(pedagogy.keyParameters)).toBe(true);
      expect(
        Object.isFrozen(pedagogy.interestingParametersToModify)
      ).toBe(true);
    }
  });

  it("assigns an explicit cadence preference to every preset", () => {
    expect(STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE).toBe(
      INCLINED_BINARY_PERIOD_SECONDS / 24
    );
    expect(
      INCLINED_BINARY_PRESET.preferredSimulatedSecondsPerRealSecond
    ).toBe(STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE);
    expect(
      CIRCULAR_TWO_BODY_PRESET.preferredSimulatedSecondsPerRealSecond
    ).toBe(STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE);
    expect(
      STAR_PLANET_PRESET.preferredSimulatedSecondsPerRealSecond
    ).toBe(STANDARD_ORBITAL_PRESET_PREFERRED_CADENCE);
    expect(
      HYPERBOLIC_FLYBY_PRESET.preferredSimulatedSecondsPerRealSecond
    ).toBe(HYPERBOLIC_FLYBY_PREFERRED_CADENCE);
  });

  it("rejects a forged catalogue preset without a valid cadence preference", () => {
    const forged = {
      ...INCLINED_BINARY_PRESET,
      preferredSimulatedSecondsPerRealSecond: undefined,
    } as unknown as GravityPreset;

    expect(() => createGravityPresetCatalog([forged])).toThrow(
      /invalid cadence preference/
    );
  });
});
