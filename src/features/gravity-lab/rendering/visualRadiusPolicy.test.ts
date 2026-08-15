import { describe, expect, it } from "vitest";

import {
  AMPLIFIED_RADIUS_MAX_SCENE,
  AMPLIFIED_RADIUS_MIN_SCENE,
  calculateVisualRadiusScene,
} from "./visualRadiusPolicy";

describe("visual radius policy", () => {
  it("uses the strictly proportional physical radius in scale mode", () => {
    expect(calculateVisualRadiusScene(6.371e6, 2.5e-9, "physical-scale"))
      .toBe(6.371e6 * 2.5e-9);
    expect(calculateVisualRadiusScene(0, 4, "physical-scale")).toBe(0);
  });

  it("amplifies an extremely small or zero-radius body for selection", () => {
    expect(calculateVisualRadiusScene(1e-30, 1e-30, "amplified"))
      .toBe(AMPLIFIED_RADIUS_MIN_SCENE);
    expect(calculateVisualRadiusScene(0, 1, "amplified"))
      .toBe(AMPLIFIED_RADIUS_MIN_SCENE);
  });

  it("caps an extremely large rendered radius", () => {
    expect(calculateVisualRadiusScene(1e18, 1, "amplified"))
      .toBe(AMPLIFIED_RADIUS_MAX_SCENE);
  });

  it("preserves radius ordering across several magnitudes between clamps", () => {
    const rendered = [0.02, 0.1, 0.4].map((radius) =>
      calculateVisualRadiusScene(radius, 1, "amplified")
    );

    expect(rendered[0]).toBeLessThan(rendered[1]);
    expect(rendered[1]).toBeLessThan(rendered[2]);
  });

  it("is deterministic and never changes physical, position, or trajectory data", () => {
    const source = {
      physicalRadiusM: 6.371e6,
      position: { x: 3, y: -2, z: 5 },
      trajectory: new Float32Array([0, 0, 0, 1, 2, 3]),
    };
    const snapshot = {
      physicalRadiusM: source.physicalRadiusM,
      position: { ...source.position },
      trajectory: new Float32Array(source.trajectory),
    };

    const amplified = calculateVisualRadiusScene(
      source.physicalRadiusM,
      2e-9,
      "amplified"
    );
    const physicalScale = calculateVisualRadiusScene(
      source.physicalRadiusM,
      2e-9,
      "physical-scale"
    );

    expect(calculateVisualRadiusScene(source.physicalRadiusM, 2e-9, "amplified"))
      .toBe(amplified);
    expect(amplified).not.toBe(physicalScale);
    expect(source.physicalRadiusM).toBe(snapshot.physicalRadiusM);
    expect(source.position).toEqual(snapshot.position);
    expect(source.trajectory).toEqual(snapshot.trajectory);
  });
});
