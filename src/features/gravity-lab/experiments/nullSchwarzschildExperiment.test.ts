import { describe, expect, it } from "vitest";

import { SOLAR_MASS_KG } from "../core/units";
import {
  NULL_GEODESIC_INDEX,
  NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  createCircularPhotonSphereState,
  createEquatorialNullSchwarzschildStateFromConstants,
  createIncomingEquatorialNullSchwarzschildState,
  weakFieldSchwarzschildDeflectionRad,
} from "../physics/nullSchwarzschildGeodesic";
import {
  schwarzschildCriticalNullImpactParameterM,
  schwarzschildRadiusM,
} from "../physics/schwarzschildMetric";
import {
  HeadlessNullSchwarzschildSimulation,
  runNullSchwarzschildScatteringExperiment,
} from "./nullSchwarzschildExperiment";

function copyPhaseSpace(
  simulation: HeadlessNullSchwarzschildSimulation
): Float64Array {
  const target = new Float64Array(NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH);
  simulation.copyPhaseSpaceTo(target);
  return target;
}

describe("headless null Schwarzschild experiment", () => {
  it("preserves the circular photon orbit, null constraint, E, L, and equatorial plane", () => {
    const initialState = createCircularPhotonSphereState(SOLAR_MASS_KG);
    const angularRate =
      initialState.phaseSpace[NULL_GEODESIC_INDEX.azimuthalMomentum] /
      initialState.phaseSpace[NULL_GEODESIC_INDEX.radius] ** 2;
    const affinePeriod = (2 * Math.PI) / angularRate;
    const stepCount = 2_048;
    const simulation = new HeadlessNullSchwarzschildSimulation({
      affineStep: affinePeriod / stepCount,
      initialState,
    });
    const initialDiagnostics = simulation.diagnostics;

    for (let step = 0; step < stepCount; step += 1) {
      expect(simulation.advanceOneStep().accepted).toBe(true);
    }

    const finalState = copyPhaseSpace(simulation);
    expect(finalState[NULL_GEODESIC_INDEX.radius]).toBeCloseTo(1.5, 10);
    expect(finalState[NULL_GEODESIC_INDEX.azimuthal]).toBeCloseTo(
      2 * Math.PI,
      9
    );
    expect(finalState[NULL_GEODESIC_INDEX.polar]).toBe(Math.PI / 2);
    expect(finalState[NULL_GEODESIC_INDEX.polarMomentum]).toBeCloseTo(0, 14);
    expect(simulation.diagnostics.specificEnergy).toBe(
      initialDiagnostics.specificEnergy
    );
    expect(simulation.diagnostics.specificAngularMomentum).toBe(
      initialDiagnostics.specificAngularMomentum
    );
    expect(Math.abs(simulation.diagnostics.constraintResidual)).toBeLessThan(
      1e-11
    );
  });

  it("demonstrates photon-sphere instability on both sides", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const criticalImpactRatio =
      schwarzschildCriticalNullImpactParameterM(SOLAR_MASS_KG) /
      horizonRadiusM;
    const outside = createEquatorialNullSchwarzschildStateFromConstants({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: 1.501 * horizonRadiusM,
      dimensionlessAngularMomentum: criticalImpactRatio,
      radialDirection: "outward",
    });
    const inside = createEquatorialNullSchwarzschildStateFromConstants({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: 1.499 * horizonRadiusM,
      dimensionlessAngularMomentum: criticalImpactRatio,
      radialDirection: "inward",
    });
    const escaping = new HeadlessNullSchwarzschildSimulation({
      affineStep: 0.002,
      initialState: outside,
    });
    const captured = new HeadlessNullSchwarzschildSimulation({
      affineStep: 0.0005,
      initialState: inside,
    });
    let escapedRadius = outside.phaseSpace[NULL_GEODESIC_INDEX.radius];
    let captureObserved = false;

    for (let step = 0; step < 100_000 && escapedRadius < 2; step += 1) {
      expect(escaping.advanceOneStep().accepted).toBe(true);
      escapedRadius = copyPhaseSpace(escaping)[NULL_GEODESIC_INDEX.radius];
    }

    for (let step = 0; step < 100_000 && !captureObserved; step += 1) {
      const result = captured.advanceOneStep();
      captureObserved =
        !result.accepted && result.reason === "horizon-approach";
    }

    expect(escapedRadius).toBeGreaterThanOrEqual(2);
    expect(captureObserved).toBe(true);
  });

  it("converges to the weak-field deflection at large impact parameter", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const impactParameterM = 100 * horizonRadiusM;
    const options = {
      centralMassKg: SOLAR_MASS_KG,
      initialRadiusM: 10_000 * horizonRadiusM,
      impactParameterM,
      maxSteps: 100_000,
    };
    const results = [8, 4, 2].map((affineStep) =>
      runNullSchwarzschildScatteringExperiment({
        ...options,
        affineStep,
      })
    );
    const expectedWeakField = weakFieldSchwarzschildDeflectionRad(
      SOLAR_MASS_KG,
      impactParameterM
    );

    for (const result of results) {
      expect(result.classification).toBe("scattered");
      expect(result.deflectionRad).not.toBeNull();
    }

    const coarseToMediumDifference = Math.abs(
      (results[0].deflectionRad ?? 0) - (results[1].deflectionRad ?? 0)
    );
    const mediumToFineDifference = Math.abs(
      (results[1].deflectionRad ?? 0) - (results[2].deflectionRad ?? 0)
    );
    expect(coarseToMediumDifference / mediumToFineDifference).toBeGreaterThan(
      14
    );
    expect(coarseToMediumDifference / mediumToFineDifference).toBeLessThan(18);
    expect(results[0].maxConstraintResidual).toBeGreaterThan(
      results[1].maxConstraintResidual
    );
    expect(results[1].maxConstraintResidual).toBeGreaterThan(
      results[2].maxConstraintResidual
    );
    expect(results[2].maxConstraintResidual).toBeLessThan(2e-9);
    expect(
      Math.abs((results[2].deflectionRad ?? 0) - expectedWeakField) /
        expectedWeakField
    ).toBeLessThan(0.02);
    expect(results[2].relativeEnergyDrift).toBe(0);
    expect(results[2].relativeAngularMomentumDrift).toBe(0);
  });

  it("classifies scattering, near-critical scattering, and capture around b_c", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const criticalImpactM =
      schwarzschildCriticalNullImpactParameterM(SOLAR_MASS_KG);
    const common = {
      centralMassKg: SOLAR_MASS_KG,
      initialRadiusM: 100 * horizonRadiusM,
      affineStep: 0.01,
      maxSteps: 100_000,
    };
    const scattered = runNullSchwarzschildScatteringExperiment({
      ...common,
      impactParameterM: criticalImpactM * 1.1,
    });
    const nearCritical = runNullSchwarzschildScatteringExperiment({
      ...common,
      impactParameterM: criticalImpactM * 1.001,
    });
    const nearCriticalRepeat = runNullSchwarzschildScatteringExperiment({
      ...common,
      impactParameterM: criticalImpactM * 1.001,
    });
    const captured = runNullSchwarzschildScatteringExperiment({
      ...common,
      impactParameterM: criticalImpactM * 0.999,
    });

    expect(scattered.classification).toBe("scattered");
    expect(nearCritical.classification).toBe("scattered");
    expect(nearCriticalRepeat).toEqual(nearCritical);
    expect(nearCritical.deflectionRad).toBeGreaterThan(
      scattered.deflectionRad ?? Number.POSITIVE_INFINITY
    );
    expect(captured).toMatchObject({
      classification: "captured",
      termination: "horizon-guard",
    });
  });

  it("is deterministic, finite, non-mutating, and rejects the exterior guard", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const initialState = createIncomingEquatorialNullSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      initialRadiusM: 20 * horizonRadiusM,
      impactParameterM: 5 * horizonRadiusM,
    });
    const before = initialState.phaseSpace.slice();
    const first = new HeadlessNullSchwarzschildSimulation({
      affineStep: 0.01,
      initialState,
    });
    const second = new HeadlessNullSchwarzschildSimulation({
      affineStep: 0.01,
      initialState,
    });

    for (let step = 0; step < 100; step += 1) {
      expect(first.advanceOneStep()).toEqual(second.advanceOneStep());
    }

    expect(copyPhaseSpace(first)).toEqual(copyPhaseSpace(second));
    expect(Array.from(copyPhaseSpace(first)).every(Number.isFinite)).toBe(true);
    expect(initialState.phaseSpace).toEqual(before);

    const radiusRatio = 1.000_000_5;
    const factor = 1 - 1 / radiusRatio;
    const guarded = createEquatorialNullSchwarzschildStateFromConstants({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: radiusRatio * horizonRadiusM,
      dimensionlessAngularMomentum: 0,
      radialDirection: "inward",
    });
    expect(
      () =>
        new HeadlessNullSchwarzschildSimulation({
          affineStep: factor,
          initialState: guarded,
        })
    ).toThrow(/explicit exterior guard/);
  });
});
