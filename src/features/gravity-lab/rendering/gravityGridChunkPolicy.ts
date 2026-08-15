import type { RenderedCameraPoint } from "./cameraFraming";
import {
  GRAVITY_GRID_TARGET_LINE_SPACING_SCENE,
  type PotentialGridBounds,
} from "./gravityPotentialGridPolicy";

export { GRAVITY_GRID_TARGET_LINE_SPACING_SCENE } from "./gravityPotentialGridPolicy";

export const GRAVITY_GRID_CHUNK_INTERVALS = 6;
export const GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE =
  GRAVITY_GRID_TARGET_LINE_SPACING_SCENE * GRAVITY_GRID_CHUNK_INTERVALS;
export const GRAVITY_GRID_MAX_CHUNKS = 72;
export const GRAVITY_GRID_MAX_DENSE_CHUNKS = 8;
export const GRAVITY_GRID_COVERAGE_PADDING_CHUNKS = 1;
export const GRAVITY_GRID_COVERAGE_RECALCULATION_DISTANCE_SCENE =
  GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 0.5;
export const GRAVITY_GRID_LINES_PER_CHUNK =
  3 * GRAVITY_GRID_CHUNK_INTERVALS ** 2;
export const GRAVITY_GRID_VERTICES_PER_CHUNK =
  GRAVITY_GRID_LINES_PER_CHUNK * GRAVITY_GRID_CHUNK_INTERVALS * 2;
export const GRAVITY_GRID_MAX_CHUNK_VERTICES =
  GRAVITY_GRID_MAX_CHUNKS * GRAVITY_GRID_VERTICES_PER_CHUNK;
export const GRAVITY_GRID_MAX_DRAW_CALLS = 1;

export type GravityGridCameraCoverage = Readonly<{
  position: RenderedCameraPoint;
  target: RenderedCameraPoint;
  verticalFieldOfViewRadians: number;
  aspectRatio: number;
}>;

export type GravityGridChunk = Readonly<{
  x: number;
  y: number;
  z: number;
  lod: number;
}>;

export type GravityGridCoverage = Readonly<{
  key: string;
  outerLod: number;
  denseLod: number;
  denseBounds: PotentialGridBounds;
  chunks: readonly GravityGridChunk[];
  requestedBounds: PotentialGridBounds;
  vertexCount: number;
}>;

export type GravityGridCoverageAnchor = Readonly<{
  cameraPosition: RenderedCameraPoint;
  cameraTarget: RenderedCameraPoint;
  verticalFieldOfViewRadians: number;
  aspectRatio: number;
}>;

function assertFinitePoint(point: RenderedCameraPoint, label: string): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  ) {
    throw new RangeError(`${label} must contain finite coordinates.`);
  }
}

function includePoint(
  point: RenderedCameraPoint,
  extrema: {
    minimumX: number;
    minimumY: number;
    minimumZ: number;
    maximumX: number;
    maximumY: number;
    maximumZ: number;
  }
): void {
  extrema.minimumX = Math.min(extrema.minimumX, point.x);
  extrema.minimumY = Math.min(extrema.minimumY, point.y);
  extrema.minimumZ = Math.min(extrema.minimumZ, point.z);
  extrema.maximumX = Math.max(extrema.maximumX, point.x);
  extrema.maximumY = Math.max(extrema.maximumY, point.y);
  extrema.maximumZ = Math.max(extrema.maximumZ, point.z);
}

