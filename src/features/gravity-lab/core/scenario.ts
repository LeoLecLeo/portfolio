import type {
  CelestialBodyDefinition,
  EncounterThresholds,
  NewtonianSimulationConfig,
} from "./types";
import {
  convertDistanceFromM,
  convertDistanceToM,
  convertMassFromKg,
  convertMassToKg,
  convertSpeedFromMps,
  convertSpeedToMps,
  convertTimeFromSeconds,
  convertTimeToSeconds,
  type DistanceUnit,
  type MassUnit,
  type SpeedUnit,
  type TimeUnit,
} from "./units";
import {
  parseDecimalNumber,
  type DecimalParseResult,
} from "./parsing";
import type {
  SimulationConfigValidationReport,
  ValidationDiagnostic,
  ValidationDiagnosticCode,
} from "./validation";
import { vector3 } from "./vector3";
import type { NewtonianValidityReport } from "../physics/newtonianValidity";
import type {
  PrecisionProfile,
  TimeStepBudgetAssessment,
  TimeStepRecommendation,
} from "../physics/timeStepRecommendation";

export type DraftFieldIssue = Readonly<{
  code: ValidationDiagnosticCode;
  message: string;
}>;

export type DraftNumberProvenance<Unit extends string> =
  | Readonly<{
      kind: "user";
    }>
  | Readonly<{
      kind: "canonical-si";
      rawText: string;
      unit: Unit;
      siValue: number;
    }>;

export type DraftNumber<Unit extends string> = Readonly<{
  rawText: string;
  unit: Unit;
  parseResult: DecimalParseResult;
  siValue: number | null;
  lastValidSiValue: number | null;
  errors: readonly DraftFieldIssue[];
  warnings: readonly DraftFieldIssue[];
  provenance: DraftNumberProvenance<Unit>;
}>;

export type DraftUnitConverter<Unit extends string> = Readonly<{
  toSi: (value: number, unit: Unit) => number;
  fromSi: (valueSi: number, unit: Unit) => number;
}>;

export type DraftNumberResolution<Unit extends string> = Readonly<{
  field: DraftNumber<Unit>;
  siValue: number | null;
}>;

export const MASS_DRAFT_UNIT_CONVERTER: DraftUnitConverter<MassUnit> = Object.freeze({
  toSi: convertMassToKg,
  fromSi: convertMassFromKg,
});

export const DISTANCE_DRAFT_UNIT_CONVERTER: DraftUnitConverter<DistanceUnit> = Object.freeze({
  toSi: convertDistanceToM,
  fromSi: convertDistanceFromM,
});

export const SPEED_DRAFT_UNIT_CONVERTER: DraftUnitConverter<SpeedUnit> = Object.freeze({
  toSi: convertSpeedToMps,
  fromSi: convertSpeedFromMps,
});

export const TIME_DRAFT_UNIT_CONVERTER: DraftUnitConverter<TimeUnit> = Object.freeze({
  toSi: convertTimeToSeconds,
  fromSi: convertTimeFromSeconds,
});

function parseIssue(parseResult: DecimalParseResult): DraftFieldIssue | null {
  if (parseResult.ok) {
    return null;
  }

  switch (parseResult.reason) {
    case "missing":
      return {
        code: "parse.required",
        message: "A value is required.",
      };
    case "invalid-syntax":
      return {
        code: "parse.invalid-syntax",
        message: "The complete value must use supported decimal syntax.",
      };
    case "non-finite":
      return {
        code: "parse.non-finite",
        message: "The value must be finite.",
      };
    case "underflow":
      return {
        code: "parse.underflow",
        message: "The non-zero value is too small to represent numerically.",
      };
  }
}

function matchesCanonicalProvenance<Unit extends string>(
  provenance: DraftNumberProvenance<Unit>,
  rawText: string,
  unit: Unit,
  convertedSiValue: number
): provenance is Extract<
  DraftNumberProvenance<Unit>,
  { kind: "canonical-si" }
> {
  if (
    provenance.kind !== "canonical-si" ||
    provenance.rawText !== rawText ||
    provenance.unit !== unit
  ) {
    return false;
  }

  const tolerance =
    Number.EPSILON *
    Math.max(
      1,
      Math.abs(provenance.siValue),
      Math.abs(convertedSiValue)
    ) *
    8;

  return Math.abs(provenance.siValue - convertedSiValue) <= tolerance;
}

