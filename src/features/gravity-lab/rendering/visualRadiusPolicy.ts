export type VisualRadiusMode = "amplified" | "physical-scale";

// A radius of 0.16 scene unit remains clickable at the default camera distance.
export const AMPLIFIED_RADIUS_MIN_SCENE = 0.16;

// A radius above 0.75 scene unit would obscure a substantial part of the
// default eight-unit-wide system view.
export const AMPLIFIED_RADIUS_MAX_SCENE = 0.75;

// A sub-linear, monotone power preserves size ordering between the clamps while
// compressing the many orders of magnitude common to astronomical radii.
export const AMPLIFIED_RADIUS_EXPONENT = 0.4;

function assertRadiusInputs(
  physicalRadiusM: number,
  sceneUnitsPerMeter: number
): void {
  if (!Number.isFinite(physicalRadiusM) || physicalRadiusM < 0) {
    throw new RangeError(
      "Physical radius must be finite and non-negative."
    );
  }

  if (!Number.isFinite(sceneUnitsPerMeter) || sceneUnitsPerMeter <= 0) {
    throw new RangeError(
      "Scene scale must be finite and strictly positive."
    );
  }
}

export function calculateVisualRadiusScene(
  physicalRadiusM: number,
  sceneUnitsPerMeter: number,
  mode: VisualRadiusMode
): number {
  assertRadiusInputs(physicalRadiusM, sceneUnitsPerMeter);
  const physicalScaleRadius = physicalRadiusM * sceneUnitsPerMeter;

  if (!Number.isFinite(physicalScaleRadius)) {
    throw new RangeError("Scaled physical radius must remain finite.");
  }

  if (mode === "physical-scale") {
    return physicalScaleRadius;
  }

  if (mode !== "amplified") {
    throw new TypeError(`Unknown visual radius mode "${String(mode)}".`);
  }

  return Math.min(
    AMPLIFIED_RADIUS_MAX_SCENE,
    Math.max(
      AMPLIFIED_RADIUS_MIN_SCENE,
      physicalScaleRadius ** AMPLIFIED_RADIUS_EXPONENT
    )
  );
}
