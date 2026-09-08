import { describe, expect, it } from "vitest";

import { SOLAR_MASS_KG, SPEED_OF_LIGHT_MPS } from "../core/units";
import {
  MASSIVE_GEODESIC_INDEX,
  MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  circularMassiveGeodesicProperPeriodSeconds,
  createCircularMassiveSchwarzschildState,
  createMassiveSchwarzschildState,
  type MassiveSchwarzschildState,
} from "../physics/massiveSchwarzschildGeodesic";
import { schwarzschildRadiusM } from "../physics/schwarzschildMetric";
import {
  HeadlessMassiveSchwarzschildSimulation,
  createMassiveSchwarzschildRk4Workspace,
  createSchwarzschildHorizonGuard,
  prepareMassiveSchwarzschildRk4Candidate,
} from "./massiveSchwarzschildExperiment";

function copySimulationPhaseSpace(
  simulation: HeadlessMassiveSchwarzschildSimulation
): Float64Array {
  const phaseSpace = new Float64Array(
    MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH
  );
  simulation.copyPhaseSpaceTo(phaseSpace);
  return phaseSpace;
}

function createRadiallyPerturbedState(
  radiusRatio: number,
  radialMomentum: number
): MassiveSchwarzschildState {
  const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
  const circular = createCircularMassiveSchwarzschildState({
    centralMassKg: SOLAR_MASS_KG,
    radiusM: radiusRatio * horizonRadiusM,
  });
  const phaseSpace = circular.phaseSpace.slice();
  const factor = 1 - 1 / radiusRatio;
  const angularMomentum =
    phaseSpace[MASSIVE_GEODESIC_INDEX.azimuthalMomentum];
  phaseSpace[MASSIVE_GEODESIC_INDEX.radialMomentum] = radialMomentum;
  phaseSpace[MASSIVE_GEODESIC_INDEX.timeMomentum] = -Math.sqrt(
    factor *
      (1 +
        factor * radialMomentum * radialMomentum +
        (angularMomentum * angularMomentum) / (radiusRatio * radiusRatio))
  );
  return createMassiveSchwarzschildState(phaseSpace);
}

function runForDimensionlessDuration(
  initialState: MassiveSchwarzschildState,
  dimensionlessStep: number,
  dimensionlessDuration: number
): {
  phaseSpace: Float64Array;
  maxConstraintResidual: number;
} {
  const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
  const properTimeStepSeconds =
    (dimensionlessStep * horizonRadiusM) / SPEED_OF_LIGHT_MPS;
  const stepCount = Math.round(dimensionlessDuration / dimensionlessStep);
  const simulation = new HeadlessMassiveSchwarzschildSimulation({
    centralMassKg: SOLAR_MASS_KG,
    properTimeStepSeconds,
    initialState,
  });
  let maxConstraintResidual = 0;

  for (let step = 0; step < stepCount; step += 1) {
    const result = simulation.advanceOneStep();
    expect(result.accepted).toBe(true);
    maxConstraintResidual = Math.max(
      maxConstraintResidual,
      Math.abs(simulation.diagnostics.constraintResidual)
    );
  }

  return {
    phaseSpace: copySimulationPhaseSpace(simulation),
    maxConstraintResidual,
  };
}

function phaseSpaceError(
  actual: Float64Array,
  expected: Float64Array
): number {
  let sum = 0;

  for (let index = 0; index < actual.length; index += 1) {
    const difference = actual[index] - expected[index];
    sum += difference * difference;
  }

  return Math.sqrt(sum);
}

