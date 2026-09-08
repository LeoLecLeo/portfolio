export const DEFAULT_GRAVITY_CAMERA_POSITION = Object.freeze(
  [11, 8, 14] as const
);
export const DEFAULT_GRAVITY_CAMERA_TARGET = Object.freeze(
  [0, 0, 0] as const
);
export const BODY_SELECTION_MAX_POINTER_TRAVEL_PX = 4;

export function isBodySelectionClick(
  pointerTravelPixels: number
): boolean {
  return (
    Number.isFinite(pointerTravelPixels) &&
    pointerTravelPixels >= 0 &&
    pointerTravelPixels <= BODY_SELECTION_MAX_POINTER_TRAVEL_PX
  );
}
