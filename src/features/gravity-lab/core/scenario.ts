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
import {
  analyzeSimulationConfig,
  type SimulationConfigValidationReport,
  type ValidationDiagnostic,
  type ValidationDiagnosticCode,
} from "./validation";
import type { NewtonianValidityReport } from "../physics/newtonianValidity";
import { vector3 } from "./vector3";
import {
  recommendTimeStep,
  type PrecisionProfile,
  type TimeStepBudgetAssessment,
  type TimeStepRecommendation,
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
    Math.max(Math.abs(provenance.siValue), Math.abs(convertedSiValue)) *
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

  if (parseResult.value !== 0 && convertedSiValue === 0) {
    const conversionIssue: DraftFieldIssue = {
      code: "parse.unit-conversion-underflow",
      message:
        "Converting this non-zero value between units underflows to zero.",
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

export type DraftNumberFromSiResult<Unit extends string> =
  | Readonly<{
      ok: true;
      field: DraftNumber<Unit>;
    }>
  | Readonly<{
      ok: false;
      issue: DraftFieldIssue;
      siValue: number;
      unit: Unit;
    }>;

export class DraftNumberConversionError extends RangeError {
  readonly issue: DraftFieldIssue;
  readonly siValue: number;
  readonly unit: string;

  constructor(
    issue: DraftFieldIssue,
    siValue: number,
    unit: string
  ) {
    super(issue.message);
    this.name = "DraftNumberConversionError";
    this.issue = issue;
    this.siValue = siValue;
    this.unit = unit;
  }
}

export function tryCreateDraftNumberFromSi<Unit extends string>(
  siValue: number,
  unit: Unit,
  converter: DraftUnitConverter<Unit>
): DraftNumberFromSiResult<Unit> {
  if (!Number.isFinite(siValue)) {
    return {
      ok: false,
      issue: {
        code: "parse.si-conversion-non-finite",
        message: "A canonical draft value must be finite.",
      },
      siValue,
      unit,
    };
  }

  const displayValue = converter.fromSi(siValue, unit);

  if (!Number.isFinite(displayValue)) {
    return {
      ok: false,
      issue: {
        code: "parse.si-conversion-non-finite",
        message: "The canonical value cannot be displayed in this unit.",
      },
      siValue,
      unit,
    };
  }

  if (siValue !== 0 && displayValue === 0) {
    return {
      ok: false,
      issue: {
        code: "parse.unit-conversion-underflow",
        message:
          "Displaying this non-zero SI value in the requested unit underflows to zero.",
      },
      siValue,
      unit,
    };
  }

  const rawText = String(displayValue);
  const provenance: DraftNumberProvenance<Unit> = {
    kind: "canonical-si",
    rawText,
    unit,
    siValue,
  };
  const resolution = resolveDraftNumber(
    rawText,
    unit,
    converter,
    siValue,
    provenance
  );

  if (resolution.siValue === null) {
    return {
      ok: false,
      issue:
        resolution.field.errors[0] ?? {
          code: "parse.si-conversion-non-finite",
          message:
            "The canonical value cannot be represented in the requested unit.",
        },
      siValue,
      unit,
    };
  }

  return { ok: true, field: resolution.field };
}

export function createDraftNumberFromSi<Unit extends string>(
  siValue: number,
  unit: Unit,
  converter: DraftUnitConverter<Unit>
): DraftNumber<Unit> {
  const result = tryCreateDraftNumberFromSi(siValue, unit, converter);

  if (!result.ok) {
    throw new DraftNumberConversionError(
      result.issue,
      result.siValue,
      result.unit
    );
  }

  return result.field;
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
      reason: "current-value-invalid";
      issue: null;
    }>
  | Readonly<{
      changed: false;
      field: DraftNumber<Unit>;
      reason: "conversion-failed";
      issue: DraftFieldIssue;
    }>;

export function changeDraftNumberUnit<Unit extends string>(
  field: DraftNumber<Unit>,
  nextUnit: Unit,
  converter: DraftUnitConverter<Unit>
): DraftUnitChangeResult<Unit> {
  if (field.siValue === null) {
    return {
      changed: false,
      field,
      reason: "current-value-invalid",
      issue: null,
    };
  }

  const result = tryCreateDraftNumberFromSi(
    field.siValue,
    nextUnit,
    converter
  );

  if (!result.ok) {
    return {
      changed: false,
      field,
      reason: "conversion-failed",
      issue: result.issue,
    };
  }

  return {
    changed: true,
    field: result.field,
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

export type ScenarioDraftUnitPolicy = Readonly<{
  mass: MassUnit;
  physicalRadius: DistanceUnit;
  position: DistanceUnit;
  velocity: SpeedUnit;
  time: TimeUnit;
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

function hasExactOwnKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const keys = Reflect.ownKeys(value);

  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
    )
  );
}

function isDeepFrozen(
  value: unknown,
  visited: WeakSet<object> = new WeakSet()
): boolean {
  if (value === null || typeof value !== "object") {
    return true;
  }

  if (ArrayBuffer.isView(value) || !Object.isFrozen(value)) {
    return false;
  }

  if (visited.has(value)) {
    return true;
  }
  visited.add(value);

  for (const key of Reflect.ownKeys(value)) {
    if (!isDeepFrozen(Reflect.get(value, key), visited)) {
      return false;
    }
  }

  return true;
}

function structurallyEquals(
  value: unknown,
  expected: unknown,
  visited: WeakMap<object, object> = new WeakMap()
): boolean {
  if (Object.is(value, expected)) {
    return true;
  }

  if (
    value === null ||
    expected === null ||
    typeof value !== "object" ||
    typeof expected !== "object"
  ) {
    return false;
  }

  if (visited.get(value) === expected) {
    return true;
  }
  visited.set(value, expected);

  const valueKeys = Reflect.ownKeys(value);
  const expectedKeys = Reflect.ownKeys(expected);

  if (valueKeys.length !== expectedKeys.length) {
    return false;
  }

  for (const key of expectedKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(value, key) ||
      !structurallyEquals(
        Reflect.get(value, key),
        Reflect.get(expected, key),
        visited
      )
    ) {
      return false;
    }
  }

  return true;
}

function hasVectorShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactOwnKeys(value, ["x", "y", "z"]) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z) &&
    Object.isFrozen(value)
  );
}

function hasBodyShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactOwnKeys(value, [
      "id",
      "name",
      "massKg",
      "physicalRadiusM",
      "fixed",
      "initialPositionM",
      "initialVelocityMps",
    ]) &&
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

function hasBudgetAssessmentShape(
  value: unknown
): value is TimeStepBudgetAssessment {
  if (!isRecord(value) || typeof value.exceedsBudget !== "boolean") {
    return false;
  }

  const required = value.requiredSubStepsAtMaximumFrame;

  return (
    hasExactOwnKeys(value, [
      "requiredSubStepsAtMaximumFrame",
      "exceedsBudget",
    ]) &&
    typeof required === "number" &&
    ((Number.isFinite(required) &&
      Number.isInteger(required) &&
      required >= 1) ||
      required === Number.POSITIVE_INFINITY) &&
    (required !== Number.POSITIVE_INFINITY || value.exceedsBudget) &&
    (required !== 1 || !value.exceedsBudget)
  );
}

export function isAppliedScenario(value: unknown): value is AppliedScenario {
  if (
    !isRecord(value) ||
    !hasExactOwnKeys(value, [
      "kind",
      "physics",
      "numericalPolicy",
      "initialValidity",
    ]) ||
    value.kind !== APPLIED_SCENARIO_KIND ||
    !isDeepFrozen(value) ||
    !isRecord(value.physics) ||
    !hasExactOwnKeys(value.physics, ["bodies"]) ||
    !Array.isArray(value.physics.bodies) ||
    value.physics.bodies.length < 1 ||
    !value.physics.bodies.every(hasBodyShape) ||
    !isRecord(value.numericalPolicy) ||
    !hasExactOwnKeys(value.numericalPolicy, [
      "precisionProfile",
      "qTarget",
      "recommendedTimeStepSeconds",
      "maximumTimeStepSeconds",
      "timeStepSeconds",
      "encounterThresholds",
      "timeStepRecommendation",
      "budgetAssessment",
    ]) ||
    !isRecord(value.initialValidity)
  ) {
    return false;
  }

  const policy = value.numericalPolicy;
  const profile = policy.precisionProfile;
  const precisionProfile: PrecisionProfile | null =
    profile === "fast" ||
    profile === "balanced" ||
    profile === "precise"
      ? profile
      : null;
  const expectedQTarget =
    precisionProfile === "fast"
      ? 0.01
      : precisionProfile === "balanced"
        ? 0.005
        : precisionProfile === "precise"
          ? 0.0025
          : null;
  const recommendation = policy.timeStepRecommendation;
  const encounterThresholds = policy.encounterThresholds;
  const budgetAssessment = policy.budgetAssessment;

  if (
    expectedQTarget === null ||
    precisionProfile === null ||
    policy.qTarget !== expectedQTarget ||
    !isFiniteNumber(policy.timeStepSeconds) ||
    policy.timeStepSeconds <= 0 ||
    !isNullableFiniteNumber(policy.recommendedTimeStepSeconds) ||
    !isNullableFiniteNumber(policy.maximumTimeStepSeconds) ||
    !isRecord(encounterThresholds) ||
    !hasExactOwnKeys(encounterThresholds, [
      "maxRelativeDisplacementPerStep",
      "maxDynamicalStep",
    ]) ||
    encounterThresholds.maxRelativeDisplacementPerStep !== 0.02 ||
    encounterThresholds.maxDynamicalStep !== 0.02 ||
    !isRecord(recommendation) ||
    (budgetAssessment !== null &&
      !hasBudgetAssessmentShape(budgetAssessment))
  ) {
    return false;
  }

  const bodies =
    value.physics.bodies as unknown as readonly CelestialBodyDefinition[];
  let expectedRecommendation: TimeStepRecommendation;

  try {
    expectedRecommendation = recommendTimeStep(
      bodies,
      precisionProfile
    );
  } catch {
    return false;
  }

  if (
    !structurallyEquals(recommendation, expectedRecommendation) ||
    policy.recommendedTimeStepSeconds !==
      expectedRecommendation.recommendedTimeStepSeconds
  ) {
    return false;
  }

  const maximumTimeStepSeconds = policy.maximumTimeStepSeconds;
  const expectedTimeStepSeconds =
    expectedRecommendation.kind === "unconstrained"
      ? maximumTimeStepSeconds
      : maximumTimeStepSeconds === null
        ? expectedRecommendation.recommendedTimeStepSeconds
        : Math.min(
            expectedRecommendation.recommendedTimeStepSeconds,
            maximumTimeStepSeconds
          );

  if (
    expectedTimeStepSeconds === null ||
    expectedTimeStepSeconds !== policy.timeStepSeconds
  ) {
    return false;
  }

  const config: NewtonianSimulationConfig = {
    bodies,
    timeStepSeconds: policy.timeStepSeconds,
    encounterThresholds: {
      maxRelativeDisplacementPerStep:
        encounterThresholds.maxRelativeDisplacementPerStep as number,
      maxDynamicalStep: encounterThresholds.maxDynamicalStep as number,
    },
  };
  const validation = analyzeSimulationConfig(config);

  return (
    validation.valid &&
    validation.newtonianValidity !== null &&
    structurallyEquals(
      value.initialValidity,
      validation.newtonianValidity
    )
  );
}

