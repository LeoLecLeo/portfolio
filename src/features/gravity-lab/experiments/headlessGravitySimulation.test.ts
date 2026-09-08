import { describe, expect, it } from "vitest";

import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";
import { HeadlessGravitySimulation } from "./headlessGravitySimulation";

describe("headless RK4 gravity simulation", () => {
  it("tracks an analytical Newtonian circular two-body orbit", () => {
    const firstMassKg = 1e26;
    const secondMassKg = 2e26;
    const totalMassKg = firstMassKg + secondMassKg;
    const separationM = 1e9;
    const angularFrequencyPerSecond = Math.sqrt(
      (GRAVITATIONAL_CONSTANT_M3_KG_S2 * totalMassKg) /
        (separationM * separationM * separationM)
    );
    const orbitalPeriodSeconds =
      (2 * Math.PI) / angularFrequencyPerSecond;
    const firstRadiusM = (secondMassKg / totalMassKg) * separationM;
    const secondRadiusM = (firstMassKg / totalMassKg) * separationM;
    const initialPositionsM = new Float64Array([
      -firstRadiusM,
      0,
      0,
      secondRadiusM,
      0,
      0,
    ]);
    const initialVelocitiesMps = new Float64Array([
      0,
      -angularFrequencyPerSecond * firstRadiusM,
      0,
      0,
      angularFrequencyPerSecond * secondRadiusM,
      0,
    ]);
    const stepCount = 512;
    const simulation = new HeadlessGravitySimulation({
      model: "newtonian",
      timeStepSeconds: orbitalPeriodSeconds / stepCount,
      initialState: {
        massesKg: new Float64Array([firstMassKg, secondMassKg]),
        positionsM: initialPositionsM,
        velocitiesMps: initialVelocitiesMps,
      },
    });

    for (let step = 0; step < stepCount; step += 1) {
      simulation.advanceOneStep();
    }

    const finalPositionsM = new Float64Array(6);
    const finalVelocitiesMps = new Float64Array(6);
    simulation.copyPositionsTo(finalPositionsM);
    simulation.copyVelocitiesTo(finalVelocitiesMps);
    let positionErrorSquared = 0;
    let positionScaleSquared = 0;
    let velocityErrorSquared = 0;
    let velocityScaleSquared = 0;

    for (let index = 0; index < 6; index += 1) {
      positionErrorSquared +=
        (finalPositionsM[index] - initialPositionsM[index]) ** 2;
      positionScaleSquared += initialPositionsM[index] ** 2;
      velocityErrorSquared +=
        (finalVelocitiesMps[index] - initialVelocitiesMps[index]) ** 2;
      velocityScaleSquared += initialVelocitiesMps[index] ** 2;
    }

    expect(Math.sqrt(positionErrorSquared / positionScaleSquared)).toBeLessThan(
      5e-9
    );
    expect(Math.sqrt(velocityErrorSquared / velocityScaleSquared)).toBeLessThan(
      5e-9
    );
    expect(simulation.stepCount).toBe(stepCount);
    expect(simulation.timeSeconds).toBe(orbitalPeriodSeconds);
  });

  it("clones initial buffers and produces deterministic independent runs", () => {
    const massesKg = new Float64Array([1e20, 2e20]);
    const positionsM = new Float64Array([0, 0, 0, 1e8, 0, 0]);
    const velocitiesMps = new Float64Array([0, 10, 0, 0, -5, 0]);
    const massesBefore = massesKg.slice();
    const positionsBefore = positionsM.slice();
    const velocitiesBefore = velocitiesMps.slice();
    const first = new HeadlessGravitySimulation({
      model: "first-post-newtonian",
      timeStepSeconds: 10,
      initialState: { massesKg, positionsM, velocitiesMps },
    });
    const second = new HeadlessGravitySimulation({
      model: "first-post-newtonian",
      timeStepSeconds: 10,
      initialState: { massesKg, positionsM, velocitiesMps },
    });

    positionsM.fill(99);
    velocitiesMps.fill(88);

    for (let step = 0; step < 20; step += 1) {
      first.advanceOneStep();
      second.advanceOneStep();
    }

    const firstPositionsM = new Float64Array(6);
    const secondPositionsM = new Float64Array(6);
    first.copyPositionsTo(firstPositionsM);
    second.copyPositionsTo(secondPositionsM);

    expect(firstPositionsM).toEqual(secondPositionsM);
    expect(massesKg).toEqual(massesBefore);
    expect(positionsBefore).not.toEqual(positionsM);
    expect(velocitiesBefore).not.toEqual(velocitiesMps);
  });

  it("rejects invalid initial state without partially constructing a run", () => {
    expect(() =>
      new HeadlessGravitySimulation({
        model: "newtonian",
        timeStepSeconds: 1,
        initialState: {
          massesKg: new Float64Array([1, -2]),
          positionsM: new Float64Array([0, 0, 0, 1, 0, 0]),
          velocitiesMps: new Float64Array(6),
        },
      })
    ).toThrow(/strictly positive/);
  });
});