function requestedCoverageBounds(
  systemBounds: PotentialGridBounds,
  camera: GravityGridCameraCoverage
): PotentialGridBounds {
  assertFinitePoint(systemBounds.minimum, "System bounds minimum");
  assertFinitePoint(systemBounds.maximum, "System bounds maximum");
  assertFinitePoint(camera.position, "Grid camera position");
  assertFinitePoint(camera.target, "Grid camera target");

  if (
    !Number.isFinite(camera.verticalFieldOfViewRadians) ||
    camera.verticalFieldOfViewRadians <= 0 ||
    camera.verticalFieldOfViewRadians >= Math.PI
  ) {
    throw new RangeError(
      "Grid camera field of view must be finite and between zero and pi."
    );
  }

  if (!Number.isFinite(camera.aspectRatio) || camera.aspectRatio <= 0) {
    throw new RangeError(
      "Grid camera aspect ratio must be finite and strictly positive."
    );
  }

  const directionX = camera.target.x - camera.position.x;
  const directionY = camera.target.y - camera.position.y;
  const directionZ = camera.target.z - camera.position.z;
  const distance = Math.hypot(directionX, directionY, directionZ);

  if (!Number.isFinite(distance) || distance <= 0) {
    throw new RangeError(
      "Grid camera position and target must define a finite view direction."
    );
  }

  const forwardX = directionX / distance;
  const forwardY = directionY / distance;
  const forwardZ = directionZ / distance;
  const referenceX = Math.abs(forwardY) < 0.95 ? 0 : 1;
  const referenceY = Math.abs(forwardY) < 0.95 ? 1 : 0;
  const rightX = forwardY * 0 - forwardZ * referenceY;
  const rightY = forwardZ * referenceX - forwardX * 0;
  const rightZ = forwardX * referenceY - forwardY * referenceX;
  const rightLength = Math.hypot(rightX, rightY, rightZ);
  const normalizedRightX = rightX / rightLength;
  const normalizedRightY = rightY / rightLength;
  const normalizedRightZ = rightZ / rightLength;
  const upX = normalizedRightY * forwardZ - normalizedRightZ * forwardY;
  const upY = normalizedRightZ * forwardX - normalizedRightX * forwardZ;
  const upZ = normalizedRightX * forwardY - normalizedRightY * forwardX;
  const halfHeight =
    distance * Math.tan(camera.verticalFieldOfViewRadians * 0.5);
  const halfWidth = halfHeight * camera.aspectRatio;
  const extrema = {
    minimumX: systemBounds.minimum.x,
    minimumY: systemBounds.minimum.y,
    minimumZ: systemBounds.minimum.z,
    maximumX: systemBounds.maximum.x,
    maximumY: systemBounds.maximum.y,
    maximumZ: systemBounds.maximum.z,
  };

  includePoint(camera.position, extrema);
  includePoint(camera.target, extrema);

  for (const horizontalSign of [-1, 1]) {
    for (const verticalSign of [-1, 1]) {
      includePoint(
        {
          x:
            camera.target.x +
            normalizedRightX * halfWidth * horizontalSign +
            upX * halfHeight * verticalSign,
          y:
            camera.target.y +
            normalizedRightY * halfWidth * horizontalSign +
            upY * halfHeight * verticalSign,
          z:
            camera.target.z +
            normalizedRightZ * halfWidth * horizontalSign +
            upZ * halfHeight * verticalSign,
        },
        extrema
      );
    }
  }

  const center = {
    x: extrema.minimumX * 0.5 + extrema.maximumX * 0.5,
    y: extrema.minimumY * 0.5 + extrema.maximumY * 0.5,
    z: extrema.minimumZ * 0.5 + extrema.maximumZ * 0.5,
  };
  const halfExtents = {
    x: (extrema.maximumX - extrema.minimumX) * 0.5,
    y: (extrema.maximumY - extrema.minimumY) * 0.5,
    z: (extrema.maximumZ - extrema.minimumZ) * 0.5,
  };

  assertFinitePoint(center, "Requested grid center");
  assertFinitePoint(halfExtents, "Requested grid half extents");

  return Object.freeze({
    minimum: Object.freeze({
      x: extrema.minimumX,
      y: extrema.minimumY,
      z: extrema.minimumZ,
    }),
    maximum: Object.freeze({
      x: extrema.maximumX,
      y: extrema.maximumY,
      z: extrema.maximumZ,
    }),
    center: Object.freeze(center),
    halfExtents: Object.freeze(halfExtents),
  });
}

function chunkRange(
  minimum: number,
  maximum: number,
  chunkSize: number
): Readonly<{ minimum: number; maximum: number; count: number }> {
  const minimumIndex = Math.floor(minimum / chunkSize);
  const maximumIndex = Math.max(
    minimumIndex,
    Math.ceil(maximum / chunkSize) - 1
  );
  const count = maximumIndex - minimumIndex + 1;

  return { minimum: minimumIndex, maximum: maximumIndex, count };
}

function rangesAtLod(bounds: PotentialGridBounds, lod: number) {
  const chunkSize = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 2 ** lod;
  const x = chunkRange(bounds.minimum.x, bounds.maximum.x, chunkSize);
  const y = chunkRange(bounds.minimum.y, bounds.maximum.y, chunkSize);
  const z = chunkRange(bounds.minimum.z, bounds.maximum.z, chunkSize);

  return {
    chunkSize,
    x,
    y,
    z,
    count: x.count * y.count * z.count,
  };
}

