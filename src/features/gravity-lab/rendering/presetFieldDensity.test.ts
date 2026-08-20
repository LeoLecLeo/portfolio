import { describe, expect, it } from "vitest";

import { GRAVITY_PRESETS } from "../presets/catalog";
import { GravityLabSession } from "../runtime/GravityLabSession";
import { createGravityLabSchedulerConfig } from "../runtime/schedulerPolicy";
import {
  GRAVITY_FIELD_MAX_VECTOR_COUNT,
  GRAVITY_FIELD_MAX_VERTEX_COUNT,
  GRAVITY_FIELD_VERTICES_PER_VECTOR,
  calculateGravityFieldSampling,
} from "./gravityFieldVectorPolicy";
import { createSessionVisualizationLayout } from "./sessionVisualizationLayout";

describe("preset gravity-field density", () => {
  it("uses deterministic adaptive sampling for every catalog preset", () => {
    const results = GRAVITY_PRESETS.map((preset) => {
      const scenario = preset.createScenario();
      const session = new GravityLabSession({
        appliedScenario: scenario,
        schedulerConfig: createGravityLabSchedulerConfig(
          scenario.numericalPolicy.timeStepSeconds,
          preset.preferredSimulatedSecondsPerRealSecond
        ),
      });
      const sampling = calculateGravityFieldSampling(
        createSessionVisualizationLayout(session).bounds
      );
      session.stop();

      return {
        id: preset.id,
        counts: sampling.counts,
        vectorCount: sampling.vectorCount,
        vertexCount:
          sampling.vectorCount * GRAVITY_FIELD_VERTICES_PER_VECTOR,
      };
    });

    expect(results).toEqual([
      {
        id: "inclined-binary",
        counts: { x: 15, y: 15, z: 15 },
        vectorCount: 3_375,
        vertexCount: 33_750,
      },
      {
        id: "circular-two-body",
        counts: { x: 15, y: 15, z: 15 },
        vectorCount: 3_375,
        vertexCount: 33_750,
      },
      {
        id: "star-planet-quasi-circular",
        counts: { x: 15, y: 15, z: 15 },
        vectorCount: 3_375,
        vertexCount: 33_750,
      },
      {
        id: "hyperbolic-two-body-flyby",
        counts: { x: 15, y: 15, z: 15 },
        vectorCount: 3_375,
        vertexCount: 33_750,
      },
      {
        id: "sun-mercury-1pn",
        counts: { x: 15, y: 15, z: 15 },
        vectorCount: 3_375,
        vertexCount: 33_750,
      },
    ]);

    for (const result of results) {
      expect(result.vectorCount).toBeLessThanOrEqual(
        GRAVITY_FIELD_MAX_VECTOR_COUNT
      );
      expect(result.vertexCount).toBeLessThanOrEqual(
        GRAVITY_FIELD_MAX_VERTEX_COUNT
      );
    }
  });
});