export function appliedScenarioToDraft(
  scenario: AppliedScenario,
  units: ScenarioDraftUnitPolicy
): ScenarioDraft {
  if (!isAppliedScenario(scenario)) {
    throw new TypeError(
      "Only a valid immutable applied scenario can be converted back to a draft."
    );
  }

  return {
    bodies: scenario.physics.bodies.map((body) => ({
      id: body.id,
      name: body.name,
      fixed: body.fixed,
      mass: createDraftNumberFromSi(
        body.massKg,
        units.mass,
        MASS_DRAFT_UNIT_CONVERTER
      ),
      physicalRadius: createDraftNumberFromSi(
        body.physicalRadiusM,
        units.physicalRadius,
        DISTANCE_DRAFT_UNIT_CONVERTER
      ),
      initialPosition: {
        x: createDraftNumberFromSi(
          body.initialPositionM.x,
          units.position,
          DISTANCE_DRAFT_UNIT_CONVERTER
        ),
        y: createDraftNumberFromSi(
          body.initialPositionM.y,
          units.position,
          DISTANCE_DRAFT_UNIT_CONVERTER
        ),
        z: createDraftNumberFromSi(
          body.initialPositionM.z,
          units.position,
          DISTANCE_DRAFT_UNIT_CONVERTER
        ),
      },
      initialVelocity: {
        x: createDraftNumberFromSi(
          body.initialVelocityMps.x,
          units.velocity,
          SPEED_DRAFT_UNIT_CONVERTER
        ),
        y: createDraftNumberFromSi(
          body.initialVelocityMps.y,
          units.velocity,
          SPEED_DRAFT_UNIT_CONVERTER
        ),
        z: createDraftNumberFromSi(
          body.initialVelocityMps.z,
          units.velocity,
          SPEED_DRAFT_UNIT_CONVERTER
        ),
      },
    })),
    precisionProfile:
      scenario.numericalPolicy.precisionProfile,
    maximumTimeStep:
      scenario.numericalPolicy.maximumTimeStepSeconds === null
        ? null
        : createDraftNumberFromSi(
            scenario.numericalPolicy.maximumTimeStepSeconds,
            units.time,
            TIME_DRAFT_UNIT_CONVERTER
          ),
  };
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