function denseRangesAtLod(bounds: PotentialGridBounds, lod: number) {
  const ranges = rangesAtLod(bounds, lod);
  const expand = (
    range: Readonly<{ minimum: number; maximum: number; count: number }>,
    center: number
  ) => {
    if (range.count > 1) {
      return range;
    }

    const chunkMinimum = range.minimum * ranges.chunkSize;
    const expandBelow = center - chunkMinimum <= ranges.chunkSize * 0.5;
    return expandBelow
      ? { minimum: range.minimum - 1, maximum: range.maximum, count: 2 }
      : { minimum: range.minimum, maximum: range.maximum + 1, count: 2 };
  };
  const x = expand(ranges.x, bounds.center.x);
  const y = expand(ranges.y, bounds.center.y);
  const z = expand(ranges.z, bounds.center.z);

  return {
    chunkSize: ranges.chunkSize,
    x,
    y,
    z,
    count: x.count * y.count * z.count,
  };
}

function paddedRangesAtLod(bounds: PotentialGridBounds, lod: number) {
  const ranges = rangesAtLod(bounds, lod);
  const expand = (
    range: Readonly<{ minimum: number; maximum: number; count: number }>
  ) => ({
    minimum: range.minimum - GRAVITY_GRID_COVERAGE_PADDING_CHUNKS,
    maximum: range.maximum + GRAVITY_GRID_COVERAGE_PADDING_CHUNKS,
    count: range.count + GRAVITY_GRID_COVERAGE_PADDING_CHUNKS * 2,
  });
  const x = expand(ranges.x);
  const y = expand(ranges.y);
  const z = expand(ranges.z);

  return {
    chunkSize: ranges.chunkSize,
    x,
    y,
    z,
    count: x.count * y.count * z.count,
  };
}

function rangesUseSafeIndices(
  ranges: ReturnType<typeof rangesAtLod>
): boolean {
  return [ranges.x, ranges.y, ranges.z].every(
    (range) =>
      Number.isSafeInteger(range.minimum) &&
      Number.isSafeInteger(range.maximum)
  );
}

function appendChunks(
  target: GravityGridChunk[],
  ranges: ReturnType<typeof rangesAtLod>,
  lod: number
): void {
  for (let x = ranges.x.minimum; x <= ranges.x.maximum; x += 1) {
    for (let y = ranges.y.minimum; y <= ranges.y.maximum; y += 1) {
      for (let z = ranges.z.minimum; z <= ranges.z.maximum; z += 1) {
        target.push(Object.freeze({ x, y, z, lod }));
      }
    }
  }
}

function boundsForRanges(
  ranges: ReturnType<typeof rangesAtLod>
): PotentialGridBounds {
  const minimum = {
    x: ranges.x.minimum * ranges.chunkSize,
    y: ranges.y.minimum * ranges.chunkSize,
    z: ranges.z.minimum * ranges.chunkSize,
  };
  const maximum = {
    x: (ranges.x.maximum + 1) * ranges.chunkSize,
    y: (ranges.y.maximum + 1) * ranges.chunkSize,
    z: (ranges.z.maximum + 1) * ranges.chunkSize,
  };
  const center = {
    x: minimum.x * 0.5 + maximum.x * 0.5,
    y: minimum.y * 0.5 + maximum.y * 0.5,
    z: minimum.z * 0.5 + maximum.z * 0.5,
  };
  const halfExtents = {
    x: (maximum.x - minimum.x) * 0.5,
    y: (maximum.y - minimum.y) * 0.5,
    z: (maximum.z - minimum.z) * 0.5,
  };

  return Object.freeze({
    minimum: Object.freeze(minimum),
    maximum: Object.freeze(maximum),
    center: Object.freeze(center),
    halfExtents: Object.freeze(halfExtents),
  });
}

