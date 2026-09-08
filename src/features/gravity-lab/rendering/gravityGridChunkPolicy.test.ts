import { describe, expect, it } from "vitest";

import type { PotentialGridBounds } from "./gravityPotentialGridPolicy";
import {
  GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE,
  GRAVITY_GRID_MAX_CHUNKS,
  GRAVITY_GRID_MAX_CHUNK_VERTICES,
  GRAVITY_GRID_MAX_DRAW_CALLS,
  GRAVITY_GRID_TARGET_PROJECTED_LINE_SPACING_PIXELS,
  calculateGravityGridCoverage,
  calculateGravityGridProjectedSpacingPixels,
  createGravityGridCoverageAnchor,
  gravityGridChunkBounds,
  gravityGridChunksShareFace,
  gravityGridCoverageUpdateRequired,
  writeGravityGridChunkPositions,
  type GravityGridCameraCoverage,
  type GravityGridCoverage,
} from "./gravityGridChunkPolicy";

function bounds(
  minimum: Readonly<{ x: number; y: number; z: number }>,
  maximum: Readonly<{ x: number; y: number; z: number }>
): PotentialGridBounds {
  return {
    minimum,
    maximum,
    center: {
      x: minimum.x * 0.5 + maximum.x * 0.5,
      y: minimum.y * 0.5 + maximum.y * 0.5,
      z: minimum.z * 0.5 + maximum.z * 0.5,
    },
    halfExtents: {
      x: (maximum.x - minimum.x) * 0.5,
      y: (maximum.y - minimum.y) * 0.5,
      z: (maximum.z - minimum.z) * 0.5,
    },
  };
}

const compactSystem = bounds(
  { x: -10, y: -10, z: -10 },
  { x: 10, y: 10, z: 10 }
);

function cameraAt(
  z: number,
  overrides: Partial<GravityGridCameraCoverage> = {}
): GravityGridCameraCoverage {
  return {
    position: { x: 0, y: 0, z },
    target: { x: 0, y: 0, z: 0 },
    verticalFieldOfViewRadians: (46 * Math.PI) / 180,
    aspectRatio: 16 / 9,
    viewportHeightPixels: 720,
    ...overrides,
  };
}

function aggregateBounds(coverage: GravityGridCoverage) {
  const first = gravityGridChunkBounds(coverage.chunks[0]);
  const aggregate = {
    minimum: { ...first.minimum },
    maximum: { ...first.maximum },
  };
  for (const chunk of coverage.chunks.slice(1)) {
    const current = gravityGridChunkBounds(chunk);
    aggregate.minimum.x = Math.min(aggregate.minimum.x, current.minimum.x);
    aggregate.minimum.y = Math.min(aggregate.minimum.y, current.minimum.y);
    aggregate.minimum.z = Math.min(aggregate.minimum.z, current.minimum.z);
    aggregate.maximum.x = Math.max(aggregate.maximum.x, current.maximum.x);
    aggregate.maximum.y = Math.max(aggregate.maximum.y, current.maximum.y);
    aggregate.maximum.z = Math.max(aggregate.maximum.z, current.maximum.z);
  }
  return aggregate;
}

function minimumDistanceSquared(
  point: Readonly<{ x: number; y: number; z: number }>,
  chunk: GravityGridCoverage["chunks"][number]
): number {
  const center = gravityGridChunkBounds(chunk).center;
  return (
    (center.x - point.x) ** 2 +
    (center.y - point.y) ** 2 +
    (center.z - point.z) ** 2
  );
}

