import { CIRCULAR_TWO_BODY_PRESET } from "./circularTwoBody";
import { HYPERBOLIC_FLYBY_PRESET } from "./hyperbolicFlyby";
import { INCLINED_BINARY_PRESET } from "./inclinedBinary";
import { SUN_MERCURY_1PN_PRESET } from "./sunMercury1pn";
import {
  isValidPresetCadencePreference,
  type GravityPreset,
} from "./gravityPreset";
import { STAR_PLANET_PRESET } from "./starPlanet";

export function createGravityPresetCatalog(
  presets: readonly GravityPreset[]
): readonly GravityPreset[] {
  const ids = new Set<string>();

  for (const preset of presets) {
    if (
      !isValidPresetCadencePreference(
        preset.preferredSimulatedSecondsPerRealSecond
      )
    ) {
      throw new RangeError(
        `Gravity preset "${preset.id}" has an invalid cadence preference.`
      );
    }

    if (ids.has(preset.id)) {
      throw new RangeError(
        `Gravity preset identifier "${preset.id}" is duplicated.`
      );
    }

    ids.add(preset.id);
  }

  return Object.freeze([...presets]);
}

export const GRAVITY_PRESETS = createGravityPresetCatalog([
  INCLINED_BINARY_PRESET,
  CIRCULAR_TWO_BODY_PRESET,
  STAR_PLANET_PRESET,
  HYPERBOLIC_FLYBY_PRESET,
  SUN_MERCURY_1PN_PRESET,
]);

const PRESET_BY_ID = new Map(
  GRAVITY_PRESETS.map((preset) => [preset.id, preset])
);

export function findGravityPresetById(
  presetId: string
): GravityPreset | null {
  return PRESET_BY_ID.get(presetId) ?? null;
}