export function calculateGravityGridCoverage(
  systemBounds: PotentialGridBounds,
  camera: GravityGridCameraCoverage
): GravityGridCoverage {
  const requestedBounds = requestedCoverageBounds(systemBounds, camera);
  let denseLod = 0;
  let denseRanges = denseRangesAtLod(systemBounds, denseLod);

  while (
    (!rangesUseSafeIndices(denseRanges) ||
      denseRanges.count > GRAVITY_GRID_MAX_DENSE_CHUNKS) &&
    Number.isFinite(denseRanges.chunkSize * 2)
  ) {
    denseLod += 1;
    denseRanges = denseRangesAtLod(systemBounds, denseLod);
  }

  let outerLod = denseLod;
  let outerRanges = paddedRangesAtLod(requestedBounds, outerLod);
  let usesSeparateDenseChunks = false;

  while (
    (!rangesUseSafeIndices(outerRanges) ||
      outerRanges.count +
        (outerLod > denseLod ? denseRanges.count : 0) >
        GRAVITY_GRID_MAX_CHUNKS) &&
    Number.isFinite(outerRanges.chunkSize * 2)
  ) {
    outerLod += 1;
    outerRanges = paddedRangesAtLod(requestedBounds, outerLod);
  }

  usesSeparateDenseChunks = outerLod > denseLod;
  const chunkCount =
    outerRanges.count +
    (usesSeparateDenseChunks ? denseRanges.count : 0);

  if (!Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > GRAVITY_GRID_MAX_CHUNKS) {
    throw new RangeError(
      "The requested grid coverage cannot fit within the bounded chunk budget."
    );
  }

  const chunks: GravityGridChunk[] = [];

  if (usesSeparateDenseChunks) {
    appendChunks(chunks, denseRanges, denseLod);
  }

  appendChunks(chunks, outerRanges, outerLod);

  const key = [
    denseLod,
    denseRanges.x.minimum,
    denseRanges.x.maximum,
    denseRanges.y.minimum,
    denseRanges.y.maximum,
    denseRanges.z.minimum,
    denseRanges.z.maximum,
    outerLod,
    outerRanges.x.minimum,
    outerRanges.x.maximum,
    outerRanges.y.minimum,
    outerRanges.y.maximum,
    outerRanges.z.minimum,
    outerRanges.z.maximum,
  ].join(":");

  return Object.freeze({
    key,
    outerLod,
    denseLod,
    denseBounds: boundsForRanges(denseRanges),
    chunks: Object.freeze(chunks),
    requestedBounds,
    vertexCount: chunks.length * GRAVITY_GRID_VERTICES_PER_CHUNK,
  });
}

export function createGravityGridCoverageAnchor(
  camera: GravityGridCameraCoverage
): GravityGridCoverageAnchor {
  return Object.freeze({
    cameraPosition: Object.freeze({ ...camera.position }),
    cameraTarget: Object.freeze({ ...camera.target }),
    verticalFieldOfViewRadians: camera.verticalFieldOfViewRadians,
    aspectRatio: camera.aspectRatio,
  });
}

export function gravityGridCoverageNeedsUpdate(
  anchor: GravityGridCoverageAnchor,
  camera: GravityGridCameraCoverage
): boolean {
  return (
    Math.hypot(
      camera.position.x - anchor.cameraPosition.x,
      camera.position.y - anchor.cameraPosition.y,
      camera.position.z - anchor.cameraPosition.z
    ) >= GRAVITY_GRID_COVERAGE_RECALCULATION_DISTANCE_SCENE ||
    Math.hypot(
      camera.target.x - anchor.cameraTarget.x,
      camera.target.y - anchor.cameraTarget.y,
      camera.target.z - anchor.cameraTarget.z
    ) >= GRAVITY_GRID_COVERAGE_RECALCULATION_DISTANCE_SCENE ||
    camera.verticalFieldOfViewRadians !==
      anchor.verticalFieldOfViewRadians ||
    camera.aspectRatio !== anchor.aspectRatio
  );
}

export function gravityGridCoverageUpdateRequired(
  visible: boolean,
  anchor: GravityGridCoverageAnchor | null,
  camera: GravityGridCameraCoverage
): boolean {
  return (
    visible &&
    (anchor === null || gravityGridCoverageNeedsUpdate(anchor, camera))
  );
}

export function gravityGridChunkBounds(
  chunk: GravityGridChunk
): PotentialGridBounds {
  if (!Number.isSafeInteger(chunk.lod) || chunk.lod < 0) {
    throw new RangeError("Gravity-grid LOD must be a non-negative integer.");
  }

  const size = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 2 ** chunk.lod;
  const minimum = {
    x: chunk.x * size,
    y: chunk.y * size,
    z: chunk.z * size,
  };
  const maximum = {
    x: minimum.x + size,
    y: minimum.y + size,
    z: minimum.z + size,
  };
  const center = {
    x: minimum.x + size * 0.5,
    y: minimum.y + size * 0.5,
    z: minimum.z + size * 0.5,
  };
  const halfExtents = { x: size * 0.5, y: size * 0.5, z: size * 0.5 };

  assertFinitePoint(minimum, "Gravity-grid chunk minimum");
  assertFinitePoint(maximum, "Gravity-grid chunk maximum");

  return Object.freeze({
    minimum: Object.freeze(minimum),
    maximum: Object.freeze(maximum),
    center: Object.freeze(center),
    halfExtents: Object.freeze(halfExtents),
  });
}

