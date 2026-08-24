import { describe, expect, it } from "vitest";

import {
  NULL_SCHWARZSCHILD_REFERENCE_AFFINE_STEP,
  NULL_SCHWARZSCHILD_REFERENCE_RAYS,
} from "./nullSchwarzschildExperiment";
import {
  SCHWARZSCHILD_LIGHT_AFFINE_STEP,
  SCHWARZSCHILD_LIGHT_INITIAL_RADIUS_RATIO,
  SCHWARZSCHILD_LIGHT_MAX_POINTS_PER_RAY,
  SCHWARZSCHILD_REFERENCE_LIGHT_RAYS,
  createSchwarzschildVisualizationExperiment,
} from "./schwarzschildVisualizationExperiment";

const experiment = createSchwarzschildVisualizationExperiment();

describe("Schwarzschild visualization experiment", () => {
  it("uses the exact validated 4C reference factors and affine convention", () => {
    expect(SCHWARZSCHILD_REFERENCE_LIGHT_RAYS).toBe(
      NULL_SCHWARZSCHILD_REFERENCE_RAYS
    );
    expect(SCHWARZSCHILD_LIGHT_AFFINE_STEP).toBe(
      NULL_SCHWARZSCHILD_REFERENCE_AFFINE_STEP
    );
    expect(
      experiment.lightTrajectories.map((trajectory) => ({
        id: trajectory.id,
        impactParameterCriticalFactor:
          trajectory.impactParameterCriticalFactor,
      }))
    ).toEqual([
      { id: "scattered", impactParameterCriticalFactor: 1.1 },
      { id: "near-critical", impactParameterCriticalFactor: 1.001 },
      { id: "captured", impactParameterCriticalFactor: 0.999 },
    ]);

    for (const trajectory of experiment.lightTrajectories) {
      expect(trajectory.impactParameterM).toBe(
        trajectory.impactParameterCriticalFactor *
          experiment.criticalImpactParameterM
      );
      expect(trajectory.trajectory[0].radiusM).toBeCloseTo(
        SCHWARZSCHILD_LIGHT_INITIAL_RADIUS_RATIO *
          experiment.schwarzschildRadiusM,
        10
      );
    }
  });

  it("classifies the scattered, near-critical, and captured rays as in 4C", () => {
    expect(
      experiment.lightTrajectories.map((trajectory) => ({
        id: trajectory.id,
        classification: trajectory.classification,
        termination: trajectory.termination,
      }))
    ).toEqual([
      {
        id: "scattered",
        classification: "scattered",
        termination: "return-radius",
      },
      {
        id: "near-critical",
        classification: "scattered",
        termination: "return-radius",
      },
      {
        id: "captured",
        classification: "captured",
        termination: "horizon-guard",
      },
    ]);
  });

  it("stops the captured ray at the last valid exterior state", () => {
    const captured = experiment.lightTrajectories.find(
      ({ id }) => id === "captured"
    );

    expect(captured).toBeDefined();
    expect(captured?.finalRadiusRatio).toBeGreaterThan(
      captured?.horizonGuardRadiusRatio ?? Number.POSITIVE_INFINITY
    );
    expect(captured?.finalRadiusRatio).toBeLessThan(1.01);
    expect(captured?.horizonGuardObservedRadiusRatio).not.toBeNull();
    expect(captured?.horizonGuardObservedRadiusRatio).toBeLessThanOrEqual(
      captured?.horizonGuardRadiusRatio ?? Number.NEGATIVE_INFINITY
    );
    expect(captured?.termination).toBe("horizon-guard");
  });

  it("keeps every physical light trajectory finite, deterministic, and bounded", () => {
    const repeat = createSchwarzschildVisualizationExperiment();

    expect(repeat).toEqual(experiment);

    for (const trajectory of experiment.lightTrajectories) {
      expect(trajectory.trajectory.length).toBeGreaterThan(2);
      expect(trajectory.trajectory.length).toBeLessThanOrEqual(
        SCHWARZSCHILD_LIGHT_MAX_POINTS_PER_RAY
      );
      expect(
        trajectory.trajectory.every((sample) =>
          [
            sample.radiusM,
            sample.polarAngleRad,
            sample.azimuthalAngleRad,
          ].every(Number.isFinite)
        )
      ).toBe(true);
      expect(Number.isFinite(trajectory.maxConstraintResidual)).toBe(true);
    }
  });
});
