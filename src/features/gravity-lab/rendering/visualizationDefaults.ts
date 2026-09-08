import type { VisualRadiusMode } from "./visualRadiusPolicy";

export type GravityVisualizationDefaults = Readonly<{
  trajectoriesVisible: boolean;
  potentialGridVisible: boolean;
  gravityFieldVisible: boolean;
  visualRadiusMode: VisualRadiusMode;
}>;

// The first view prioritizes bodies and their motion. Denser explanatory
// layers remain available, but require an explicit user choice.
export const GRAVITY_VISUALIZATION_DEFAULTS: GravityVisualizationDefaults =
  Object.freeze({
    trajectoriesVisible: true,
    potentialGridVisible: false,
    gravityFieldVisible: false,
    visualRadiusMode: "amplified",
  });