export function calculateGravityGridLodVisibility(
  point: RenderedCameraPoint,
  lod: number,
  coverage: GravityGridCoverage
): number {
  assertFinitePoint(point, "Gravity-grid LOD sample");

  if (!Number.isSafeInteger(lod) || lod < 0) {
    throw new RangeError("Gravity-grid LOD must be a non-negative integer.");
  }

  if (lod <= coverage.denseLod) {
    return 1;
  }

  const outsideX = Math.max(
    coverage.denseBounds.minimum.x - point.x,
    point.x - coverage.denseBounds.maximum.x,
    0
  );
  const outsideY = Math.max(
    coverage.denseBounds.minimum.y - point.y,
    point.y - coverage.denseBounds.maximum.y,
    0
  );
  const outsideZ = Math.max(
    coverage.denseBounds.minimum.z - point.z,
    point.z - coverage.denseBounds.maximum.z,
    0
  );
  const distance = Math.hypot(outsideX, outsideY, outsideZ);
  const fadeDistance =
    GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 2 ** coverage.denseLod;
  const normalized = Math.min(1, Math.max(0, distance / fadeDistance));
  return normalized * normalized * (3 - 2 * normalized);
}

export function writeGravityGridChunkPositions(
  coverage: GravityGridCoverage,
  target: Float32Array,
  lodTarget?: Float32Array
): number {
  if (target.length < GRAVITY_GRID_MAX_CHUNK_VERTICES * 3) {
    throw new RangeError(
      "The reusable gravity-grid buffer is smaller than the explicit vertex budget."
    );
  }

  if (
    lodTarget !== undefined &&
    lodTarget.length < GRAVITY_GRID_MAX_CHUNK_VERTICES
  ) {
    throw new RangeError(
      "The reusable gravity-grid LOD buffer is smaller than the explicit vertex budget."
    );
  }

  const intervals = GRAVITY_GRID_CHUNK_INTERVALS;
  let offset = 0;
  const writePoint = (x: number, y: number, z: number, lod: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new RangeError(
        "Gravity-grid chunk coordinates must remain finite."
      );
    }

    target[offset] = x;
    target[offset + 1] = y;
    target[offset + 2] = z;

    if (lodTarget !== undefined) {
      lodTarget[offset / 3] = lod;
    }

    if (
      !Number.isFinite(target[offset]) ||
      !Number.isFinite(target[offset + 1]) ||
      !Number.isFinite(target[offset + 2])
    ) {
      throw new RangeError(
        "Gravity-grid chunk coordinates must remain representable on the GPU."
      );
    }

    offset += 3;
  };

  for (const chunk of coverage.chunks) {
    const spacing =
      GRAVITY_GRID_TARGET_LINE_SPACING_SCENE * 2 ** chunk.lod;
    const size = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 2 ** chunk.lod;
    const minimumX = chunk.x * size;
    const minimumY = chunk.y * size;
    const minimumZ = chunk.z * size;

    for (let first = 0; first < intervals; first += 1) {
      for (let second = 0; second < intervals; second += 1) {
        const transverseFirst = first * spacing;
        const transverseSecond = second * spacing;

        for (let segment = 0; segment < intervals; segment += 1) {
          const start = segment * spacing;
          const end = (segment + 1) * spacing;

          writePoint(
            minimumX + start,
            minimumY + transverseFirst,
            minimumZ + transverseSecond,
            chunk.lod
          );
          writePoint(
            minimumX + end,
            minimumY + transverseFirst,
            minimumZ + transverseSecond,
            chunk.lod
          );
          writePoint(
            minimumX + transverseFirst,
            minimumY + start,
            minimumZ + transverseSecond,
            chunk.lod
          );
          writePoint(
            minimumX + transverseFirst,
            minimumY + end,
            minimumZ + transverseSecond,
            chunk.lod
          );
          writePoint(
            minimumX + transverseFirst,
            minimumY + transverseSecond,
            minimumZ + start,
            chunk.lod
          );
          writePoint(
            minimumX + transverseFirst,
            minimumY + transverseSecond,
            minimumZ + end,
            chunk.lod
          );
        }
      }
    }
  }

  return offset / 3;
}
