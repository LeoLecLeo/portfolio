import type { RenderedCameraPoint } from "./cameraFraming";

export type TrackedCameraPose = Readonly<{
  cameraPosition: RenderedCameraPoint;
  target: RenderedCameraPoint;
}>;

function assertFinitePoint(
  point: RenderedCameraPoint,
  label: string
): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  ) {
    throw new RangeError(`${label} must contain finite coordinates.`);
  }
}

function translatePose(
  cameraPosition: RenderedCameraPoint,
  target: RenderedCameraPoint,
  translation: RenderedCameraPoint
): TrackedCameraPose {
  assertFinitePoint(cameraPosition, "Camera position");
  assertFinitePoint(target, "Camera target");
  assertFinitePoint(translation, "Camera translation");

  const nextCameraPosition = Object.freeze({
    x: cameraPosition.x + translation.x,
    y: cameraPosition.y + translation.y,
    z: cameraPosition.z + translation.z,
  });
  const nextTarget = Object.freeze({
    x: target.x + translation.x,
    y: target.y + translation.y,
    z: target.z + translation.z,
  });

  assertFinitePoint(nextCameraPosition, "Translated camera position");
  assertFinitePoint(nextTarget, "Translated camera target");

  return Object.freeze({
    cameraPosition: nextCameraPosition,
    target: nextTarget,
  });
}

export function centerCameraOnRenderedPoint(
  cameraPosition: RenderedCameraPoint,
  currentTarget: RenderedCameraPoint,
  renderedPoint: RenderedCameraPoint
): TrackedCameraPose {
  assertFinitePoint(renderedPoint, "Rendered focus point");

  return translatePose(cameraPosition, currentTarget, {
    x: renderedPoint.x - currentTarget.x,
    y: renderedPoint.y - currentTarget.y,
    z: renderedPoint.z - currentTarget.z,
  });
}

export function followRenderedPoint(
  cameraPosition: RenderedCameraPoint,
  currentTarget: RenderedCameraPoint,
  previousRenderedPoint: RenderedCameraPoint,
  nextRenderedPoint: RenderedCameraPoint
): TrackedCameraPose {
  assertFinitePoint(previousRenderedPoint, "Previous tracked point");
  assertFinitePoint(nextRenderedPoint, "Next tracked point");

  return translatePose(cameraPosition, currentTarget, {
    x: nextRenderedPoint.x - previousRenderedPoint.x,
    y: nextRenderedPoint.y - previousRenderedPoint.y,
    z: nextRenderedPoint.z - previousRenderedPoint.z,
  });
}

export function reconcileTrackedBodyId(input: Readonly<{
  trackedBodyId: string | null;
  selectedBodyId: string;
  availableBodyIds: readonly string[];
  sessionChanged: boolean;
}>): string | null {
  if (input.trackedBodyId === null) {
    return null;
  }

  if (!input.availableBodyIds.includes(input.trackedBodyId)) {
    return null;
  }

  if (input.sessionChanged) {
    return input.trackedBodyId;
  }

  return input.availableBodyIds.includes(input.selectedBodyId)
    ? input.selectedBodyId
    : null;
}
