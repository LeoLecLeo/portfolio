import type { GravityPreset } from "../presets/gravityPreset";
import type { GravityLabAction } from "./gravityLabReducer";

export type PresetDraftLoadResult =
  | Readonly<{
      kind: "ready";
      action: Extract<
        GravityLabAction,
        { type: "preset-draft-loaded" }
      >;
    }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "failed"; message: string }>;

export function preparePresetDraftLoad(
  preset: GravityPreset,
  hasUnappliedChanges: boolean,
  confirmOverwrite: () => boolean
): PresetDraftLoadResult {
  if (hasUnappliedChanges && !confirmOverwrite()) {
    return { kind: "cancelled" };
  }

  try {
    return {
      kind: "ready",
      action: {
        type: "preset-draft-loaded",
        scenario: preset.createScenario(),
        schedulerConfig: preset.schedulerConfig ?? null,
      },
    };
  } catch {
    return {
      kind: "failed",
      message: `Le preset « ${preset.name} » n’a pas pu être chargé. Le brouillon actuel a été conservé.`,
    };
  }
}
