import { describe, expect, it } from "vitest";

import {
  ASTRONOMICAL_UNIT_M,
  convertDistanceFromM,
  convertDistanceToM,
  convertMassFromKg,
  convertMassToKg,
  convertSpeedFromMps,
  convertSpeedToMps,
  convertTimeFromSeconds,
  convertTimeToSeconds,
  EARTH_MASS_KG,
  EARTH_RADIUS_M,
  JUPITER_MASS_KG,
  JUPITER_RADIUS_M,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_JULIAN_YEAR,
  SOLAR_MASS_KG,
  SOLAR_RADIUS_M,
  SPEED_OF_LIGHT_MPS,
  type DistanceUnit,
  type MassUnit,
  type SpeedUnit,
  type TimeUnit,
} from "./units";

describe("scientific units", () => {
  it("uses the approved exact speed of light", () => {
    expect(SPEED_OF_LIGHT_MPS).toBe(299_792_458);
  });

  it.each<[MassUnit, number]>([
    ["kg", 1],
    ["earth-mass", EARTH_MASS_KG],
    ["jupiter-mass", JUPITER_MASS_KG],
    ["solar-mass", SOLAR_MASS_KG],
  ])("converts the mass unit %s in both directions", (unit, factor) => {
    expect(convertMassToKg(2, unit)).toBe(2 * factor);
    expect(convertMassFromKg(2 * factor, unit)).toBe(2);
  });

  it.each<[DistanceUnit, number]>([
    ["m", 1],
    ["km", 1_000],
    ["au", ASTRONOMICAL_UNIT_M],
    ["earth-radius", EARTH_RADIUS_M],
    ["jupiter-radius", JUPITER_RADIUS_M],
    ["solar-radius", SOLAR_RADIUS_M],
  ])("converts the distance unit %s in both directions", (unit, factor) => {
    expect(convertDistanceToM(2, unit)).toBe(2 * factor);
    expect(convertDistanceFromM(2 * factor, unit)).toBe(2);
  });

  it.each<[SpeedUnit, number]>([
    ["m/s", 1],
    ["km/s", 1_000],
  ])("converts the speed unit %s in both directions", (unit, factor) => {
    expect(convertSpeedToMps(2, unit)).toBe(2 * factor);
    expect(convertSpeedFromMps(2 * factor, unit)).toBe(2);
  });

  it.each<[TimeUnit, number]>([
    ["s", 1],
    ["hour", SECONDS_PER_HOUR],
    ["day", SECONDS_PER_DAY],
    ["julian-year", SECONDS_PER_JULIAN_YEAR],
  ])("converts the time unit %s in both directions", (unit, factor) => {
    expect(convertTimeToSeconds(2, unit)).toBe(2 * factor);
    expect(convertTimeFromSeconds(2 * factor, unit)).toBe(2);
  });
});
