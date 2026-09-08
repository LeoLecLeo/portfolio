import { describe, expect, it } from "vitest";

import { GRAVITY_VISUALIZATION_DEFAULTS } from "./visualizationDefaults";

describe("gravity visualization defaults", () => {
  it("prioritizes visible bodies and motion over dense explanatory layers", () => {
    expect(GRAVITY_VISUALIZATION_DEFAULTS).toEqual({
      trajectoriesVisible: true,
      potentialGridVisible: false,
      gravityFieldVisible: false,
      visualRadiusMode: "amplified",
    });
    expect(Object.isFrozen(GRAVITY_VISUALIZATION_DEFAULTS)).toBe(true);
  });
});
