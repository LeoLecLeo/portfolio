import type { RenderedCameraPoint } from "./cameraFraming";
import { GRAVITY_GRID_TARGET_LINE_SPACING_SCENE, type PotentialGridBounds } from "./gravityPotentialGridPolicy";

export { GRAVITY_GRID_TARGET_LINE_SPACING_SCENE } from "./gravityPotentialGridPolicy";

export const GRAVITY_GRID_CHUNK_INTERVALS = 6;
export const GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE = GRAVITY_GRID_TARGET_LINE_SPACING_SCENE * GRAVITY_GRID_CHUNK_INTERVALS;
export const GRAVITY_GRID_TARGET_PROJECTED_LINE_SPACING_PIXELS = 12;
export const GRAVITY_GRID_MAX_CHUNKS = 72;
export const GRAVITY_GRID_MAX_ROOT_CHUNKS = 8;
export const GRAVITY_GRID_COVERAGE_PADDING_SCENE = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE;
export const GRAVITY_GRID_COVERAGE_RECALCULATION_DISTANCE_SCENE = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 0.5;
export const GRAVITY_GRID_MIN_RECALCULATION_DISTANCE_SCENE = 0.35;
export const GRAVITY_GRID_CAMERA_DISTANCE_RECALCULATION_RATIO = 0.08;
export const GRAVITY_GRID_LINES_PER_CHUNK = 3 * GRAVITY_GRID_CHUNK_INTERVALS ** 2;
export const GRAVITY_GRID_VERTICES_PER_CHUNK = GRAVITY_GRID_LINES_PER_CHUNK * GRAVITY_GRID_CHUNK_INTERVALS * 2;
export const GRAVITY_GRID_MAX_CHUNK_VERTICES = GRAVITY_GRID_MAX_CHUNKS * GRAVITY_GRID_VERTICES_PER_CHUNK;
export const GRAVITY_GRID_MAX_DRAW_CALLS = 1;

export type GravityGridCameraCoverage = Readonly<{
  position: RenderedCameraPoint;
  target: RenderedCameraPoint;
  verticalFieldOfViewRadians: number;
  aspectRatio: number;
  viewportHeightPixels: number;
}>;
export type GravityGridChunk = Readonly<{ x: number; y: number; z: number; lod: number }>;
export type GravityGridCoverage = Readonly<{
  key: string;
  rootLod: number;
  minimumLod: number;
  maximumLod: number;
  chunks: readonly GravityGridChunk[];
  requestedBounds: PotentialGridBounds;
  vertexCount: number;
}>;
export type GravityGridCoverageAnchor = Readonly<{
  cameraPosition: RenderedCameraPoint;
  cameraTarget: RenderedCameraPoint;
  verticalFieldOfViewRadians: number;
  aspectRatio: number;
  viewportHeightPixels: number;
}>;
type ChunkRange = Readonly<{ minimum: number; maximum: number; count: number }>;
type ChunkRanges = Readonly<{ chunkSize: number; x: ChunkRange; y: ChunkRange; z: ChunkRange; count: number }>;

function assertFinitePoint(point: RenderedCameraPoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
    throw new RangeError(`${label} must contain finite coordinates.`);
  }
}

function freezeBounds(minimum: RenderedCameraPoint, maximum: RenderedCameraPoint): PotentialGridBounds {
  const center = { x: minimum.x * 0.5 + maximum.x * 0.5, y: minimum.y * 0.5 + maximum.y * 0.5, z: minimum.z * 0.5 + maximum.z * 0.5 };
  const halfExtents = { x: (maximum.x - minimum.x) * 0.5, y: (maximum.y - minimum.y) * 0.5, z: (maximum.z - minimum.z) * 0.5 };
  assertFinitePoint(center, "Grid bounds center");
  assertFinitePoint(halfExtents, "Grid bounds half extents");
  return Object.freeze({ minimum: Object.freeze(minimum), maximum: Object.freeze(maximum), center: Object.freeze(center), halfExtents: Object.freeze(halfExtents) });
}

function includePoint(point: RenderedCameraPoint, extrema: { minimumX: number; minimumY: number; minimumZ: number; maximumX: number; maximumY: number; maximumZ: number }): void {
  extrema.minimumX = Math.min(extrema.minimumX, point.x);
  extrema.minimumY = Math.min(extrema.minimumY, point.y);
  extrema.minimumZ = Math.min(extrema.minimumZ, point.z);
  extrema.maximumX = Math.max(extrema.maximumX, point.x);
  extrema.maximumY = Math.max(extrema.maximumY, point.y);
  extrema.maximumZ = Math.max(extrema.maximumZ, point.z);
}

