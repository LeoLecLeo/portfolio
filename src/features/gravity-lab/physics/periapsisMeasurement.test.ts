import { describe, expect, it } from "vitest";

import { vector3 } from "../core/vector3";
import {
  detectPeriapsisBetweenStates,
  measurePeriapsisAdvance,
  type PeriapsisEvent,
} from "./periapsisMeasurement";

describe("headless periapsis measurement", () => {
  it("locates an analytical between-sample minimum with Hermite interpolation", () => {
    const minimumTimeSeconds = 0.37;
    const minimumDistanceM = 4e10;
    const radialAccelerationMps2 = 2e6;

    function positionAt(timeSeconds: number): number {
      const offsetSeconds = timeSeconds - minimumTimeSeconds;
      return (
        minimumDistanceM +
        0.5 * radialAccelerationMps2 * offsetSeconds * offsetSeconds
      );
    }

    function velocityAt(timeSeconds: number): number {
      return radialAccelerationMps2 * (timeSeconds - minimumTimeSeconds);
    }

    const event = detectPeriapsisBetweenStates(
      new Float64Array([positionAt(0), 0, 0]),
      new Float64Array([velocityAt(0), 0, 0]),
      new Float64Array([positionAt(1), 0, 0]),
      new Float64Array([velocityAt(1), 0, 0]),
      12,
      1
    );

    expect(event).not.toBeNull();
    expect(event?.timeSeconds).toBeCloseTo(12 + minimumTimeSeconds, 13);
    expect(event?.distanceM).toBeCloseTo(minimumDistanceM, 13);
  });

  it("does not report an event without a negative-to-positive radial crossing", () => {
    const event = detectPeriapsisBetweenStates(
      new Float64Array([1, 0, 0]),
      new Float64Array([1, 0, 0]),
      new Float64Array([2, 0, 0]),
      new Float64Array([1, 0, 0]),
      0,
      1
    );

    expect(event).toBeNull();
  });

  it("recovers a known signed angular advance by regression", () => {
    const expectedAdvanceRadians = 4.5e-4;
    const events: PeriapsisEvent[] = [];

    for (let eventIndex = 0; eventIndex < 12; eventIndex += 1) {
      const angle = eventIndex * expectedAdvanceRadians;
      events.push({
        timeSeconds: eventIndex * 100,
        distanceM: 10,
        relativePositionM: vector3(
          10 * Math.cos(angle),
          10 * Math.sin(angle),
          0
        ),
      });
    }

    const measurement = measurePeriapsisAdvance(
      events,
      vector3(0, 0, 1)
    );

    expect(measurement.radiansPerOrbit).toBeCloseTo(
      expectedAdvanceRadians,
      14
    );
    expect(measurement.rmsAngularResidualRadians).toBeLessThan(1e-17);
  });

  it("rejects non-finite interpolation data and insufficient events", () => {
    expect(() =>
      detectPeriapsisBetweenStates(
        new Float64Array([Number.NaN, 0, 0]),
        new Float64Array(3),
        new Float64Array([1, 0, 0]),
        new Float64Array(3),
        0,
        1
      )
    ).toThrow(/finite/);
    expect(() =>
      measurePeriapsisAdvance(
        [
          {
            timeSeconds: 0,
            distanceM: 1,
            relativePositionM: vector3(1, 0, 0),
          },
          {
            timeSeconds: 1,
            distanceM: 1,
            relativePositionM: vector3(1, 0, 0),
          },
        ],
        vector3(0, 0, 1)
      )
    ).toThrow(/at least three/);
  });
});
