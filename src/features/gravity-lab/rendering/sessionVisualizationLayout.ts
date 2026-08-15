import type { GravityLabSession } from "../runtime/GravityLabSession";
import {
  calculatePotentialGridBounds,
  type PotentialGridBounds,
} from "./gravityPotentialGridPolicy";

export type SessionVisualizationLayout = Readonly<{
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

  return Object.freeze({
    bounds: calculatePotentialGridBounds(positions),
  });
}