function requestedCoverageBounds(systemBounds: PotentialGridBounds, camera: GravityGridCameraCoverage): PotentialGridBounds {
  assertFinitePoint(systemBounds.minimum, "System bounds minimum");
  assertFinitePoint(systemBounds.maximum, "System bounds maximum");
  assertFinitePoint(camera.position, "Grid camera position");
  assertFinitePoint(camera.target, "Grid camera target");
  if (!Number.isFinite(camera.verticalFieldOfViewRadians) || camera.verticalFieldOfViewRadians <= 0 || camera.verticalFieldOfViewRadians >= Math.PI) {
    throw new RangeError("Grid camera field of view must be finite and between zero and pi.");
  }
  if (!Number.isFinite(camera.aspectRatio) || camera.aspectRatio <= 0) {
    throw new RangeError("Grid camera aspect ratio must be finite and strictly positive.");
  }
  if (!Number.isFinite(camera.viewportHeightPixels) || camera.viewportHeightPixels <= 0) {
    throw new RangeError("Grid camera viewport height must be finite and strictly positive.");
  }

  const direction = { x: camera.target.x - camera.position.x, y: camera.target.y - camera.position.y, z: camera.target.z - camera.position.z };
  const distance = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new RangeError("Grid camera position and target must define a finite view direction.");
  }
  const forward = { x: direction.x / distance, y: direction.y / distance, z: direction.z / distance };
  const reference = Math.abs(forward.y) < 0.95 ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const right = { x: -forward.z * reference.y, y: forward.z * reference.x, z: forward.x * reference.y - forward.y * reference.x };
  const rightLength = Math.hypot(right.x, right.y, right.z);
  const normalizedRight = { x: right.x / rightLength, y: right.y / rightLength, z: right.z / rightLength };
  const up = {
    x: normalizedRight.y * forward.z - normalizedRight.z * forward.y,
    y: normalizedRight.z * forward.x - normalizedRight.x * forward.z,
    z: normalizedRight.x * forward.y - normalizedRight.y * forward.x,
  };
  const halfHeight = distance * Math.tan(camera.verticalFieldOfViewRadians * 0.5);
  const halfWidth = halfHeight * camera.aspectRatio;
  const extrema = {
    minimumX: systemBounds.minimum.x, minimumY: systemBounds.minimum.y, minimumZ: systemBounds.minimum.z,
    maximumX: systemBounds.maximum.x, maximumY: systemBounds.maximum.y, maximumZ: systemBounds.maximum.z,
  };
  includePoint(camera.position, extrema);
  includePoint(camera.target, extrema);
  for (const horizontalSign of [-1, 1]) {
    for (const verticalSign of [-1, 1]) {
      includePoint({
        x: camera.target.x + normalizedRight.x * halfWidth * horizontalSign + up.x * halfHeight * verticalSign,
        y: camera.target.y + normalizedRight.y * halfWidth * horizontalSign + up.y * halfHeight * verticalSign,
        z: camera.target.z + normalizedRight.z * halfWidth * horizontalSign + up.z * halfHeight * verticalSign,
      }, extrema);
    }
  }
  return freezeBounds(
    { x: extrema.minimumX, y: extrema.minimumY, z: extrema.minimumZ },
    { x: extrema.maximumX, y: extrema.maximumY, z: extrema.maximumZ }
  );
}

function paddedCoverageBounds(bounds: PotentialGridBounds): PotentialGridBounds {
  const padding = GRAVITY_GRID_COVERAGE_PADDING_SCENE;
  return freezeBounds(
    { x: bounds.minimum.x - padding, y: bounds.minimum.y - padding, z: bounds.minimum.z - padding },
    { x: bounds.maximum.x + padding, y: bounds.maximum.y + padding, z: bounds.maximum.z + padding }
  );
}

function chunkRange(minimum: number, maximum: number, chunkSize: number): ChunkRange {
  const minimumIndex = Math.floor(minimum / chunkSize);
  const maximumIndex = Math.max(minimumIndex, Math.ceil(maximum / chunkSize) - 1);
  return { minimum: minimumIndex, maximum: maximumIndex, count: maximumIndex - minimumIndex + 1 };
}

