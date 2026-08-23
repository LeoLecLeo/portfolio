import { describe, expect, it } from "vitest";

import { SOLAR_MASS_KG } from "../core/units";
import {
  MASSIVE_GEODESIC_INDEX,
  MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  circularMassiveGeodesicProperPeriodSeconds,
  computeMassiveSchwarzschildDiagnostics,
  createCircularMassiveSchwarzschildState,
  createMassiveSchwarzschildState,
  evaluateMassiveSchwarzschildHamiltonianDerivative,
  massiveGeodesicArealRadiusM,
  massiveGeodesicCoordinateTimeSeconds,
} from "./massiveSchwarzschildGeodesic";
import { schwarzschildRadiusM } from "./schwarzschildMetric";

describe("massive Schwarzschild Hamiltonian", () => {
  it("constructs an analytical future-directed circular timelike state", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const radiusRatio = 10;
    const state = createCircularMassiveSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: radiusRatio * horizonRadiusM,
    });
    const diagnostics = computeMassiveSchwarzschildDiagnostics(
      state.phaseSpace
    );
    const expectedEnergy =
      (1 - 1 / radiusRatio) /
      Math.sqrt(1 - 3 / (2 * radiusRatio));
    const expectedAngularMomentum =
      Math.sqrt(radiusRatio / 2) /
      Math.sqrt(1 - 3 / (2 * radiusRatio));

    expect(diagnostics.hamiltonian).toBeCloseTo(-0.5, 14);
    expect(diagnostics.constraintResidual).toBeCloseTo(0, 14);
    expect(diagnostics.specificEnergy).toBeCloseTo(expectedEnergy, 14);
    expect(diagnostics.specificAngularMomentum).toBeCloseTo(
      expectedAngularMomentum,
      14
    );
    expect(
      massiveGeodesicArealRadiusM(SOLAR_MASS_KG, state.phaseSpace)
    ).toBeCloseTo(radiusRatio * horizonRadiusM, 12);
  });

  it("annuls the radial Hamiltonian derivative for an exact circular orbit", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const state = createCircularMassiveSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: 8 * horizonRadiusM,
    });
    const derivative = new Float64Array(
      MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH
    );

    evaluateMassiveSchwarzschildHamiltonianDerivative(
      state.phaseSpace,
      derivative
    );

    expect(derivative[MASSIVE_GEODESIC_INDEX.radius]).toBe(0);
    expect(derivative[MASSIVE_GEODESIC_INDEX.radialMomentum]).toBeCloseTo(
      0,
      14
    );
    expect(derivative[MASSIVE_GEODESIC_INDEX.timeMomentum]).toBe(0);
    expect(derivative[MASSIVE_GEODESIC_INDEX.azimuthalMomentum]).toBe(0);
  });

  it("does not mutate input buffers and rejects aliased output", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const source = createCircularMassiveSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: 8 * horizonRadiusM,
    });
    const phaseSpaceBefore = source.phaseSpace.slice();
    const derivative = new Float64Array(
      MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH
    );

    evaluateMassiveSchwarzschildHamiltonianDerivative(
      source.phaseSpace,
      derivative
    );

    expect(source.phaseSpace).toEqual(phaseSpaceBefore);
    expect(() =>
      evaluateMassiveSchwarzschildHamiltonianDerivative(
        source.phaseSpace,
        source.phaseSpace
      )
    ).toThrow(/must not alias/);
  });

  it("keeps Schwarzschild coordinate time distinct from proper time", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const circular = createCircularMassiveSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: 10 * horizonRadiusM,
    });
    const phaseSpace = circular.phaseSpace.slice();
    phaseSpace[MASSIVE_GEODESIC_INDEX.time] = 12;
    const state = createMassiveSchwarzschildState(phaseSpace, 0.001, 2);

    expect(
      massiveGeodesicCoordinateTimeSeconds(SOLAR_MASS_KG, state.phaseSpace)
    ).not.toBe(state.properTimeSeconds);
    expect(
      circularMassiveGeodesicProperPeriodSeconds(
        SOLAR_MASS_KG,
        10 * horizonRadiusM
      )
    ).toBeGreaterThan(0);
  });

  it("clones valid states and rejects non-massive or out-of-domain states", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const circular = createCircularMassiveSchwarzschildState({
      centralMassKg: SOLAR_MASS_KG,
      radiusM: 8 * horizonRadiusM,
    });
    const source = circular.phaseSpace.slice();
    const state = createMassiveSchwarzschildState(source);
    source.fill(99);

    expect(state.phaseSpace).not.toEqual(source);

    const interior = circular.phaseSpace.slice();
    interior[MASSIVE_GEODESIC_INDEX.radius] = 1;
    expect(() => createMassiveSchwarzschildState(interior)).toThrow(
      /strictly greater than one/
    );

    const nonFinite = circular.phaseSpace.slice();
    nonFinite[MASSIVE_GEODESIC_INDEX.azimuthal] = Number.NaN;
    expect(() => createMassiveSchwarzschildState(nonFinite)).toThrow(
      /non-finite/
    );

    const wrongConstraint = circular.phaseSpace.slice();
    wrongConstraint[MASSIVE_GEODESIC_INDEX.timeMomentum] *= 0.5;
    expect(() => createMassiveSchwarzschildState(wrongConstraint)).toThrow(
      /2H=-1/
    );

    expect(() =>
      createCircularMassiveSchwarzschildState({
        centralMassKg: SOLAR_MASS_KG,
        radiusM: 1.5 * horizonRadiusM,
      })
    ).toThrow(/greater than 3\/2/);
  });
});
