import { describe, expect, it } from "vitest";

import {
  centerCameraOnRenderedPoint,
  followRenderedPoint,
  reconcileTrackedBodyId,
} from "./cameraTracking";

function offset(
  camera: Readonly<{ x: number; y: number; z: number }>,
  target: Readonly<{ x: number; y: number; z: number }>
) {
  return {
    x: camera.x - target.x,
    y: camera.y - target.y,
    z: camera.z - target.z,
  };
}

describe("camera tracking policy", () => {
  it("centres the target on one body without changing the camera offset", () => {
    const camera = { x: 11, y: 8, z: 14 };
    const target = { x: 0, y: 0, z: 0 };
    const body = { x: 3, y: -2, z: 5 };
    const result = centerCameraOnRenderedPoint(camera, target, body);

    expect(result.target).toEqual(body);
    expect(offset(result.cameraPosition, result.target)).toEqual(
      offset(camera, target)
    );
  });

  it("translates camera and target with a moving tracked body", () => {
    const result = followRenderedPoint(
      { x: 10, y: 5, z: 2 },
      { x: 1, y: 1, z: 1 },
      { x: -3, y: 2, z: 4 },
      { x: 2, y: 0, z: 7 }
    );

    expect(result.cameraPosition).toEqual({ x: 15, y: 3, z: 5 });
    expect(result.target).toEqual({ x: 6, y: -1, z: 4 });
    expect(offset(result.cameraPosition, result.target)).toEqual({
      x: 9,
      y: 4,
      z: 1,
    });
  });

  it("does not move the camera while a paused body remains still, then resumes deterministically", () => {
    const camera = { x: 8, y: 4, z: 6 };
    const target = { x: 1, y: 2, z: 3 };
    const paused = followRenderedPoint(
      camera,
      target,
      { x: 5, y: 0, z: -1 },
      { x: 5, y: 0, z: -1 }
    );
    const resumed = followRenderedPoint(
      paused.cameraPosition,
      paused.target,
      { x: 5, y: 0, z: -1 },
      { x: 5.5, y: 1, z: -2 }
    );

    expect(paused).toEqual({ cameraPosition: camera, target });
    expect(resumed.cameraPosition).toEqual({ x: 8.5, y: 5, z: 5 });
    expect(resumed.target).toEqual({ x: 1.5, y: 3, z: 2 });
  });

  it("follows a newly selected body in the same session", () => {
    expect(
      reconcileTrackedBodyId({
        trackedBodyId: "body-a",
        selectedBodyId: "body-b",
        availableBodyIds: ["body-a", "body-b"],
        sessionChanged: false,
      })
    ).toBe("body-b");
  });

  it("disables tracking when the tracked body is removed", () => {
    expect(
      reconcileTrackedBodyId({
        trackedBodyId: "body-a",
        selectedBodyId: "body-b",
        availableBodyIds: ["body-b"],
        sessionChanged: false,
      })
    ).toBeNull();
  });

  it("keeps tracking across a replacement only when the same id remains", () => {
    expect(
      reconcileTrackedBodyId({
        trackedBodyId: "body-a",
        selectedBodyId: "body-a",
        availableBodyIds: ["body-a", "body-c"],
        sessionChanged: true,
      })
    ).toBe("body-a");
    expect(
      reconcileTrackedBodyId({
        trackedBodyId: "body-a",
        selectedBodyId: "body-c",
        availableBodyIds: ["body-c"],
        sessionChanged: true,
      })
    ).toBeNull();
  });

  it("never mutates camera or rendered position inputs", () => {
    const camera = { x: 2, y: 4, z: 6 };
    const target = { x: 1, y: 1, z: 1 };
    const previousBody = { x: -2, y: 3, z: 5 };
    const nextBody = { x: -1, y: 5, z: 8 };
    const snapshot = structuredClone({
      camera,
      target,
      previousBody,
      nextBody,
    });

    centerCameraOnRenderedPoint(camera, target, nextBody);
    followRenderedPoint(camera, target, previousBody, nextBody);

    expect({ camera, target, previousBody, nextBody }).toEqual(snapshot);
  });
});
