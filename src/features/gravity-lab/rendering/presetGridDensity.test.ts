import { describe, expect, it } from "vitest";

import { GRAVITY_PRESETS } from "../presets/catalog";
import { GravityLabSession } from "../runtime/GravityLabSession";
import { createGravityLabSchedulerConfig } from "../runtime/schedulerPolicy";
import {
  GRAVITY_GRID_MAX_LINES_PER_AXIS,
  GRAVITY_GRID_MIN_LINES_PER_AXIS,
  calculatePotentialGridBounds,
  calculatePotentialGridGeometrySize,
  calculatePotentialGridLineCounts,
} from "./gravityPotentialGridPolicy";

describe("preset gravity-grid density", () => {
  it("keeps every catalog preset within the bounded adaptive policy", () => {
    const results = GRAVITY_PRESETS.map((preset) => {
      const scenario = preset.createScenario();
      const session = new GravityLabSession({
        appliedScenario: scenario,
        schedulerConfig: createGravityLabSchedulerConfig(
          scenario.numericalPolicy.timeStepSeconds,
          preset.preferredSimulatedSecondsPerRealSecond
        ),
      });
      const positions = session.bodies.map(({ bodyId }) => {
        const position = { x: 0, y: 0, z: 0 };
        session.writeScenePosition(bodyId, position);
        return position;
      });
      const lineCounts = calculatePotentialGridLineCounts(
        calculatePotentialGridBounds(positions)
      );
      const geometry = calculatePotentialGridGeometrySize(lineCounts);
      session.stop();

      return { id: preset.id, lineCounts, geometry };
    });

    for (const result of results) {
      for (const count of Object.values(result.lineCounts)) {
        expect(count).toBeGreaterThanOrEqual(
          GRAVITY_GRID_MIN_LINES_PER_AXIS
        );
        expect(count).toBeLessThanOrEqual(
          GRAVITY_GRID_MAX_LINES_PER_AXIS
        );
      }

      expect(result.geometry.vertexCount).toBeLessThanOrEqual(120_000);
    }

    expect(results).toMatchInlineSnapshot(`
      [
        {
          "geometry": {
            "lineCount": 689,
            "segmentCount": 22048,
            "vertexCount": 44096,
          },
          "id": "inclined-binary",
          "lineCounts": {
            "x": 20,
            "y": 13,
            "z": 13,
          },
        },
        {
          "geometry": {
            "lineCount": 945,
            "segmentCount": 30240,
            "vertexCount": 60480,
          },
          "id": "circular-two-body",
          "lineCounts": {
            "x": 24,
            "y": 15,
            "z": 15,
          },
        },
        {
          "geometry": {
            "lineCount": 945,
            "segmentCount": 30240,
            "vertexCount": 60480,
          },
          "id": "star-planet-quasi-circular",
          "lineCounts": {
            "x": 24,
            "y": 15,
            "z": 15,
          },
        },
        {
          "geometry": {
            "lineCount": 945,
            "segmentCount": 30240,
            "vertexCount": 60480,
          },
          "id": "hyperbolic-two-body-flyby",
          "lineCounts": {
            "x": 24,
            "y": 15,
            "z": 15,
          },
        },
        {
          "geometry": {
            "lineCount": 945,
            "segmentCount": 30240,
            "vertexCount": 60480,
          },
          "id": "sun-mercury-1pn",
          "lineCounts": {
            "x": 24,
            "y": 15,
            "z": 15,
          },
        },
      ]
    `);
  });
});
