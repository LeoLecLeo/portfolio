import { describe, expect, it } from "vitest";

import { createInclinedBinaryConfig } from "../presets/inclinedBinary";
import { SimulationEngine } from "./SimulationEngine";
import { SimulationReadView } from "./SimulationReadView";

describe("controlled simulation read view", () => {
  it("copies positions into a reusable private buffer", () => {
    const engine = new SimulationEngine(createInclinedBinaryConfig());
    const view = new SimulationReadView(engine);
    const target = { x: 0, y: 0, z: 0 };

    view.writePositionM(0, target);
    expect(target).toEqual({
      x: engine.state.positionsM[0],
      y: engine.state.positionsM[1],
      z: engine.state.positionsM[2],
    });

    target.x = Number.POSITIVE_INFINITY;
    const secondTarget = { x: 0, y: 0, z: 0 };
    view.writePositionM(0, secondTarget);
    expect(secondTarget.x).toBe(engine.state.positionsM[0]);
    expect(Number.isFinite(secondTarget.x)).toBe(true);
  });

  it("changes only after an explicit synchronization", () => {
    const engine = new SimulationEngine(createInclinedBinaryConfig());
    const view = new SimulationReadView(engine);
    const before = { x: 0, y: 0, z: 0 };
    const stale = { x: 0, y: 0, z: 0 };
    const synchronized = { x: 0, y: 0, z: 0 };

    view.writePositionM(0, before);
    engine.start();
    engine.advanceOneStep();
    view.writePositionM(0, stale);
    expect(stale).toEqual(before);

    view.sync();
    view.writePositionM(0, synchronized);
    expect(synchronized).not.toEqual(before);
  });

  it("rejects an invalid body index", () => {
    const engine = new SimulationEngine(createInclinedBinaryConfig());
    const view = new SimulationReadView(engine);

    expect(() =>
      view.writePositionM(view.bodyCount, { x: 0, y: 0, z: 0 })
    ).toThrow(/outside the read view/);
  });

  it("provides a stable identifier-to-index rendering boundary", () => {
    const engine = new SimulationEngine(createInclinedBinaryConfig());
    const view = new SimulationReadView(engine);
    const byIndex = { x: 0, y: 0, z: 0 };
    const byId = { x: 0, y: 0, z: 0 };

    expect(view.bodyIds).toEqual(["binary-a", "binary-b"]);
    expect(Object.isFrozen(view.bodyIds)).toBe(true);
    expect(view.bodyIndexOf("binary-b")).toBe(1);
    expect(view.bodyIndexOf("missing")).toBeNull();
    view.writePositionM(1, byIndex);
    view.writePositionMById("binary-b", byId);
    expect(byId).toEqual(byIndex);
    expect(() =>
      view.writePositionMById("missing", byId)
    ).toThrow(/outside the read view/);
  });
});