export function resolveDraftNumber<Unit extends string>(
  rawText: string,
  unit: Unit,
  converter: DraftUnitConverter<Unit>,
  previousLastValidSiValue: number | null = null,
  provenance: DraftNumberProvenance<Unit> = { kind: "user" }
): DraftNumberResolution<Unit> {
  const parseResult = parseDecimalNumber(rawText);
  const issue = parseIssue(parseResult);
  const storedProvenance: DraftNumberProvenance<Unit> =
    provenance.kind === "user"
      ? { kind: "user" }
      : {
          kind: "canonical-si",
          rawText: provenance.rawText,
          unit: provenance.unit,
          siValue: provenance.siValue,
        };

  if (!parseResult.ok) {
    const field: DraftNumber<Unit> = {
      rawText,
      unit,
      parseResult,
      siValue: null,
      lastValidSiValue: previousLastValidSiValue,
      errors: issue === null ? [] : [issue],
      warnings: [],
      provenance: storedProvenance,
    };

    return { field, siValue: null };
  }

  const convertedSiValue = converter.toSi(parseResult.value, unit);

  if (!Number.isFinite(convertedSiValue)) {
    const conversionIssue: DraftFieldIssue = {
      code: "parse.si-conversion-non-finite",
      message: "Converting this value to SI does not produce a finite number.",
    };
    const field: DraftNumber<Unit> = {
      rawText,
      unit,
      parseResult,
      siValue: null,
      lastValidSiValue: previousLastValidSiValue,
      errors: [conversionIssue],
      warnings: [],
      provenance: storedProvenance,
    };

    return { field, siValue: null };
  }

  const siValue = matchesCanonicalProvenance(
    storedProvenance,
    rawText,
    unit,
    convertedSiValue
  )
    ? storedProvenance.siValue
    : convertedSiValue;
  const field: DraftNumber<Unit> = {
    rawText,
    unit,
    parseResult,
    siValue,
    lastValidSiValue: siValue,
    errors: [],
    warnings: [],
    provenance: storedProvenance,
  };

  return { field, siValue };
}

export function createDraftNumber<Unit extends string>(
  rawText: string,
  unit: Unit,
  converter: DraftUnitConverter<Unit>
): DraftNumber<Unit> {
  return resolveDraftNumber(rawText, unit, converter).field;
}

export function createDraftNumberFromSi<Unit extends string>(
  siValue: number,
  unit: Unit,
  converter: DraftUnitConverter<Unit>
): DraftNumber<Unit> {
  if (!Number.isFinite(siValue)) {
    throw new RangeError("A canonical draft value must be finite.");
  }

  const displayValue = converter.fromSi(siValue, unit);

  if (!Number.isFinite(displayValue)) {
    throw new RangeError("The canonical value cannot be displayed in this unit.");
  }

  const rawText = String(displayValue);
  const provenance: DraftNumberProvenance<Unit> = {
    kind: "canonical-si",
    rawText,
    unit,
    siValue,
  };

  return resolveDraftNumber(rawText, unit, converter, siValue, provenance).field;
}

export function updateDraftNumberRawText<Unit extends string>(
  field: DraftNumber<Unit>,
  rawText: string,
  converter: DraftUnitConverter<Unit>
): DraftNumber<Unit> {
  return resolveDraftNumber(
    rawText,
    field.unit,
    converter,
    field.lastValidSiValue,
    { kind: "user" }
  ).field;
}

export type DraftUnitChangeResult<Unit extends string> =
  | Readonly<{
      changed: true;
      field: DraftNumber<Unit>;
    }>
  | Readonly<{
      changed: false;
      field: DraftNumber<Unit>;
    }>;

export function changeDraftNumberUnit<Unit extends string>(
  field: DraftNumber<Unit>,
  nextUnit: Unit,
  converter: DraftUnitConverter<Unit>
): DraftUnitChangeResult<Unit> {
  if (field.lastValidSiValue === null) {
    return { changed: false, field };
  }

  return {
    changed: true,
    field: createDraftNumberFromSi(
      field.lastValidSiValue,
      nextUnit,
      converter
    ),
  };
}

export type BodyDraft = Readonly<{
  id: string;
  name: string;
  fixed: boolean;
  mass: DraftNumber<MassUnit>;
  physicalRadius: DraftNumber<DistanceUnit>;
  initialPosition: Readonly<{
    x: DraftNumber<DistanceUnit>;
    y: DraftNumber<DistanceUnit>;
    z: DraftNumber<DistanceUnit>;
  }>;
  initialVelocity: Readonly<{
    x: DraftNumber<SpeedUnit>;
    y: DraftNumber<SpeedUnit>;
    z: DraftNumber<SpeedUnit>;
  }>;
}>;

export type ScenarioDraft = Readonly<{
  bodies: readonly BodyDraft[];
  precisionProfile: PrecisionProfile;
  maximumTimeStep: DraftNumber<TimeUnit> | null;
}>;

export type ScenarioValidationReport = Readonly<{
  valid: boolean;
  diagnostics: readonly ValidationDiagnostic[];
  errors: readonly ValidationDiagnostic[];
  warnings: readonly ValidationDiagnostic[];
  analyzedDraft: ScenarioDraft;
  canonicalValidation: SimulationConfigValidationReport | null;
  timeStepRecommendation: TimeStepRecommendation | null;
  budgetAssessment: TimeStepBudgetAssessment | null;
  newtonianValidity: NewtonianValidityReport | null;
}>;

const APPLIED_SCENARIO_KIND =
  "gravity-lab-applied-scenario-v1" as const;

