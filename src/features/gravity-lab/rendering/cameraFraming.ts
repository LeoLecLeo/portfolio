import { MAX_NEWTONIAN_BODIES } from "../core/types";

export const DEFAULT_CAMERA_FRAMING_MARGIN = 1.35;
export const DEFAULT_CAMERA_FRAMING_MINIMUM_RADIUS = 0.75;

export type RenderedCameraPoint = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type CameraFramingInput = Readonly<{
  positions: readonly RenderedCameraPoint[];
  verticalFieldOfViewRadians: number;
  aspectRatio: number;
  viewDirection: RenderedCameraPoint;
  margin?: number;
  minimumRadius?: number;
}>;

export type CameraFramingResult = Readonly<{
  target: RenderedCameraPoint;
  cameraPosition: RenderedCameraPoint;
  contentRadius: number;
  framedRadius: number;
  cameraDistance: number;
}>;

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and greater than zero.`);
  }
}

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

export function calculateCameraFraming(
  input: CameraFramingInput
): CameraFramingResult {
  if (
    input.positions.length < 1 ||
    input.positions.length > MAX_NEWTONIAN_BODIES
  ) {
    throw new RangeError(
      `Camera framing requires between 1 and ${MAX_NEWTONIAN_BODIES} positions.`
    );
  }

  assertPositiveFinite(input.aspectRatio, "Camera aspect ratio");
  assertPositiveFinite(
    input.verticalFieldOfViewRadians,
    "Vertical field of view"
  );

  if (input.verticalFieldOfViewRadians >= Math.PI) {
    throw new RangeError(
      "Vertical field of view must be smaller than pi radians."
    );
  }

  const margin = input.margin ?? DEFAULT_CAMERA_FRAMING_MARGIN;
  const minimumRadius =
    input.minimumRadius ?? DEFAULT_CAMERA_FRAMING_MINIMUM_RADIUS;

  if (!Number.isFinite(margin) || margin < 1) {
    throw new RangeError(
      "Camera framing margin must be finite and at least one."
    );
  }
  assertPositiveFinite(minimumRadius, "Minimum framing radius");

  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;

  for (const [index, position] of input.positions.entries()) {
    assertFinitePoint(position, `Rendered position ${index}`);
    minimumX = Math.min(minimumX, position.x);
    minimumY = Math.min(minimumY, position.y);
    minimumZ = Math.min(minimumZ, position.z);
    maximumX = Math.max(maximumX, position.x);
    maximumY = Math.max(maximumY, position.y);
    maximumZ = Math.max(maximumZ, position.z);
  }

  const target = {
    x: minimumX * 0.5 + maximumX * 0.5,
    y: minimumY * 0.5 + maximumY * 0.5,
    z: minimumZ * 0.5 + maximumZ * 0.5,
  };
  assertFinitePoint(target, "Camera framing target");

  let contentRadius = 0;

  for (const position of input.positions) {
    contentRadius = Math.max(
      contentRadius,
      Math.hypot(
        position.x - target.x,
        position.y - target.y,
        position.z - target.z
      )
    );
  }
  assertPositiveFinite(
    Math.max(contentRadius, minimumRadius),
    "Camera framing radius"
  );

  const framedRadius = Math.max(contentRadius, minimumRadius) * margin;
  const verticalHalfAngle = input.verticalFieldOfViewRadians * 0.5;
  const horizontalHalfAngle = Math.atan(
    Math.tan(verticalHalfAngle) * input.aspectRatio
  );
  const limitingHalfAngle = Math.min(
    verticalHalfAngle,
    horizontalHalfAngle
  );
  const cameraDistance = framedRadius / Math.sin(limitingHalfAngle);
  assertPositiveFinite(cameraDistance, "Camera framing distance");

  assertFinitePoint(input.viewDirection, "Camera view direction");
  const directionLength = Math.hypot(
    input.viewDirection.x,
    input.viewDirection.y,
    input.viewDirection.z
  );
  assertPositiveFinite(directionLength, "Camera view direction length");
  const direction = {
    x: input.viewDirection.x / directionLength,
    y: input.viewDirection.y / directionLength,
    z: input.viewDirection.z / directionLength,
  };
  const cameraPosition = {
    x: target.x + direction.x * cameraDistance,
    y: target.y + direction.y * cameraDistance,
    z: target.z + direction.z * cameraDistance,
  };
  assertFinitePoint(cameraPosition, "Framed camera position");

  return Object.freeze({
    target: Object.freeze(target),
    cameraPosition: Object.freeze(cameraPosition),
    contentRadius,
    framedRadius,
    cameraDistance,
  });
}
