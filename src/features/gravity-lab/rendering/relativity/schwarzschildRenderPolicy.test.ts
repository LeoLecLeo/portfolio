import { describe, expect, it } from "vitest";

import { SOLAR_MASS_KG } from "../../core/units";
import { createSchwarzschildVisualizationExperiment } from "../../experiments/schwarzschildVisualizationExperiment";
import {
  schwarzschildIscoRadiusM,
  schwarzschildPhotonSphereRadiusM,
  schwarzschildRadiusM,
} from "../../physics/schwarzschildMetric";
import {
  DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
  createFlammEmbeddingMeshData,
  flammEmbeddingHeightM,
  mapFlammHeightToScene,
  projectSchwarzschildCharacteristicRadii,
  projectSchwarzschildPointToFlammScene,
} from "./schwarzschildRenderPolicy";

describe("Schwarzschild render policy", () => {
  it("projects the physical horizon, photon sphere, and ISCO without independent graphic constants", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const projected = projectSchwarzschildCharacteristicRadii(
      SOLAR_MASS_KG
    );

    expect(projected.schwarzschildRadiusM).toBe(horizonRadiusM);
    expect(projected.photonSphereRadiusM).toBe(
      schwarzschildPhotonSphereRadiusM(SOLAR_MASS_KG)
    );
    expect(projected.iscoRadiusM).toBe(
      schwarzschildIscoRadiusM(SOLAR_MASS_KG)
    );
    expect(projected.horizonSceneRadius).toBe(1);
    expect(projected.photonSphereSceneRadius).toBe(1.5);
    expect(projected.iscoSceneRadius).toBe(3);
  });

  it("matches the exact Flamm embedding before any visual amplification", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const radiusM = 5 * horizonRadiusM;
    const expectedHeightM = 2 * Math.sqrt(
      horizonRadiusM * (radiusM - horizonRadiusM)
    );
    const exactPolicy = {
      ...DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
      embeddingVerticalAmplification: 1,
    };

    expect(flammEmbeddingHeightM(horizonRadiusM, radiusM)).toBe(
      expectedHeightM
    );
    expect(
      mapFlammHeightToScene(expectedHeightM, horizonRadiusM, exactPolicy)
    ).toBeCloseTo(4, 14);
  });

  it("keeps visual amplification outside the physical geometry and does not mutate inputs", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const physicalHeightM = flammEmbeddingHeightM(
      horizonRadiusM,
      3 * horizonRadiusM
    );
    const point = Object.freeze({
      radiusM: 3 * horizonRadiusM,
      polarAngleRad: Math.PI / 2,
      azimuthalAngleRad: Math.PI / 3,
    });
    const pointBefore = { ...point };
    const exactPolicy = {
      ...DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
      embeddingVerticalAmplification: 1,
    };
    const amplifiedPolicy = {
      ...DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
      embeddingVerticalAmplification: 2,
    };
    const exact = projectSchwarzschildPointToFlammScene(
      point,
      horizonRadiusM,
      exactPolicy
    );
    const amplified = projectSchwarzschildPointToFlammScene(
      point,
      horizonRadiusM,
      amplifiedPolicy
    );

    expect(amplified.x).toBe(exact.x);
    expect(amplified.z).toBe(exact.z);
    expect(amplified.y).toBeCloseTo(exact.y * 2, 14);
    expect(physicalHeightM).toBe(
      flammEmbeddingHeightM(horizonRadiusM, point.radiusM)
    );
    expect(point).toEqual(pointBefore);
  });

  it("creates a bounded finite mesh with the documented resolution", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);
    const mesh = createFlammEmbeddingMeshData(horizonRadiusM);

    expect(mesh.vertexCount).toBe(49 * 97);
    expect(mesh.triangleCount).toBe(48 * 96 * 2);
    expect(mesh.positions).toHaveLength(mesh.vertexCount * 3);
    expect(mesh.indices).toHaveLength(mesh.triangleCount * 3);
    expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
    expect(mesh.minimumRadiusScene).toBeCloseTo(1.001, 12);
    expect(mesh.maximumRadiusScene).toBe(8);
    expect(mesh.maximumRenderedEmbeddingHeightScene).toBeGreaterThan(0);
    expect(mesh.maximumRenderedEmbeddingHeightScene).toBeLessThan(8);
  });

  it("renders a deterministic engine-produced geodesic without mutating its physical samples", () => {
    const experiment = createSchwarzschildVisualizationExperiment();
    const physicalBefore = experiment.trajectory.map((point) => ({ ...point }));
    const projected = experiment.trajectory.map((point) =>
      projectSchwarzschildPointToFlammScene(
        point,
        experiment.schwarzschildRadiusM
      )
    );

    expect(experiment.trajectory).toHaveLength(513);
    expect(experiment.maxConstraintResidual).toBeLessThan(1e-12);
    expect(projected.every(({ x, y, z }) =>
      [x, y, z].every(Number.isFinite)
    )).toBe(true);
    expect(experiment.trajectory).toEqual(physicalBefore);
    expect(createSchwarzschildVisualizationExperiment()).toEqual(experiment);
  });

  it("rejects non-finite or out-of-domain embedding inputs", () => {
    const horizonRadiusM = schwarzschildRadiusM(SOLAR_MASS_KG);

    expect(() =>
      flammEmbeddingHeightM(horizonRadiusM, horizonRadiusM * 0.99)
    ).toThrow(/no smaller than r_s/);
    expect(() =>
      mapFlammHeightToScene(Number.POSITIVE_INFINITY, horizonRadiusM)
    ).toThrow(/finite/);
    expect(() =>
      createFlammEmbeddingMeshData(horizonRadiusM, {
        ...DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
        embeddingOuterRadiusRatio: Number.NaN,
      })
    ).toThrow(/radial bounds/);
  });
});
