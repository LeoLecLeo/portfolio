export const GRAVITATIONAL_CONSTANT_M3_KG_S2 = 6.6743e-11;
export const SPEED_OF_LIGHT_MPS = 299_792_458;

export const ASTRONOMICAL_UNIT_M = 149_597_870_700;

export const EARTH_MASS_KG = 5.9722e24;
export const JUPITER_MASS_KG = 1.89813e27;
export const SOLAR_MASS_KG = 1.98847e30;

export const EARTH_RADIUS_M = 6_371_000;
export const JUPITER_RADIUS_M = 69_911_000;
export const SOLAR_RADIUS_M = 695_700_000;

export const SECONDS_PER_HOUR = 3_600;
export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_JULIAN_YEAR = 31_557_600;

export type MassUnit =
  | "kg"
  | "earth-mass"
  | "jupiter-mass"
  | "solar-mass";

export type DistanceUnit =
  | "m"
  | "km"
  | "au"
  | "earth-radius"
  | "jupiter-radius"
  | "solar-radius";

export type SpeedUnit = "m/s" | "km/s";

export type TimeUnit = "s" | "hour" | "day" | "julian-year";

const MASS_FACTORS_KG: Readonly<Record<MassUnit, number>> = {
  kg: 1,
  "earth-mass": EARTH_MASS_KG,
  "jupiter-mass": JUPITER_MASS_KG,
  "solar-mass": SOLAR_MASS_KG,
};

const DISTANCE_FACTORS_M: Readonly<Record<DistanceUnit, number>> = {
  m: 1,
  km: 1_000,
  au: ASTRONOMICAL_UNIT_M,
  "earth-radius": EARTH_RADIUS_M,
  "jupiter-radius": JUPITER_RADIUS_M,
  "solar-radius": SOLAR_RADIUS_M,
};

const SPEED_FACTORS_MPS: Readonly<Record<SpeedUnit, number>> = {
  "m/s": 1,
  "km/s": 1_000,
};

const TIME_FACTORS_SECONDS: Readonly<Record<TimeUnit, number>> = {
  s: 1,
  hour: SECONDS_PER_HOUR,
  day: SECONDS_PER_DAY,
  "julian-year": SECONDS_PER_JULIAN_YEAR,
};

export function convertMassToKg(value: number, unit: MassUnit): number {
  return value * MASS_FACTORS_KG[unit];
}

export function convertMassFromKg(valueKg: number, unit: MassUnit): number {
  return valueKg / MASS_FACTORS_KG[unit];
}

export function convertDistanceToM(
  value: number,
  unit: DistanceUnit
): number {
  return value * DISTANCE_FACTORS_M[unit];
}

export function convertDistanceFromM(
  valueM: number,
  unit: DistanceUnit
): number {
  return valueM / DISTANCE_FACTORS_M[unit];
}

export function convertSpeedToMps(value: number, unit: SpeedUnit): number {
  return value * SPEED_FACTORS_MPS[unit];
}

export function convertSpeedFromMps(
  valueMps: number,
  unit: SpeedUnit
): number {
  return valueMps / SPEED_FACTORS_MPS[unit];
}

export function convertTimeToSeconds(value: number, unit: TimeUnit): number {
  return value * TIME_FACTORS_SECONDS[unit];
}

export function convertTimeFromSeconds(
  valueSeconds: number,
  unit: TimeUnit
): number {
  return valueSeconds / TIME_FACTORS_SECONDS[unit];
}
