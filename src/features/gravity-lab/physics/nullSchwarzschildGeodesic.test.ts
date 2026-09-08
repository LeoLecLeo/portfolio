import { describe, expect, it } from "vitest";

import { SOLAR_MASS_KG } from "../core/units";
import { evaluateSchwarzschildHamiltonianDerivative } from "./schwarzschildGeodesic";
import {
  NULL_GEODESIC_INDEX,
  NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  computeNullSchwarzschildDiagnostics,
  createCircularPhotonSphereState,
  createIncomingEquatorialNullSchwarzschildState,
  createNullSchwarzschildState,
  nullImpactParameterM,
  weakFieldSchwarzschildDeflectionRad,
} from "./nullSchwarzschildGeodesic";
import {
  schwarzschildCriticalNullImpactParameterM,
  schwarzschildPhotonSphereRadiusM,
  schwarzschildRadiusM,
} from "./schwarzschildMetric";

describe("null Schwarzschild geodesic state", () => {
  it("constructs the analytical circular photon orbit at 1.5 r_s", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const state = createCircularPhotonSphereState(SOLAR_MASS_KG);
    const diagnostics = computeNullSchwarzschildDiagnostics(state.phaseSpace);

    expect(state.phaseSpace[NULL_GEODESIC_INDEX.radius]).toBeCloseTo(1.5, 15);
    expect(
      schwarzschildPhotonSphereRadiusM(SOLAR_MASS_KG)
    ).toBeCloseTo(1.5 * horizonRadiusM, 14);
    expect(diagnostics.hamiltonian).toBeCloseTo(0, 14);
    expect(diagnostics.constraintResidual).toBeCloseTo(0, 14);
    expect(diagnostics.specificEnergy).toBe(1);
    expect(
      nullImpactParameterM(SOLAR_MASS_KG, state.phaseSpace)
    ).toBeCloseTo(
      schwarzschildCriticalNullImpactParameterM(SOLAR_MASS_KG),
      13
    );
    expect(
      schwarzschildCriticalNullImpactParameterM(SOLAR_MASS_KG) /
        horizonRadiusM
    ).toBeCloseTo((3 * Math.sqrt(3)) / 2, 15);
  });

  it("annuls the radial derivative for the exact photon sphere", () => {
    const state = createCircularPhotonSphereState(SOLAR_MASS_KG);
    const before = state.phaseSpace.slice();
    const derivative = new Float64Array(
      NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH
    );

    evaluateSchwarzschildHamiltonianDerivative(
      state.phaseSpace,
      derivative
    );

    expect(derivative[NULL_GEODESIC_INDEX.radius]).toBe(0);
    expect(derivative[NULL_GEODESIC_INDEX.radialMomentum]).toBeCloseTo(
      0,
      14
    );
    expect(derivative[NULL_GEODESIC_INDEX.polar]).toBe(0);
    expect(derivative[NULL_GEODESIC_INDEX.polarMomentum]).toBeCloseTo(0, 14);
    expect(state.phaseSpace).toEqual(before);
  });

  it("builds an incoming ray from its invariant impact parameter without mutation", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const impactParameterM = 20 * horizonRadiusM;
    const state = createIncomingEquatorialNullSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      initialRadiusM: 200 * horizonRadiusM,
      impactParameterM,
    });
    const before = state.phaseSpace.slice();
    const diagnostics = computeNullSchwarzschildDiagnostics(state.phaseSpace);

    expect(diagnostics.constraintResidual).toBeCloseTo(0, 13);
    expect(state.phaseSpace[NULL_GEODESIC_INDEX.radialMomentum]).toBeLessThan(0);
    expect(nullImpactParameterM(SOLAR_MASS_KG, state.phaseSpace)).toBeCloseTo(
      impactParameterM,
      13
    );
    expect(state.phaseSpace).toEqual(before);
  });

  it("returns the independent weak-field analytical deflection", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);

    expect(
      weakFieldSchwarzschildDeflectionRad(
        SOLAR_MASS_KG,
        100 * horizonRadiusM
      )
    ).toBeCloseTo(0.02, 15);
  });

  it("rejects non-null, past-directed, non-finite, and interior states", () => {
    const circular = createCircularPhotonSphereState(SOLAR_MASS_KG);
    const nonNull = circular.phaseSpace.slice();
    nonNull[NULL_GEODESIC_INDEX.timeMomentum] *= 0.5;
    expect(() => createNullSchwarzschildState(nonNull)).toThrow(/2H=0/);

    const pastDirected = circular.phaseSpace.slice();
    pastDirected[NULL_GEODESIC_INDEX.timeMomentum] *= -1;
    expect(() => createNullSchwarzschildState(pastDirected)).toThrow(
      /future-directed/
    );

    const nonFinite = circular.phaseSpace.slice();
    nonFinite[NULL_GEODESIC_INDEX.azimuthal] = Number.NaN;
    expect(() => createNullSchwarzschildState(nonFinite)).toThrow(/non-finite/);

    const interior = circular.phaseSpace.slice();
    interior[NULL_GEODESIC_INDEX.radius] = 1;
    expect(() => createNullSchwarzschildState(interior)).toThrow(
      /strictly greater than one/
    );
  });
});
