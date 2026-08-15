import { describe, expect, it } from "vitest";

import type { PotentialGridBounds } from "./gravityPotentialGridPolicy";
import {
  GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE,
  GRAVITY_GRID_CHUNK_INTERVALS,
  GRAVITY_GRID_COVERAGE_RECALCULATION_DISTANCE_SCENE,
  GRAVITY_GRID_MAX_CHUNKS,
  GRAVITY_GRID_MAX_CHUNK_VERTICES,
  GRAVITY_GRID_MAX_DRAW_CALLS,
  GRAVITY_GRID_TARGET_LINE_SPACING_SCENE,
  calculateGravityGridLodVisibility,
  calculateGravityGridCoverage,
  createGravityGridCoverageAnchor,
  gravityGridChunkBounds,
  gravityGridCoverageUpdateRequired,
  writeGravityGridChunkPositions,
  type GravityGridCameraCoverage,
} from "./gravityGridChunkPolicy";

function bounds(
  minimum: Readonly<{ x: number; y: number; z: number }>,
  maximum: Readonly<{ x: number; y: number; z: number }>
): PotentialGridBounds {
  const center = {
    x: minimum.x * 0.5 + maximum.x * 0.5,
    y: minimum.y * 0.5 + maximum.y * 0.5,
    z: minimum.z * 0.5 + maximum.z * 0.5,
  };

  return {
    minimum,
    maximum,
    center,
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
const defaultCamera: GravityGridCameraCoverage = {
  position: { x: 11, y: 8, z: 14 },
  target: { x: 0, y: 0, z: 0 },
  verticalFieldOfViewRadians: (46 * Math.PI) / 180,
  aspectRatio: 16 / 9,
};

function coveredBounds(
  coverage: ReturnType<typeof calculateGravityGridCoverage>
) {
  const first = gravityGridChunkBounds(coverage.chunks[0]);
  const result = {
    minimum: { ...first.minimum },
    maximum: { ...first.maximum },
  };

  for (const chunk of coverage.chunks.slice(1)) {
    const current = gravityGridChunkBounds(chunk);
    result.minimum.x = Math.min(result.minimum.x, current.minimum.x);
    result.minimum.y = Math.min(result.minimum.y, current.minimum.y);
    result.minimum.z = Math.min(result.minimum.z, current.minimum.z);
    result.maximum.x = Math.max(result.maximum.x, current.maximum.x);
    result.maximum.y = Math.max(result.maximum.y, current.maximum.y);
    result.maximum.z = Math.max(result.maximum.z, current.maximum.z);
  }

  return result;
}

describe("quasi-infinite gravity-grid chunk policy", () => {
  it("covers the requested system and camera region", () => {
    const coverage = calculateGravityGridCoverage(
      compactSystem,
      defaultCamera
    );
    const covered = coveredBounds(coverage);

    expect(covered.minimum.x).toBeLessThanOrEqual(
      coverage.requestedBounds.minimum.x
    );
    expect(covered.minimum.y).toBeLessThanOrEqual(
      coverage.requestedBounds.minimum.y
    );
    expect(covered.minimum.z).toBeLessThanOrEqual(
      coverage.requestedBounds.minimum.z
    );
    expect(covered.maximum.x).toBeGreaterThanOrEqual(
      coverage.requestedBounds.maximum.x
    );
    expect(covered.maximum.y).toBeGreaterThanOrEqual(
      coverage.requestedBounds.maximum.y
    );
    expect(covered.maximum.z).toBeGreaterThanOrEqual(
      coverage.requestedBounds.maximum.z
    );
  });

  it("adds coverage or raises LOD when the camera zooms out", () => {
    const near = calculateGravityGridCoverage(compactSystem, defaultCamera);
    const far = calculateGravityGridCoverage(compactSystem, {
      ...defaultCamera,
      position: { x: 55, y: 40, z: 70 },
    });

    expect(
      far.chunks.length > near.chunks.length ||
        far.outerLod > near.outerLod
    ).toBe(true);
    expect(far.requestedBounds).not.toEqual(near.requestedBounds);
  });

  it("changes aligned chunks after a material pan", () => {
    const initial = calculateGravityGridCoverage(
      compactSystem,
      defaultCamera
    );
    const panned = calculateGravityGridCoverage(compactSystem, {
      ...defaultCamera,
      position: { x: 51, y: 8, z: 14 },
      target: { x: 40, y: 0, z: 0 },
    });

    expect(panned.key).not.toBe(initial.key);
  });

  it("keeps coverage stable below the explicit movement threshold", () => {
    const anchor = createGravityGridCoverageAnchor(defaultCamera);
    const slightlyMoved = {
      ...defaultCamera,
      position: {
        x:
          11 +
          GRAVITY_GRID_COVERAGE_RECALCULATION_DISTANCE_SCENE -
          0.01,
        y: 8,
        z: 14,
      },
    };

    expect(
      gravityGridCoverageUpdateRequired(true, anchor, slightlyMoved)
    ).toBe(false);
    expect(
      gravityGridCoverageUpdateRequired(true, anchor, {
        ...defaultCamera,
        position: {
          x:
            11 +
            GRAVITY_GRID_COVERAGE_RECALCULATION_DISTANCE_SCENE,
          y: 8,
          z: 14,
        },
      })
    ).toBe(true);
    expect(
      gravityGridCoverageUpdateRequired(false, anchor, {
        ...defaultCamera,
        position: { x: 1e6, y: 1e6, z: 1e6 },
      })
    ).toBe(false);
  });

  it("aligns neighboring chunks without gaps", () => {
    const left = gravityGridChunkBounds({ x: -1, y: 0, z: 0, lod: 0 });
    const right = gravityGridChunkBounds({ x: 0, y: 0, z: 0, lod: 0 });

    expect(left.maximum.x).toBe(right.minimum.x);
    expect(left.minimum.y).toBe(right.minimum.y);
    expect(left.maximum.y).toBe(right.maximum.y);
    expect(left.maximum.x - left.minimum.x).toBe(
      GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE
    );
  });

  it("does not duplicate segments at neighboring chunk boundaries", () => {
    const coverage = calculateGravityGridCoverage(
      compactSystem,
      defaultCamera
    );
    const target = new Float32Array(
      GRAVITY_GRID_MAX_CHUNK_VERTICES * 3
    );
    const vertexCount = writeGravityGridChunkPositions(coverage, target);
    const segments = new Set<string>();

    for (let offset = 0; offset < vertexCount * 3; offset += 6) {
      const first = Array.from(target.subarray(offset, offset + 3)).join(",");
      const second = Array.from(target.subarray(offset + 3, offset + 6)).join(",");
      const key = first < second ? `${first}|${second}` : `${second}|${first}`;
      expect(segments.has(key)).toBe(false);
      segments.add(key);
    }

    expect(segments.size).toBe(vertexCount / 2);
  });

  it("keeps chunks, vertices, and draw calls within explicit budgets", () => {
    const coverage = calculateGravityGridCoverage(compactSystem, {
      ...defaultCamera,
      position: { x: 1e6, y: -2e6, z: 3e6 },
      target: { x: 1e6 - 10, y: -2e6, z: 3e6 },
    });

    expect(coverage.chunks.length).toBeLessThanOrEqual(
      GRAVITY_GRID_MAX_CHUNKS
    );
    expect(coverage.vertexCount).toBeLessThanOrEqual(
      GRAVITY_GRID_MAX_CHUNK_VERTICES
    );
    expect(GRAVITY_GRID_MAX_DRAW_CALLS).toBe(1);
  });

  it("uses deterministic, progressively coarser LOD for extreme zoom", () => {
    const extremeCamera = {
      ...defaultCamera,
      position: { x: 1e12, y: 5e11, z: -2e11 },
    };
    const first = calculateGravityGridCoverage(
      compactSystem,
      extremeCamera
    );
    const second = calculateGravityGridCoverage(
      compactSystem,
      extremeCamera
    );

    expect(first).toEqual(second);
    expect(first.outerLod).toBeGreaterThan(0);
    expect(first.chunks.some(({ lod }) => lod === first.denseLod)).toBe(true);
    expect(first.chunks.some(({ lod }) => lod === first.outerLod)).toBe(true);
    expect(
      calculateGravityGridLodVisibility(
        first.denseBounds.center,
        first.outerLod,
        first
      )
    ).toBe(0);
    expect(
      calculateGravityGridLodVisibility(
        first.denseBounds.center,
        first.denseLod,
        first
      )
    ).toBe(1);
    expect(first.chunks.length).toBeLessThanOrEqual(
      GRAVITY_GRID_MAX_CHUNKS
    );
  });

  it("handles compact and extended systems deterministically", () => {
    const extendedSystem = bounds(
      { x: -2e4, y: -1e4, z: -5e3 },
      { x: 2e4, y: 1e4, z: 5e3 }
    );
    const compact = calculateGravityGridCoverage(
      compactSystem,
      defaultCamera
    );
    const extended = calculateGravityGridCoverage(
      extendedSystem,
      defaultCamera
    );

    expect(extended.outerLod).toBeGreaterThan(compact.outerLod);
    expect(extended.chunks.length).toBeLessThanOrEqual(
      GRAVITY_GRID_MAX_CHUNKS
    );
    expect(calculateGravityGridCoverage(extendedSystem, defaultCamera)).toEqual(
      extended
    );
  });

  it("does not reuse stale spatial coverage for a replacement session", () => {
    const previous = calculateGravityGridCoverage(
      compactSystem,
      defaultCamera
    );
    const replacement = calculateGravityGridCoverage(
      bounds(
        { x: 90, y: 90, z: 90 },
        { x: 110, y: 110, z: 110 }
      ),
      defaultCamera
    );

    expect(replacement.key).not.toBe(previous.key);
    expect(replacement.requestedBounds).not.toEqual(
      previous.requestedBounds
    );
  });

  it("uses the base visual spacing near the system", () => {
    const coverage = calculateGravityGridCoverage(
      compactSystem,
      defaultCamera
    );

    expect(coverage.denseLod).toBe(0);
    expect(coverage.chunks.some(({ lod }) => lod === 0)).toBe(true);
    expect(
      GRAVITY_GRID_BASE_CHUNK_SIZE_SCENE /
        GRAVITY_GRID_CHUNK_INTERVALS
    ).toBe(GRAVITY_GRID_TARGET_LINE_SPACING_SCENE);
    expect(GRAVITY_GRID_CHUNK_INTERVALS).toBe(6);
  });
});
