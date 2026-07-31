import {
  INCLINED_BINARY_PRESET,
} from "./inclinedBinary";
import type { GravityPreset } from "./gravityPreset";

export function createGravityPresetCatalog(
  presets: readonly GravityPreset[]
): readonly GravityPreset[] {
  const ids = new Set<string>();

  for (const preset of presets) {
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
]);

const PRESET_BY_ID = new Map(
  GRAVITY_PRESETS.map((preset) => [preset.id, preset])
);

export function findGravityPresetById(
  presetId: string
): GravityPreset | null {
  return PRESET_BY_ID.get(presetId) ?? null;
}
