import { describe, expect, it } from "vitest";

import {
  createSessionVisualizationLayout,
  type SessionVisualizationSource,
} from "./sessionVisualizationLayout";

type MutablePoint = { x: number; y: number; z: number };

function source(initialPositions: Readonly<Record<string, MutablePoint>>) {
  const positions = new Map(
    Object.entries(initialPositions).map(([bodyId, position]) => [
      bodyId,
      { ...position },
    ])
  );
  let readCount = 0;
  const session = {
    bodies: Object.freeze(
      [...positions.keys()].map((bodyId) => Object.freeze({ bodyId }))
    ),
    writeScenePosition(bodyId: string, target: MutablePoint) {
      const position = positions.get(bodyId);

      if (position === undefined) {
        throw new RangeError(`Unknown body ${bodyId}.`);
      }

      readCount += 1;
      target.x = position.x;
      target.y = position.y;
      target.z = position.z;
    },
  } as SessionVisualizationSource;

  return {
    session,
    move(bodyId: string, position: MutablePoint) {
      positions.set(bodyId, { ...position });
    },
    get readCount() {
      return readCount;
    },
  };
}

describe("session visualization layout", () => {
  it("keeps the captured bounds stable across hide/show cycles", () => {
    const current = source({
      a: { x: -4, y: 0, z: 0 },
      b: { x: 4, y: 0, z: 0 },
    });
    const layout = createSessionVisualizationLayout(current.session);
    const initiallyVisibleBounds = layout.bounds;

    // Both layers may unmount while their shared session layout remains alive.
    current.move("a", { x: -40, y: 10, z: 0 });
    current.move("b", { x: 40, y: -10, z: 0 });
    const visibleAgainBounds = layout.bounds;

    expect(visibleAgainBounds).toBe(initiallyVisibleBounds);
    expect(current.readCount).toBe(2);
  });

  it("provides the exact same immutable bounds to grid and vectors", () => {
    const current = source({ a: { x: 2, y: -1, z: 4 } });
    const layout = createSessionVisualizationLayout(current.session);
    const gridBounds = layout.bounds;
    const vectorBounds = layout.bounds;

    expect(gridBounds).toBe(vectorBounds);
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.bounds)).toBe(true);
  });

  it("captures fresh bounds for a new session identity", () => {
    const previous = source({
      a: { x: -4, y: 0, z: 0 },
      b: { x: 4, y: 0, z: 0 },
    });
    const replacement = source({
      a: { x: 100, y: 50, z: -25 },
      b: { x: 102, y: 54, z: -21 },
    });
    const previousLayout = createSessionVisualizationLayout(
      previous.session
    );
    const replacementLayout = createSessionVisualizationLayout(
      replacement.session
    );

    expect(replacementLayout).not.toBe(previousLayout);
    expect(replacementLayout.bounds).not.toBe(previousLayout.bounds);
    expect(replacementLayout.bounds.center).toEqual({
      x: 101,
      y: 52,
      z: -23,
    });
    expect(previous.readCount).toBe(2);
    expect(replacement.readCount).toBe(2);
  });
});
