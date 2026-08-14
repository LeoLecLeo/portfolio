import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMERA_FRAMING_MINIMUM_RADIUS,
  calculateCameraFraming,
  type RenderedCameraPoint,
} from "./cameraFraming";

const DEFAULT_VIEW = { x: 11, y: 8, z: 14 };
const VERTICAL_FOV_RADIANS = (46 * Math.PI) / 180;

function frame(
  positions: readonly RenderedCameraPoint[],
  margin = 1.35
) {
  return calculateCameraFraming({
    positions,
    verticalFieldOfViewRadians: VERTICAL_FOV_RADIANS,
    aspectRatio: 16 / 9,
    viewDirection: DEFAULT_VIEW,
    margin,
  });
}

describe("camera framing policy", () => {
  it("frames one body with the explicit minimum radius", () => {
    const result = frame([{ x: 3, y: -2, z: 5 }]);

    expect(result.target).toEqual({ x: 3, y: -2, z: 5 });
    expect(result.contentRadius).toBe(0);
    expect(result.framedRadius).toBe(
      DEFAULT_CAMERA_FRAMING_MINIMUM_RADIUS * 1.35
    );
    expect(result.cameraDistance).toBeGreaterThan(0);
  });

  it("centres two bodies and contains both in the framed radius", () => {
    const positions = [
      { x: -4, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ];
    const result = frame(positions);

    expect(result.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.contentRadius).toBe(4);
    expect(result.framedRadius).toBeGreaterThan(result.contentRadius);
  });

  it("handles centred and translated systems consistently", () => {
    const centred = frame([
      { x: -2, y: -1, z: 0 },
      { x: 2, y: 1, z: 0 },
    ]);
    const translated = frame([
      { x: 998, y: -501, z: 20 },
      { x: 1002, y: -499, z: 20 },
    ]);

    expect(translated.target).toEqual({ x: 1000, y: -500, z: 20 });
    expect(translated.contentRadius).toBe(centred.contentRadius);
    expect(translated.cameraDistance).toBe(centred.cameraDistance);
  });

  it.each([
    [1e-12, DEFAULT_CAMERA_FRAMING_MINIMUM_RADIUS],
    [1e120, 1e120],
  ] as const)("keeps a finite result at extent %s", (extent, radius) => {
    const result = frame([
      { x: -extent, y: 0, z: 0 },
      { x: extent, y: 0, z: 0 },
    ]);

    expect(result.contentRadius).toBe(extent);
    expect(result.framedRadius).toBe(radius * 1.35);
    expect(Number.isFinite(result.cameraDistance)).toBe(true);
    expect(Number.isFinite(result.cameraPosition.x)).toBe(true);
    expect(Number.isFinite(result.cameraPosition.y)).toBe(true);
    expect(Number.isFinite(result.cameraPosition.z)).toBe(true);
  });

  it("frames sixteen bodies deterministically", () => {
    const positions = Array.from({ length: 16 }, (_, index) => ({
      x: index - 7.5,
      y: (index % 4) - 1.5,
      z: (index % 3) - 1,
    }));

    expect(frame(positions)).toEqual(frame(positions));
  });

  it("increases distance when the visual margin increases", () => {
    const positions = [
      { x: -3, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ];

    expect(frame(positions, 1.5).cameraDistance).toBeGreaterThan(
      frame(positions, 1).cameraDistance
    );
  });

  it("does not mutate rendered or physical source coordinates", () => {
    const positions = [
      { x: -4, y: 2, z: 1 },
      { x: 6, y: -3, z: 2 },
    ];
    const snapshot = structuredClone(positions);

    frame(positions);

    expect(positions).toEqual(snapshot);
  });
});