function rangesAtLod(bounds: PotentialGridBounds, lod: number): ChunkRanges {
  const chunkSize = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 2 ** lod;
  const x = chunkRange(bounds.minimum.x, bounds.maximum.x, chunkSize);
  const y = chunkRange(bounds.minimum.y, bounds.maximum.y, chunkSize);
  const z = chunkRange(bounds.minimum.z, bounds.maximum.z, chunkSize);
  return { chunkSize, x, y, z, count: x.count * y.count * z.count };
}

function rangesUseSafeIndices(ranges: ChunkRanges): boolean {
  return [ranges.x, ranges.y, ranges.z].every((range) => Number.isSafeInteger(range.minimum) && Number.isSafeInteger(range.maximum));
}

function appendChunks(target: GravityGridChunk[], ranges: ChunkRanges, lod: number): void {
  for (let x = ranges.x.minimum; x <= ranges.x.maximum; x += 1) {
    for (let y = ranges.y.minimum; y <= ranges.y.maximum; y += 1) {
      for (let z = ranges.z.minimum; z <= ranges.z.maximum; z += 1) {
        target.push(Object.freeze({ x, y, z, lod }));
      }
    }
  }
}

export function gravityGridChunkBounds(chunk: GravityGridChunk): PotentialGridBounds {
  if (!Number.isSafeInteger(chunk.lod) || chunk.lod < 0) throw new RangeError("Gravity-grid LOD must be a non-negative integer.");
  const size = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 2 ** chunk.lod;
  const minimum = { x: chunk.x * size, y: chunk.y * size, z: chunk.z * size };
  const maximum = { x: minimum.x + size, y: minimum.y + size, z: minimum.z + size };
  assertFinitePoint(minimum, "Gravity-grid chunk minimum");
  assertFinitePoint(maximum, "Gravity-grid chunk maximum");
  return freezeBounds(minimum, maximum);
}

function distanceToBounds(point: RenderedCameraPoint, bounds: PotentialGridBounds): number {
  const dx = Math.max(bounds.minimum.x - point.x, point.x - bounds.maximum.x, 0);
  const dy = Math.max(bounds.minimum.y - point.y, point.y - bounds.maximum.y, 0);
  const dz = Math.max(bounds.minimum.z - point.z, point.z - bounds.maximum.z, 0);
  return Math.hypot(dx, dy, dz);
}

export function calculateGravityGridProjectedSpacingPixels(chunk: GravityGridChunk, camera: GravityGridCameraCoverage): number {
  const distance = Math.max(1, distanceToBounds(camera.position, gravityGridChunkBounds(chunk)));
  const visibleHeight = 2 * distance * Math.tan(camera.verticalFieldOfViewRadians * 0.5);
  const projected = GRAVITY_GRID_TARGET_LINE_SPACING_SCENE * 2 ** chunk.lod * camera.viewportHeightPixels / visibleHeight;
  return Number.isFinite(projected) ? projected : Number.MAX_VALUE;
}

function childChunks(chunk: GravityGridChunk): GravityGridChunk[] {
  const children: GravityGridChunk[] = [];
  for (let x = 0; x < 2; x += 1) for (let y = 0; y < 2; y += 1) for (let z = 0; z < 2; z += 1) {
    children.push(Object.freeze({ x: chunk.x * 2 + x, y: chunk.y * 2 + y, z: chunk.z * 2 + z, lod: chunk.lod - 1 }));
  }
  return children;
}

function intervalsOverlap(minA: number, maxA: number, minB: number, maxB: number, epsilon: number): boolean {
  return Math.min(maxA, maxB) - Math.max(minA, minB) > epsilon;
}

function boundariesMatch(first: number, second: number, epsilon: number): boolean {
  return Math.abs(first - second) <= epsilon;
}

