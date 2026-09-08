import { describe, expect, it } from "vitest";

import {
  MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT,
  MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS,
  createMercuryValidationInitialState,
  runMercuryPerihelionComparison,
} from "./mercuryPerihelionExperiment";

describe("isolated Sun-Mercury 1PN validation", () => {
  it("separates relativistic perihelion advance from the Newtonian RK4 control", () => {
    const comparison = runMercuryPerihelionComparison(
      MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS,
      12
    );

    expect(
      Math.abs(comparison.newtonian.measurement.radiansPerOrbit)
    ).toBeLessThan(
      MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT * 1e-3
    );
    expect(comparison.firstPostNewtonian.measurement.radiansPerOrbit).toBeGreaterThan(
      0
    );
    expect(comparison.relativeError).toBeLessThan(2e-5);
    expect(comparison.firstPostNewtonian.initialValidity.overallLevel).toBe(
      "recommended"
    );
    expect(comparison.firstPostNewtonian.observedDomain.maximumBeta).toBeLessThan(
      0.01
    );
    expect(
      comparison.firstPostNewtonian.observedDomain.maximumChiPair
    ).toBeLessThan(1e-4);
    expect(comparison.firstPostNewtonian.observedDomain.maximumPsi).toBeLessThan(
      1e-4
    );
  });

  it("converges across dt, dt/2, and dt/4 without changing the physical reference", () => {
    const comparisons = [
      MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS * 2,
      MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS,
      MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS / 2,
    ].map((timeStepSeconds) =>
      runMercuryPerihelionComparison(timeStepSeconds, 12)
    );
    const measuredDifferentialAdvances = [
      5.018475697885393e-7,
      5.018743220017137e-7,
      5.018785302163676e-7,
    ];
    const measuredNewtonianControls = [
      1.2402708216362621e-9,
      -2.1629186645900502e-10,
      1.1847418262996601e-11,
    ];

    comparisons.forEach((comparison, index) => {
      expect(comparison.analyticalAdvanceRadiansPerOrbit).toBe(
        MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT
      );
      expect(comparison.differentialAdvanceRadiansPerOrbit).toBeCloseTo(
        measuredDifferentialAdvances[index],
        15
      );
      expect(comparison.newtonian.measurement.radiansPerOrbit).toBeCloseTo(
        measuredNewtonianControls[index],
        15
      );
      expect(comparison.newtonian.stepCount).toBe(
        comparison.firstPostNewtonian.stepCount
      );
      expect(comparison.newtonian.simulatedTimeSeconds).toBe(
        comparison.firstPostNewtonian.simulatedTimeSeconds
      );
    });

    expect(comparisons[1].relativeError).toBeLessThan(
      comparisons[0].relativeError
    );
    expect(comparisons[2].relativeError).toBeLessThan(
      comparisons[1].relativeError
    );
    expect(comparisons[2].relativeError).toBeLessThan(1e-5);
    expect(
      Math.abs(comparisons[2].newtonian.measurement.radiansPerOrbit)
    ).toBeLessThan(
      MERCURY_ANALYTIC_1PN_ADVANCE_RADIANS_PER_ORBIT * 5e-5
    );
    expect(
      comparisons[1].firstPostNewtonian.measurement
        .rmsAngularResidualRadians
    ).toBeLessThan(
      comparisons[0].firstPostNewtonian.measurement
        .rmsAngularResidualRadians / 6
    );
    expect(
      comparisons[2].firstPostNewtonian.measurement
        .rmsAngularResidualRadians
    ).toBeLessThan(
      comparisons[1].firstPostNewtonian.measurement
        .rmsAngularResidualRadians / 6
    );
  });

  it("creates fresh but physically identical initial conditions", () => {
    const first = createMercuryValidationInitialState();
    const second = createMercuryValidationInitialState();

    expect(first).not.toBe(second);
    expect(first.massesKg).not.toBe(second.massesKg);
    expect(first.positionsM).not.toBe(second.positionsM);
    expect(first.velocitiesMps).not.toBe(second.velocitiesMps);
    expect(first.massesKg).toEqual(second.massesKg);
    expect(first.positionsM).toEqual(second.positionsM);
    expect(first.velocitiesMps).toEqual(second.velocitiesMps);
  });
});
