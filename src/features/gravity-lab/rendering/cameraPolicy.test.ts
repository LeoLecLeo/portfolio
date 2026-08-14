import { describe, expect, it } from "vitest";

import {
  BODY_SELECTION_MAX_POINTER_TRAVEL_PX,
  DEFAULT_GRAVITY_CAMERA_POSITION,
  DEFAULT_GRAVITY_CAMERA_TARGET,
  isBodySelectionClick,
} from "./cameraPolicy";

describe("gravity camera interaction policy", () => {
  it("accepts stationary pointer clicks and rejects camera drags", () => {
    expect(isBodySelectionClick(0)).toBe(true);
    expect(
      isBodySelectionClick(BODY_SELECTION_MAX_POINTER_TRAVEL_PX)
    ).toBe(true);
    expect(
      isBodySelectionClick(BODY_SELECTION_MAX_POINTER_TRAVEL_PX + 0.01)
    ).toBe(false);
  });

  it("rejects invalid pointer travel measurements", () => {
    expect(isBodySelectionClick(-1)).toBe(false);
    expect(isBodySelectionClick(Number.NaN)).toBe(false);
    expect(isBodySelectionClick(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("keeps deterministic immutable reset coordinates", () => {
    expect(DEFAULT_GRAVITY_CAMERA_POSITION).toEqual([11, 8, 14]);
    expect(DEFAULT_GRAVITY_CAMERA_TARGET).toEqual([0, 0, 0]);
    expect(Object.isFrozen(DEFAULT_GRAVITY_CAMERA_POSITION)).toBe(true);
    expect(Object.isFrozen(DEFAULT_GRAVITY_CAMERA_TARGET)).toBe(true);
  });
});