export function gravityGridChunksShareFace(first: GravityGridChunk, second: GravityGridChunk): boolean {
  const a = gravityGridChunkBounds(first);
  const b = gravityGridChunkBounds(second);
  const coordinates = [a.minimum.x, a.maximum.x, a.minimum.y, a.maximum.y, a.minimum.z, a.maximum.z, b.minimum.x, b.maximum.x, b.minimum.y, b.maximum.y, b.minimum.z, b.maximum.z];
  const epsilon = Math.max(1, ...coordinates.map(Math.abs)) * Number.EPSILON * 16;
  const touchesX = boundariesMatch(a.maximum.x, b.minimum.x, epsilon) || boundariesMatch(b.maximum.x, a.minimum.x, epsilon);
  const touchesY = boundariesMatch(a.maximum.y, b.minimum.y, epsilon) || boundariesMatch(b.maximum.y, a.minimum.y, epsilon);
  const touchesZ = boundariesMatch(a.maximum.z, b.minimum.z, epsilon) || boundariesMatch(b.maximum.z, a.minimum.z, epsilon);
  return (
    (touchesX && intervalsOverlap(a.minimum.y, a.maximum.y, b.minimum.y, b.maximum.y, epsilon) && intervalsOverlap(a.minimum.z, a.maximum.z, b.minimum.z, b.maximum.z, epsilon)) ||
    (touchesY && intervalsOverlap(a.minimum.x, a.maximum.x, b.minimum.x, b.maximum.x, epsilon) && intervalsOverlap(a.minimum.z, a.maximum.z, b.minimum.z, b.maximum.z, epsilon)) ||
    (touchesZ && intervalsOverlap(a.minimum.x, a.maximum.x, b.minimum.x, b.maximum.x, epsilon) && intervalsOverlap(a.minimum.y, a.maximum.y, b.minimum.y, b.maximum.y, epsilon))
  );
}

function canRefineChunk(candidate: GravityGridChunk, chunks: readonly GravityGridChunk[]): boolean {
  const childLod = candidate.lod - 1;
  return childChunks(candidate).every((child) => chunks.every((other) =>
    other === candidate || !gravityGridChunksShareFace(child, other) || Math.abs(childLod - other.lod) <= 1
  ));
}

function compareChunks(first: GravityGridChunk, second: GravityGridChunk): number {
  return second.lod - first.lod || first.x - second.x || first.y - second.y || first.z - second.z;
}

export function calculateGravityGridCoverage(systemBounds: PotentialGridBounds, camera: GravityGridCameraCoverage): GravityGridCoverage {
  const requestedBounds = requestedCoverageBounds(systemBounds, camera);
  const paddedBounds = paddedCoverageBounds(requestedBounds);
  let rootLod = 0;
  let rootRanges = rangesAtLod(paddedBounds, rootLod);
  while ((!rangesUseSafeIndices(rootRanges) || rootRanges.count > GRAVITY_GRID_MAX_ROOT_CHUNKS) && Number.isFinite(rootRanges.chunkSize * 2)) {
    rootLod += 1;
    rootRanges = rangesAtLod(paddedBounds, rootLod);
  }
  if (!Number.isSafeInteger(rootRanges.count) || rootRanges.count < 1 || rootRanges.count > GRAVITY_GRID_MAX_ROOT_CHUNKS) {
    throw new RangeError("The requested grid coverage cannot fit within the bounded root budget.");
  }
  const chunks: GravityGridChunk[] = [];
  appendChunks(chunks, rootRanges, rootLod);
  while (chunks.length + 7 <= GRAVITY_GRID_MAX_CHUNKS) {
    const candidates = chunks.filter((chunk) => chunk.lod > 0 && calculateGravityGridProjectedSpacingPixels(chunk, camera) > GRAVITY_GRID_TARGET_PROJECTED_LINE_SPACING_PIXELS).sort((first, second) =>
      calculateGravityGridProjectedSpacingPixels(second, camera) - calculateGravityGridProjectedSpacingPixels(first, camera) || compareChunks(first, second)
    );
    const candidate = candidates.find((chunk) => canRefineChunk(chunk, chunks));
    if (candidate === undefined) break;
    chunks.splice(chunks.indexOf(candidate), 1, ...childChunks(candidate));
  }
  chunks.sort(compareChunks);
  const minimumLod = Math.min(...chunks.map(({ lod }) => lod));
  const maximumLod = Math.max(...chunks.map(({ lod }) => lod));
  const key = chunks.map(({ x, y, z, lod }) => `${lod},${x},${y},${z}`).join(":");
  return Object.freeze({ key, rootLod, minimumLod, maximumLod, chunks: Object.freeze(chunks), requestedBounds, vertexCount: chunks.length * GRAVITY_GRID_VERTICES_PER_CHUNK });
}

export function createGravityGridCoverageAnchor(camera: GravityGridCameraCoverage): GravityGridCoverageAnchor {
  return Object.freeze({ cameraPosition: Object.freeze({ ...camera.position }), cameraTarget: Object.freeze({ ...camera.target }), verticalFieldOfViewRadians: camera.verticalFieldOfViewRadians, aspectRatio: camera.aspectRatio, viewportHeightPixels: camera.viewportHeightPixels });
}

