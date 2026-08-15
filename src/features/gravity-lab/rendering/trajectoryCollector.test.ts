import { describe, expect, it } from "vitest";

import { TrajectoryCollector } from "./trajectoryCollector";

function orderedPoints(
  collector: TrajectoryCollector,
  bodyId: string
): number[] {
  const target = new Float32Array(collector.maxPointsPerBody * 3);
  const count = collector.copyPositionsTo(bodyId, target);
  return Array.from(target.subarray(0, count * 3));
}

describe("TrajectoryCollector", () => {
  it("accumulates points in chronological order", () => {
    const collector = new TrajectoryCollector(["a"], {
      maxPointsPerBody: 4,
    });

    collector.append("a", { x: 1, y: 2, z: 3 });
    collector.append("a", { x: 4, y: 5, z: 6 });

    expect(orderedPoints(collector, "a")).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps only the newest points at its strict capacity", () => {
    const collector = new TrajectoryCollector(["a"], {
      maxPointsPerBody: 3,
    });

    for (let value = 1; value <= 5; value += 1) {
      collector.append("a", { x: value, y: 0, z: 0 });
    }

    expect(collector.pointCount("a")).toBe(3);
    expect(orderedPoints(collector, "a")).toEqual([
      3, 0, 0, 4, 0, 0, 5, 0, 0,
    ]);
  });

  it("keeps body ids independent", () => {
    const collector = new TrajectoryCollector(["a", "b"], {
      maxPointsPerBody: 3,
    });

    collector.append("a", { x: 1, y: 0, z: 0 });
    collector.append("b", { x: 9, y: 8, z: 7 });
    collector.append("a", { x: 2, y: 0, z: 0 });

    expect(orderedPoints(collector, "a")).toEqual([1, 0, 0, 2, 0, 0]);
    expect(orderedPoints(collector, "b")).toEqual([9, 8, 7]);
  });

  it("removes disappeared bodies without clearing surviving ids", () => {
    const collector = new TrajectoryCollector(["a", "b"], {
      maxPointsPerBody: 3,
    });
    collector.append("a", { x: 1, y: 0, z: 0 });
    collector.append("b", { x: 2, y: 0, z: 0 });

    collector.reconcileBodyIds(["b", "c"]);

    expect(collector.hasBody("a")).toBe(false);
    expect(orderedPoints(collector, "b")).toEqual([2, 0, 0]);
    expect(collector.pointCount("c")).toBe(0);
  });

  it("clears every trail when a scenario is replaced", () => {
    const collector = new TrajectoryCollector(["same", "old"], {
      maxPointsPerBody: 3,
    });
    collector.append("same", { x: 1, y: 2, z: 3 });

    collector.replaceBodyIds(["same", "new"]);

    expect(collector.pointCount("same")).toBe(0);
    expect(collector.hasBody("old")).toBe(false);
    expect(collector.pointCount("new")).toBe(0);
  });

  it("supports explicit manual clearing", () => {
    const collector = new TrajectoryCollector(["a", "b"]);
    collector.append("a", { x: 1, y: 2, z: 3 });
    collector.append("b", { x: 4, y: 5, z: 6 });

    collector.clear();

    expect(collector.pointCount("a")).toBe(0);
    expect(collector.pointCount("b")).toBe(0);
  });

  it("does not schedule samples while paused or catch up paused time", () => {
    const collector = new TrajectoryCollector(["a"], {
      sampleIntervalSeconds: 0.1,
    });

    expect(collector.shouldSample(10, false)).toBe(false);
    expect(collector.shouldSample(10, true)).toBe(false);
    expect(collector.shouldSample(0.05, true)).toBe(false);
    expect(collector.shouldSample(0.05, true)).toBe(true);
  });

  it("samples deterministically without producing catch-up bursts", () => {
    const run = () => {
      const collector = new TrajectoryCollector(["a"], {
        sampleIntervalSeconds: 0.1,
      });

      return [0.25, 0.04, 0.06, 0.1, 0.35].map((delta) =>
        collector.shouldSample(delta, true)
      );
    };

    expect(run()).toEqual(run());
    expect(run()).toEqual([false, false, true, true, true]);
  });

  it("copies rendered coordinates without mutating their physical source", () => {
    const collector = new TrajectoryCollector(["a"]);
    const physicalPosition = { x: 1e11, y: -2e11, z: 3e11 };
    const renderedPosition = { x: 1, y: -2, z: 3 };
    const snapshot = structuredClone({ physicalPosition, renderedPosition });

    collector.append("a", renderedPosition);

    expect({ physicalPosition, renderedPosition }).toEqual(snapshot);
    expect(orderedPoints(collector, "a")).toEqual([1, -2, 3]);
  });
});