export type AppliedScenario = Readonly<{
  kind: typeof APPLIED_SCENARIO_KIND;
  physics: Readonly<{
    bodies: readonly CelestialBodyDefinition[];
  }>;
  numericalPolicy: Readonly<{
    precisionProfile: PrecisionProfile;
    qTarget: number;
    recommendedTimeStepSeconds: number | null;
    maximumTimeStepSeconds: number | null;
    timeStepSeconds: number;
    encounterThresholds: EncounterThresholds;
    timeStepRecommendation: TimeStepRecommendation;
    budgetAssessment: TimeStepBudgetAssessment | null;
  }>;
  initialValidity: NewtonianValidityReport;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function hasVectorShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z) &&
    Object.isFrozen(value)
  );
}

function hasBodyShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isFiniteNumber(value.massKg) &&
    isFiniteNumber(value.physicalRadiusM) &&
    typeof value.fixed === "boolean" &&
    hasVectorShape(value.initialPositionM) &&
    hasVectorShape(value.initialVelocityMps) &&
    Object.isFrozen(value)
  );
}

export function isAppliedScenario(value: unknown): value is AppliedScenario {
  if (
    !isRecord(value) ||
    value.kind !== APPLIED_SCENARIO_KIND ||
    !isRecord(value.physics) ||
    !Array.isArray(value.physics.bodies) ||
    !value.physics.bodies.every(hasBodyShape) ||
    !isRecord(value.numericalPolicy) ||
    !isRecord(value.initialValidity)
  ) {
    return false;
  }

  const policy = value.numericalPolicy;
  const profile = policy.precisionProfile;
  const expectedQTarget =
    profile === "fast"
      ? 0.01
      : profile === "balanced"
        ? 0.005
        : profile === "precise"
          ? 0.0025
          : null;
  const recommendation = policy.timeStepRecommendation;
  const encounterThresholds = policy.encounterThresholds;
  const budgetAssessment = policy.budgetAssessment;

  return (
    expectedQTarget !== null &&
    policy.qTarget === expectedQTarget &&
    isFiniteNumber(policy.timeStepSeconds) &&
    policy.timeStepSeconds > 0 &&
    isNullableFiniteNumber(policy.recommendedTimeStepSeconds) &&
    isNullableFiniteNumber(policy.maximumTimeStepSeconds) &&
    (policy.maximumTimeStepSeconds === null ||
      (policy.maximumTimeStepSeconds > 0 &&
        policy.timeStepSeconds <= policy.maximumTimeStepSeconds)) &&
    (policy.recommendedTimeStepSeconds === null ||
      (policy.recommendedTimeStepSeconds > 0 &&
        policy.timeStepSeconds <= policy.recommendedTimeStepSeconds)) &&
    isRecord(encounterThresholds) &&
    encounterThresholds.maxRelativeDisplacementPerStep === 0.02 &&
    encounterThresholds.maxDynamicalStep === 0.02 &&
    isRecord(recommendation) &&
    recommendation.profile === profile &&
    recommendation.qTarget === expectedQTarget &&
    recommendation.recommendedTimeStepSeconds ===
      policy.recommendedTimeStepSeconds &&
    (budgetAssessment === null || isRecord(budgetAssessment)) &&
    Object.isFrozen(value) &&
    Object.isFrozen(value.physics) &&
    Object.isFrozen(value.physics.bodies) &&
    Object.isFrozen(policy) &&
    Object.isFrozen(encounterThresholds) &&
    Object.isFrozen(recommendation) &&
    (budgetAssessment === null || Object.isFrozen(budgetAssessment)) &&
    Object.isFrozen(value.initialValidity)
  );
}

export type ScenarioCompilationResult =
  | Readonly<{
      ok: true;
      scenario: AppliedScenario;
      report: ScenarioValidationReport;
    }>
  | Readonly<{
      ok: false;
      scenario: null;
      report: ScenarioValidationReport;
    }>;

export function appliedScenarioToSimulationConfig(
  scenario: AppliedScenario
): NewtonianSimulationConfig {
  if (!isAppliedScenario(scenario)) {
    throw new TypeError(
      "Only an immutable scenario produced by the canonical compiler can be applied."
    );
  }

  return {
    bodies: scenario.physics.bodies.map((body) => ({
      ...body,
      initialPositionM: vector3(
        body.initialPositionM.x,
        body.initialPositionM.y,
        body.initialPositionM.z
      ),
      initialVelocityMps: vector3(
        body.initialVelocityMps.x,
        body.initialVelocityMps.y,
        body.initialVelocityMps.z
      ),
    })),
    timeStepSeconds: scenario.numericalPolicy.timeStepSeconds,
    encounterThresholds: {
      ...scenario.numericalPolicy.encounterThresholds,
    },
  };
}

export function isParsingDiagnosticCode(
  code: ValidationDiagnosticCode
): boolean {
  return code.startsWith("parse.");
}
