import { describe, expect, it } from "vitest";

import {
  addVector3,
  crossVector3,
  dotVector3,
  isFiniteVector3,
  magnitudeVector3,
  scaleVector3,
  subtractVector3,
  vector3,
} from "./vector3";

describe("3D vector operations", () => {
  it("uses all three components", () => {
    const left = vector3(1, 2, 3);
    const right = vector3(-4, 5, -6);

    expect(addVector3(left, right)).toEqual(vector3(-3, 7, -3));
    expect(subtractVector3(left, right)).toEqual(vector3(5, -3, 9));
    expect(scaleVector3(left, 2.5)).toEqual(vector3(2.5, 5, 7.5));
    expect(dotVector3(left, right)).toBe(-12);
    expect(crossVector3(left, right)).toEqual(vector3(-27, -6, 13));
    expect(magnitudeVector3(vector3(2, 3, 6))).toBe(7);
  });

  it("detects non-finite components", () => {
    expect(isFiniteVector3(vector3(1, 2, 3))).toBe(true);
    expect(isFiniteVector3(vector3(1, Number.NaN, 3))).toBe(false);
    expect(isFiniteVector3(vector3(1, 2, Number.POSITIVE_INFINITY))).toBe(
      false
    );
  });
});