function recalculationDistance(anchor: GravityGridCoverageAnchor): number {
  const cameraDistance = Math.hypot(anchor.cameraPosition.x - anchor.cameraTarget.x, anchor.cameraPosition.y - anchor.cameraTarget.y, anchor.cameraPosition.z - anchor.cameraTarget.z);
  return Math.min(GRAVITY_GRID_COVERAGE_RECALCULATION_DISTANCE_SCENE, Math.max(GRAVITY_GRID_MIN_RECALCULATION_DISTANCE_SCENE, cameraDistance * GRAVITY_GRID_CAMERA_DISTANCE_RECALCULATION_RATIO));
}

export function gravityGridCoverageNeedsUpdate(anchor: GravityGridCoverageAnchor, camera: GravityGridCameraCoverage): boolean {
  const distance = recalculationDistance(anchor);
  return Math.hypot(camera.position.x - anchor.cameraPosition.x, camera.position.y - anchor.cameraPosition.y, camera.position.z - anchor.cameraPosition.z) >= distance ||
    Math.hypot(camera.target.x - anchor.cameraTarget.x, camera.target.y - anchor.cameraTarget.y, camera.target.z - anchor.cameraTarget.z) >= distance ||
    camera.verticalFieldOfViewRadians !== anchor.verticalFieldOfViewRadians || camera.aspectRatio !== anchor.aspectRatio || camera.viewportHeightPixels !== anchor.viewportHeightPixels;
}

export function gravityGridCoverageUpdateRequired(visible: boolean, anchor: GravityGridCoverageAnchor | null, camera: GravityGridCameraCoverage): boolean {
  return visible && (anchor === null || gravityGridCoverageNeedsUpdate(anchor, camera));
}

export function writeGravityGridChunkPositions(coverage: GravityGridCoverage, target: Float32Array, lodTarget?: Float32Array): number {
  if (target.length < GRAVITY_GRID_MAX_CHUNK_VERTICES * 3) throw new RangeError("The reusable gravity-grid buffer is smaller than the explicit vertex budget.");
  if (lodTarget !== undefined && lodTarget.length < GRAVITY_GRID_MAX_CHUNK_VERTICES) throw new RangeError("The reusable gravity-grid LOD buffer is smaller than the explicit vertex budget.");
  const intervals = GRAVITY_GRID_CHUNK_INTERVALS;
  let offset = 0;
  const writePoint = (x: number, y: number, z: number, lod: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new RangeError("Gravity-grid chunk coordinates must remain finite.");
    target[offset] = x; target[offset + 1] = y; target[offset + 2] = z;
    if (lodTarget !== undefined) lodTarget[offset / 3] = lod;
    if (!Number.isFinite(target[offset]) || !Number.isFinite(target[offset + 1]) || !Number.isFinite(target[offset + 2])) throw new RangeError("Gravity-grid chunk coordinates must remain representable on the GPU.");
    offset += 3;
  };
  for (const chunk of coverage.chunks) {
    const spacing = GRAVITY_GRID_TARGET_LINE_SPACING_SCENE * 2 ** chunk.lod;
    const size = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 2 ** chunk.lod;
    const minimumX = chunk.x * size; const minimumY = chunk.y * size; const minimumZ = chunk.z * size;
    for (let first = 0; first < intervals; first += 1) for (let second = 0; second < intervals; second += 1) {
      const transverseFirst = first * spacing; const transverseSecond = second * spacing;
      for (let segment = 0; segment < intervals; segment += 1) {
        const start = segment * spacing; const end = (segment + 1) * spacing;
        writePoint(minimumX + start, minimumY + transverseFirst, minimumZ + transverseSecond, chunk.lod);
        writePoint(minimumX + end, minimumY + transverseFirst, minimumZ + transverseSecond, chunk.lod);
        writePoint(minimumX + transverseFirst, minimumY + start, minimumZ + transverseSecond, chunk.lod);
        writePoint(minimumX + transverseFirst, minimumY + end, minimumZ + transverseSecond, chunk.lod);
        writePoint(minimumX + transverseFirst, minimumY + transverseSecond, minimumZ + start, chunk.lod);
        writePoint(minimumX + transverseFirst, minimumY + transverseSecond, minimumZ + end, chunk.lod);
      }
    }
  }
  return offset / 3;
}
