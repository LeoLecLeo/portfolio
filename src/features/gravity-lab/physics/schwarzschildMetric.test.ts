import { describe, expect, it } from "vitest";

import { SOLAR_MASS_KG } from "../core/units";
import {
  classifyMassiveCircularOrbitStability,
  massiveCircularRadialEpicyclicFrequencySquaredPerSecond2,
  sampleExteriorSchwarzschildMetric,
  schwarzschildIscoRadiusM,
  schwarzschildKretschmannM4,
  schwarzschildProperRadialDistanceFromHorizonM,
  schwarzschildRadiusM,
  schwarzschildStaticLapse,
} from "./schwarzschildMetric";

describe("exterior Schwarzschild metric and observables", () => {
  it("reproduces the analytical Schwarzschild radius in SI", () => {
    expect(schwarzschildRadiusM(SOLAR_MASS_KG)).toBeCloseTo(
      2_953.339_382_066_878_4,
      11
    );
  });

  it("tends to the Minkowski metric in a controlled weak-field limit", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const radiusM = horizonRadiusM * 1e8;
    const sample = sampleExteriorSchwarzschildMetric(
      SOLAR_MASS_KG,
      radiusM,
      Math.PI / 2
    );

    expect(sample.metricFactor).toBeCloseTo(1 - 1e-8, 15);
    expect(sample.covariantDiagonal[0]).toBeCloseTo(-(1 - 1e-8), 15);
    expect(sample.covariantDiagonal[1]).toBeCloseTo(1 / (1 - 1e-8), 15);

    for (let index = 0; index < 4; index += 1) {
      expect(
        sample.covariantDiagonal[index] *
          sample.contravariantDiagonal[index]
      ).toBeCloseTo(1, 14);
    }

    // A finite field can be below Float64 resolution without leaving the
    // physical exterior domain. It then reaches the numerical flat limit.
    expect(
      sampleExteriorSchwarzschildMetric(1, 1e18, Math.PI / 2).metricFactor
    ).toBe(1);
  });

  it("matches the analytical static-clock lapse", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);

    expect(
      schwarzschildStaticLapse(SOLAR_MASS_KG, 10 * horizonRadiusM)
    ).toBeCloseTo(Math.sqrt(0.9), 15);
  });

  it("returns finite geometric observables without confusing areal and proper radius", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const radiusM = 4 * horizonRadiusM;
    const properDistanceM =
      schwarzschildProperRadialDistanceFromHorizonM(
        SOLAR_MASS_KG,
        radiusM
      );
    const expectedDistanceM =
      Math.sqrt(radiusM * (radiusM - horizonRadiusM)) +
      horizonRadiusM *
        Math.log(
          (Math.sqrt(radiusM) + Math.sqrt(radiusM - horizonRadiusM)) /
            Math.sqrt(horizonRadiusM)
        );

    expect(properDistanceM).toBeCloseTo(expectedDistanceM, 12);
    expect(properDistanceM).not.toBeCloseTo(radiusM - horizonRadiusM, 6);
    expect(
      schwarzschildKretschmannM4(SOLAR_MASS_KG, radiusM)
    ).toBeCloseTo((12 * horizonRadiusM ** 2) / radiusM ** 6, 15);
  });

  it("exposes the analytical ISCO stability boundary", () => {
    const iscoRadiusM = schwarzschildIscoRadiusM(SOLAR_MASS_KG);

    expect(
      classifyMassiveCircularOrbitStability(
        SOLAR_MASS_KG,
        iscoRadiusM * 1.01
      )
    ).toBe("stable");
    expect(
      classifyMassiveCircularOrbitStability(SOLAR_MASS_KG, iscoRadiusM)
    ).toBe("marginally-stable");
    expect(
      classifyMassiveCircularOrbitStability(
        SOLAR_MASS_KG,
        iscoRadiusM * 0.99
      )
    ).toBe("unstable");
    expect(
      massiveCircularRadialEpicyclicFrequencySquaredPerSecond2(
        SOLAR_MASS_KG,
        iscoRadiusM * 1.01
      )
    ).toBeGreaterThan(0);
    expect(
      massiveCircularRadialEpicyclicFrequencySquaredPerSecond2(
        SOLAR_MASS_KG,
        iscoRadiusM
      )
    ).toBeCloseTo(0, 20);
    expect(
      massiveCircularRadialEpicyclicFrequencySquaredPerSecond2(
        SOLAR_MASS_KG,
        iscoRadiusM * 0.99
      )
    ).toBeLessThan(0);
  });

  it("rejects the horizon, interior, coordinate axis, and non-finite inputs", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);

    expect(() =>
      sampleExteriorSchwarzschildMetric(
        SOLAR_MASS_KG,
        horizonRadiusM,
        Math.PI / 2
      )
    ).toThrow(/strictly greater than r_s/);
    expect(() =>
      sampleExteriorSchwarzschildMetric(
        SOLAR_MASS_KG,
        horizonRadiusM * 0.9,
        Math.PI / 2
      )
    ).toThrow(/strictly greater than r_s/);
    expect(() =>
      sampleExteriorSchwarzschildMetric(
        SOLAR_MASS_KG,
        horizonRadiusM * 2,
        0
      )
    ).toThrow(/strictly between 0 and pi/);
    expect(() => schwarzschildRadiusM(Number.NaN)).toThrow(/finite/);
  });
});
