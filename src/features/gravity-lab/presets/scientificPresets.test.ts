import { describe, expect, it } from "vitest";

import {
  appliedScenarioToSimulationConfig,
  isAppliedScenario,
  type AppliedScenario,
} from "../core/scenario";
import type { CelestialBodyDefinition } from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";
import { SimulationEngine } from "../runtime/SimulationEngine";
import {
  CIRCULAR_TWO_BODY_PERIOD_SECONDS,
  CIRCULAR_TWO_BODY_PRESET,
  CIRCULAR_TWO_BODY_RELATIVE_SPEED_MPS,
  CIRCULAR_TWO_BODY_SEPARATION_M,
  CIRCULAR_TWO_BODY_STEPS_PER_PERIOD,
} from "./circularTwoBody";
import {
  HYPERBOLIC_FLYBY_ECCENTRICITY,
  HYPERBOLIC_FLYBY_PERIAPSIS_M,
  HYPERBOLIC_FLYBY_PRESET,
  HYPERBOLIC_FLYBY_SPECIFIC_ENERGY_J_PER_KG,
} from "./hyperbolicFlyby";
import type { GravityPreset } from "./gravityPreset";
import {
  STAR_PLANET_ECCENTRICITY,
  STAR_PLANET_INITIAL_RELATIVE_SPEED_MPS,
  STAR_PLANET_INITIAL_SEPARATION_M,
  STAR_PLANET_PRESET,
  STAR_PLANET_SEMI_MAJOR_AXIS_M,
  STAR_PLANET_STEPS_PER_PERIOD,
  STAR_PLANET_TOTAL_MASS_KG,
} from "./starPlanet";

const ENERGY_DRIFT_LIMIT = 1e-7;

function relativeVector(
  first: CelestialBodyDefinition,
  second: CelestialBodyDefinition,
  field: "initialPositionM" | "initialVelocityMps"
) {
  return {
    x: second[field].x - first[field].x,
    y: second[field].y - first[field].y,
    z: second[field].z - first[field].z,
  };
}

function magnitude(value: Readonly<{ x: number; y: number; z: number }>) {
  return Math.hypot(value.x, value.y, value.z);
}

function expectValidBarycentricScenario(
  preset: GravityPreset
): AppliedScenario {
  const scenario = preset.createScenario();
  const config = appliedScenarioToSimulationConfig(scenario);
  const engine = new SimulationEngine(config);
  const diagnostics = engine.diagnostics();
  const [first, second] = scenario.physics.bodies;
  const separationM = magnitude(
    relativeVector(first, second, "initialPositionM")
  );
  const momentumScale =
    first.massKg * magnitude(first.initialVelocityMps) +
    second.massKg * magnitude(second.initialVelocityMps);

  expect(isAppliedScenario(scenario)).toBe(true);
  expect(Object.isFrozen(scenario)).toBe(true);
  expect(scenario.physics.bodies).toHaveLength(2);
  expect(preset.bodyCount).toBe(scenario.physics.bodies.length);
  expect(separationM).toBeGreaterThan(
    first.physicalRadiusM + second.physicalRadiusM
  );
  expect(magnitude(diagnostics.centerOfMassM) / separationM).toBeLessThan(
    1e-14
  );
  expect(
    magnitude(diagnostics.linearMomentumKgMps) /
      Math.max(1, momentumScale)
  ).toBeLessThan(1e-14);
  expect(scenario.initialValidity.overallLevel).toBe("recommended");
  expect(scenario.initialValidity.beta.level).toBe("recommended");
  expect(scenario.initialValidity.chiPair?.level).toBe("recommended");
  expect(scenario.initialValidity.chiSelf?.level).toBe("recommended");
  expect(scenario.initialValidity.psi.level).toBe("recommended");
  expect(
    scenario.initialValidity.unknownSelfCompactnessBodyIds
  ).toEqual([]);
  expect(scenario.numericalPolicy.timeStepSeconds).toBeGreaterThan(0);
  expect(
    scenario.numericalPolicy.recommendedTimeStepSeconds
  ).not.toBeNull();
  expect(scenario.numericalPolicy.timeStepSeconds).toBeLessThanOrEqual(
    scenario.numericalPolicy.recommendedTimeStepSeconds ?? 0
  );

  return scenario;
}

function evolveAndMeasureEnergyDrift(
  scenario: AppliedScenario,
  stepCount: number
) {
  const engine = new SimulationEngine(
    appliedScenarioToSimulationConfig(scenario)
  );
  const initialEnergyJ = engine.diagnostics().totalEnergyJ;

  expect(engine.start()).toBe(true);

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    expect(engine.advanceOneStep()).toBe(true);
  }

  const state = engine.state;
  const finalEnergyJ = engine.diagnostics().totalEnergyJ;
  const drift = Math.abs(
    (finalEnergyJ - initialEnergyJ) / initialEnergyJ
  );

  expect(engine.status).toBe("running");
  expect(engine.stopEvent).toBeNull();
  expect(Array.from(state.positionsM).every(Number.isFinite)).toBe(true);
  expect(Array.from(state.velocitiesMps).every(Number.isFinite)).toBe(
    true
  );
  expect(engine.newtonianValidity().overallLevel).toBe("recommended");
  expect(drift).toBeLessThan(ENERGY_DRIFT_LIMIT);

  return { drift, engine };
}