describe("headless massive Schwarzschild RK4 experiment", () => {
  it("preserves a stable circular orbit outside the ISCO and monitors E, L, and H", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const radiusRatio = 10;
    const initialState = createCircularMassiveSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: radiusRatio * horizonRadiusM,
    });
    const stepCount = 1_024;
    const properPeriodSeconds = circularMassiveGeodesicProperPeriodSeconds(
      SOLAR_MASS_KG,
      radiusRatio * horizonRadiusM
    );
    const simulation = new HeadlessMassiveSchwarzschildSimulation({
      centralMassKg: SOLAR_MASS_KG,
      properTimeStepSeconds: properPeriodSeconds / stepCount,
      initialState,
    });
    const initialDiagnostics = simulation.diagnostics;

    for (let step = 0; step < stepCount; step += 1) {
      expect(simulation.advanceOneStep().accepted).toBe(true);
    }

    const finalPhaseSpace = copySimulationPhaseSpace(simulation);
    expect(finalPhaseSpace[MASSIVE_GEODESIC_INDEX.radius]).toBeCloseTo(
      radiusRatio,
      10
    );
    expect(finalPhaseSpace[MASSIVE_GEODESIC_INDEX.azimuthal]).toBeCloseTo(
      2 * Math.PI,
      9
    );
    expect(simulation.diagnostics.specificEnergy).toBe(
      initialDiagnostics.specificEnergy
    );
    expect(simulation.diagnostics.specificAngularMomentum).toBe(
      initialDiagnostics.specificAngularMomentum
    );
    expect(
      Math.abs(simulation.diagnostics.constraintResidual)
    ).toBeLessThan(1e-12);
  });

  it("shows fourth-order convergence for a non-circular massive geodesic", () => {
    const initialState = createRadiallyPerturbedState(8, 0.03);
    const duration = 48;
    const reference = runForDimensionlessDuration(
      initialState,
      0.025,
      duration
    ).phaseSpace;
    const errors = [0.8, 0.4, 0.2].map((step) =>
      phaseSpaceError(
        runForDimensionlessDuration(initialState, step, duration).phaseSpace,
        reference
      )
    );

    expect(errors[0] / errors[1]).toBeGreaterThan(14);
    expect(errors[0] / errors[1]).toBeLessThan(18);
    expect(errors[1] / errors[2]).toBeGreaterThan(14);
    expect(errors[1] / errors[2]).toBeLessThan(18);
    expect(
      runForDimensionlessDuration(initialState, 0.2, duration)
        .maxConstraintResidual
    ).toBeLessThan(1e-10);
  });

  it("is deterministic and clones the caller-owned initial state", () => {
    const initialState = createRadiallyPerturbedState(8, 0.01);
    const initialBefore = initialState.phaseSpace.slice();
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const properTimeStepSeconds = (0.05 * horizonRadiusM) / SPEED_OF_LIGHT_MPS;
    const first = new HeadlessMassiveSchwarzschildSimulation({
      centralMassKg: SOLAR_MASS_KG,
      properTimeStepSeconds,
      initialState,
    });
    const second = new HeadlessMassiveSchwarzschildSimulation({
      centralMassKg: SOLAR_MASS_KG,
      properTimeStepSeconds,
      initialState,
    });

    for (let step = 0; step < 200; step += 1) {
      expect(first.advanceOneStep()).toEqual(second.advanceOneStep());
    }

    expect(copySimulationPhaseSpace(first)).toEqual(
      copySimulationPhaseSpace(second)
    );
    expect(initialState.phaseSpace).toEqual(initialBefore);
  });

  it("rejects horizon approach transactionally without crossing the chart boundary", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const radiusRatio = 1.000_01;
    const factor = 1 - 1 / radiusRatio;
    const radialMomentum = -1 / factor;
    const timeMomentum = -Math.sqrt(
      factor * (1 + factor * radialMomentum * radialMomentum)
    );
    const state = createMassiveSchwarzschildState(
      new Float64Array([
        0,
        radiusRatio,
        Math.PI / 2,
        0,
        timeMomentum,
        radialMomentum,
        0,
        0,
      ])
    );
    const stateBefore = state.phaseSpace.slice();
    const dimensionlessStep = 2e-5;
    const result = prepareMassiveSchwarzschildRk4Candidate(
      SOLAR_MASS_KG,
      state,
      (dimensionlessStep * horizonRadiusM) / SPEED_OF_LIGHT_MPS,
      createSchwarzschildHorizonGuard(),
      createMassiveSchwarzschildRk4Workspace()
    );

    expect(result).toMatchObject({
      accepted: false,
      reason: "horizon-approach",
    });
    expect(state.phaseSpace).toEqual(stateBefore);
    expect(state.properTimeSeconds).toBe(0);
    expect(state.stepCount).toBe(0);
  });

  it("refuses initial states inside the explicit exterior guard", () => {
    const radiusRatio = 1.000_000_5;
    const factor = 1 - 1 / radiusRatio;
    const state = createMassiveSchwarzschildState(
      new Float64Array([
        0,
        radiusRatio,
        Math.PI / 2,
        0,
        -Math.sqrt(factor),
        0,
        0,
        0,
      ])
    );

    expect(
      () =>
        new HeadlessMassiveSchwarzschildSimulation({
          centralMassKg: SOLAR_MASS_KG,
          properTimeStepSeconds: 1e-12,
          initialState: state,
        })
    ).toThrow(/explicit exterior guard/);
  });

  it("refuses a structurally forged state that violates the massive constraint", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const valid = createCircularMassiveSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: 8 * horizonRadiusM,
    });
    const forgedPhaseSpace = valid.phaseSpace.slice();
    forgedPhaseSpace[MASSIVE_GEODESIC_INDEX.timeMomentum] *= 0.5;

    expect(
      () =>
        new HeadlessMassiveSchwarzschildSimulation({
          centralMassKg: SOLAR_MASS_KG,
          properTimeStepSeconds: 1e-6,
          initialState: {
            phaseSpace: forgedPhaseSpace,
            properTimeSeconds: 0,
            stepCount: 0,
          },
        })
    ).toThrow(/2H=-1/);
  });
});