describe("camera-projected gravity-grid LOD policy", () => {
  it("covers the system and the camera view with one non-overlapping leaf partition", () => {
    const coverage = calculateGravityGridCoverage(compactSystem, cameraAt(30));
    const aggregate = aggregateBounds(coverage);

    expect(aggregate.minimum.x).toBeLessThanOrEqual(coverage.requestedBounds.minimum.x);
    expect(aggregate.minimum.y).toBeLessThanOrEqual(coverage.requestedBounds.minimum.y);
    expect(aggregate.minimum.z).toBeLessThanOrEqual(coverage.requestedBounds.minimum.z);
    expect(aggregate.maximum.x).toBeGreaterThanOrEqual(coverage.requestedBounds.maximum.x);
    expect(aggregate.maximum.y).toBeGreaterThanOrEqual(coverage.requestedBounds.maximum.y);
    expect(aggregate.maximum.z).toBeGreaterThanOrEqual(coverage.requestedBounds.maximum.z);
    expect(new Set(coverage.chunks.map(({ x, y, z, lod }) => `${lod}:${x}:${y}:${z}`)).size).toBe(coverage.chunks.length);
  });

  it("selects detail from camera projection rather than a fixed dense system box", () => {
    const displacedSystem = bounds(
      { x: 75, y: -2, z: -2 },
      { x: 79, y: 2, z: 2 }
    );
    const camera = cameraAt(24, { target: { x: 0, y: 0, z: 0 } });
    const coverage = calculateGravityGridCoverage(displacedSystem, camera);
    const nearestCamera = [...coverage.chunks].sort(
      (a, b) => minimumDistanceSquared(camera.position, a) - minimumDistanceSquared(camera.position, b)
    )[0];
    const nearestSystem = [...coverage.chunks].sort(
      (a, b) => minimumDistanceSquared(displacedSystem.center, a) - minimumDistanceSquared(displacedSystem.center, b)
    )[0];

    expect(nearestCamera.lod).toBeLessThanOrEqual(nearestSystem.lod);
  });

  it("is deterministic for identical camera and region inputs", () => {
    const first = calculateGravityGridCoverage(compactSystem, cameraAt(40));
    const second = calculateGravityGridCoverage(compactSystem, cameraAt(40));
    expect(second.key).toBe(first.key);
    expect(second.chunks).toEqual(first.chunks);
  });

  it("keeps face-adjacent leaves within one LOD level", () => {
    const coverage = calculateGravityGridCoverage(compactSystem, cameraAt(60));
    for (let first = 0; first < coverage.chunks.length; first += 1) {
      for (let second = first + 1; second < coverage.chunks.length; second += 1) {
        if (gravityGridChunksShareFace(coverage.chunks[first], coverage.chunks[second])) {
          expect(Math.abs(coverage.chunks[first].lod - coverage.chunks[second].lod)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("changes zoom detail progressively rather than jumping several levels", () => {
    const coverages = [34, 38, 42, 46].map((distance) =>
      calculateGravityGridCoverage(compactSystem, cameraAt(distance))
    );
    for (let index = 1; index < coverages.length; index += 1) {
      expect(Math.abs(coverages[index].minimumLod - coverages[index - 1].minimumLod)).toBeLessThanOrEqual(1);
      expect(Math.abs(coverages[index].maximumLod - coverages[index - 1].maximumLod)).toBeLessThanOrEqual(1);
    }
  });

  it("uses camera pan to redistribute detail", () => {
    const first = calculateGravityGridCoverage(compactSystem, cameraAt(45));
    const panned = cameraAt(45, {
      position: { x: 24, y: 0, z: 45 },
      target: { x: 24, y: 0, z: 0 },
    });
    const second = calculateGravityGridCoverage(compactSystem, panned);
    expect(second.key).not.toBe(first.key);
  });

  it("keeps coverage stable for sub-threshold camera motion", () => {
    const initial = cameraAt(40);
    const anchor = createGravityGridCoverageAnchor(initial);
    expect(
      gravityGridCoverageUpdateRequired(true, anchor, cameraAt(40.1))
    ).toBe(false);
    expect(
      gravityGridCoverageUpdateRequired(true, anchor, cameraAt(44))
    ).toBe(true);
    expect(gravityGridCoverageUpdateRequired(false, anchor, cameraAt(80))).toBe(false);
  });

  it("keeps projected detail dense until the bounded budget prevents refinement", () => {
    const coverage = calculateGravityGridCoverage(compactSystem, cameraAt(30));
    const overTarget = coverage.chunks.filter(
      (chunk) =>
        chunk.lod > 0 &&
        calculateGravityGridProjectedSpacingPixels(chunk, cameraAt(30)) >
          GRAVITY_GRID_TARGET_PROJECTED_LINE_SPACING_PIXELS
    );
    expect(coverage.chunks.length).toBeLessThanOrEqual(GRAVITY_GRID_MAX_CHUNKS);
    if (overTarget.length > 0) {
      expect(coverage.chunks.length + 7).toBeGreaterThan(GRAVITY_GRID_MAX_CHUNKS);
    }
  });

  it("respects the strict chunk, vertex and draw-call budgets on a large zoom-out", () => {
    const huge = bounds(
      { x: -1e6, y: -5e5, z: -2e5 },
      { x: 1e6, y: 5e5, z: 2e5 }
    );
    const coverage = calculateGravityGridCoverage(huge, cameraAt(3e6));
    expect(coverage.chunks.length).toBeLessThanOrEqual(GRAVITY_GRID_MAX_CHUNKS);
    expect(coverage.vertexCount).toBeLessThanOrEqual(GRAVITY_GRID_MAX_CHUNK_VERTICES);
    expect(GRAVITY_GRID_MAX_DRAW_CALLS).toBe(1);
  });

  it("keeps all chunk lines aligned to the immutable world lattice", () => {
    const coverage = calculateGravityGridCoverage(compactSystem, cameraAt(35));
    for (const chunk of coverage.chunks) {
      const chunkBounds = gravityGridChunkBounds(chunk);
      const size = GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE * 2 ** chunk.lod;
      expect(chunkBounds.minimum.x / size).toBe(chunk.x);
      expect(chunkBounds.minimum.y / size).toBe(chunk.y);
      expect(chunkBounds.minimum.z / size).toBe(chunk.z);
    }
  });

  it("writes finite geometry into the reusable maximum-sized GPU buffer", () => {
    const coverage = calculateGravityGridCoverage(compactSystem, cameraAt(50));
    const target = new Float32Array(GRAVITY_GRID_MAX_CHUNK_VERTICES * 3);
    const vertexCount = writeGravityGridChunkPositions(coverage, target);
    expect(vertexCount).toBe(coverage.vertexCount);
    expect([...target.subarray(0, vertexCount * 3)].every(Number.isFinite)).toBe(true);
  });
});