describe("circular two-body scientific preset", () => {
  it("is a valid bound circular barycentric orbit", () => {
    const scenario = expectValidBarycentricScenario(
      CIRCULAR_TWO_BODY_PRESET
    );
    const [first, second] = scenario.physics.bodies;
    const separationM = magnitude(
      relativeVector(first, second, "initialPositionM")
    );
    const relativeSpeedMps = magnitude(
      relativeVector(first, second, "initialVelocityMps")
    );
    const engine = new SimulationEngine(
      appliedScenarioToSimulationConfig(scenario)
    );

    expect(separationM).toBe(CIRCULAR_TWO_BODY_SEPARATION_M);
    expect(relativeSpeedMps).toBeCloseTo(
      CIRCULAR_TWO_BODY_RELATIVE_SPEED_MPS,
      12
    );
    expect(engine.diagnostics().totalEnergyJ).toBeLessThan(0);
    expect(
      scenario.numericalPolicy.timeStepSeconds *
        CIRCULAR_TWO_BODY_STEPS_PER_PERIOD
    ).toBeCloseTo(CIRCULAR_TWO_BODY_PERIOD_SECONDS, 8);
  });

  it("completes one period without collision or excessive energy drift", () => {
    const { drift } = evolveAndMeasureEnergyDrift(
      CIRCULAR_TWO_BODY_PRESET.createScenario(),
      CIRCULAR_TWO_BODY_STEPS_PER_PERIOD
    );

    expect(drift).toBeLessThan(1e-8);
  });
});

describe("star-planet quasi-circular scientific preset", () => {
  it("uses the low-eccentricity periapsis speed in a bound barycentric system", () => {
    const scenario = expectValidBarycentricScenario(STAR_PLANET_PRESET);
    const [star, planet] = scenario.physics.bodies;
    const relativeSpeedMps = magnitude(
      relativeVector(star, planet, "initialVelocityMps")
    );
    const expectedVisVivaSpeedMps = Math.sqrt(
      GRAVITATIONAL_CONSTANT_M3_KG_S2 *
        STAR_PLANET_TOTAL_MASS_KG *
        (2 / STAR_PLANET_INITIAL_SEPARATION_M -
          1 / STAR_PLANET_SEMI_MAJOR_AXIS_M)
    );
    const engine = new SimulationEngine(
      appliedScenarioToSimulationConfig(scenario)
    );

    expect(STAR_PLANET_ECCENTRICITY).toBeLessThan(0.02);
    expect(relativeSpeedMps).toBeCloseTo(
      STAR_PLANET_INITIAL_RELATIVE_SPEED_MPS,
      10
    );
    expect(relativeSpeedMps).toBeCloseTo(expectedVisVivaSpeedMps, 10);
    expect(engine.diagnostics().totalEnergyJ).toBeLessThan(0);
  });

  it("completes one orbital period without collision or excessive energy drift", () => {
    const { drift } = evolveAndMeasureEnergyDrift(
      STAR_PLANET_PRESET.createScenario(),
      STAR_PLANET_STEPS_PER_PERIOD
    );

    expect(drift).toBeLessThan(1e-8);
  });
});

describe("hyperbolic two-body flyby scientific preset", () => {
  it("starts on an approaching unbound trajectory with a safe periapsis", () => {
    const scenario = expectValidBarycentricScenario(
      HYPERBOLIC_FLYBY_PRESET
    );
    const [primary, visitor] = scenario.physics.bodies;
    const relativePositionM = relativeVector(
      primary,
      visitor,
      "initialPositionM"
    );
    const relativeVelocityMps = relativeVector(
      primary,
      visitor,
      "initialVelocityMps"
    );
    const radialVelocityMps =
      (relativePositionM.x * relativeVelocityMps.x +
        relativePositionM.y * relativeVelocityMps.y +
        relativePositionM.z * relativeVelocityMps.z) /
      magnitude(relativePositionM);
    const engine = new SimulationEngine(
      appliedScenarioToSimulationConfig(scenario)
    );

    expect(HYPERBOLIC_FLYBY_SPECIFIC_ENERGY_J_PER_KG).toBeGreaterThan(
      0
    );
    expect(HYPERBOLIC_FLYBY_ECCENTRICITY).toBeGreaterThan(1);
    expect(HYPERBOLIC_FLYBY_PERIAPSIS_M).toBeGreaterThan(
      primary.physicalRadiusM + visitor.physicalRadiusM
    );
    expect(radialVelocityMps).toBeLessThan(0);
    expect(engine.diagnostics().totalEnergyJ).toBeGreaterThan(0);
  });

  it("passes periapsis without collision, non-finitude or excessive energy drift", () => {
    const { drift, engine } = evolveAndMeasureEnergyDrift(
      HYPERBOLIC_FLYBY_PRESET.createScenario(),
      5_000
    );
    const state = engine.state;
    const finalRelativePosition = {
      x: state.positionsM[3] - state.positionsM[0],
      y: state.positionsM[4] - state.positionsM[1],
      z: state.positionsM[5] - state.positionsM[2],
    };
    const finalRelativeVelocity = {
      x: state.velocitiesMps[3] - state.velocitiesMps[0],
      y: state.velocitiesMps[4] - state.velocitiesMps[1],
      z: state.velocitiesMps[5] - state.velocitiesMps[2],
    };
    const finalRadialDotProduct =
      finalRelativePosition.x * finalRelativeVelocity.x +
      finalRelativePosition.y * finalRelativeVelocity.y +
      finalRelativePosition.z * finalRelativeVelocity.z;

    expect(finalRadialDotProduct).toBeGreaterThan(0);
    expect(drift).toBeLessThan(1e-7);
  });
});
