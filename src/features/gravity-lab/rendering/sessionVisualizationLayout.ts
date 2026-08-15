import type { GravityLabSession } from "../runtime/GravityLabSession";
import {
  calculatePotentialGridBounds,
  type PotentialGridBounds,
} from "./gravityPotentialGridPolicy";

export type SessionVisualizationLayout = Readonly<{
  bodyBounds: PotentialGridBounds;
  bounds: PotentialGridBounds;
}>;

export type SessionVisualizationSource = Pick<
  GravityLabSession,
  "bodies" | "writeScenePosition"
>;

export function createSessionVisualizationLayout(
  session: SessionVisualizationSource
): SessionVisualizationLayout {
  const positions = session.bodies.map(({ bodyId }) => {
    const position = { x: 0, y: 0, z: 0 };
    session.writeScenePosition(bodyId, position);
    return Object.freeze(position);
  });
  const minimum = {
    x: Math.min(...positions.map(({ x }) => x)),
    y: Math.min(...positions.map(({ y }) => y)),
    z: Math.min(...positions.map(({ z }) => z)),
  };
  const maximum = {
    x: Math.max(...positions.map(({ x }) => x)),
    y: Math.max(...positions.map(({ y }) => y)),
    z: Math.max(...positions.map(({ z }) => z)),
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
    bodyBounds: Object.freeze({
      minimum: Object.freeze(minimum),
      maximum: Object.freeze(maximum),
      center: Object.freeze(center),
      halfExtents: Object.freeze(halfExtents),
    }),
    bounds: calculatePotentialGridBounds(positions),
  });
}
