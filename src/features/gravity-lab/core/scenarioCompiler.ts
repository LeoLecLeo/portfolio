import type {
  CelestialBodyDefinition,
  EncounterThresholds,
  NewtonianSimulationConfig,
} from "./types";
import {
  analyzeSimulationConfig,
  type SimulationConfigValidationReport,
  type ValidationDiagnostic,
  type ValidationSubject,
} from "./validation";
import { vector3 } from "./vector3";
import {
  DISTANCE_DRAFT_UNIT_CONVERTER,
  MASS_DRAFT_UNIT_CONVERTER,
  SPEED_DRAFT_UNIT_CONVERTER,
  TIME_DRAFT_UNIT_CONVERTER,
  resolveDraftNumber,
  type AppliedScenario,
  type BodyDraft,
  type DraftFieldIssue,
  type DraftNumber,
  type DraftUnitConverter,
  type ScenarioCompilationResult,
  type ScenarioDraft,
  type ScenarioValidationReport,
} from "./scenario";
import type { NewtonianValidityReport } from "../physics/newtonianValidity";
import {
  PRECISION_PROFILE_TARGETS,
  assessTimeStepBudget,
  recommendTimeStep,
  type PrecisionProfile,
  type TimeStepBudget,
  type TimeStepBudgetAssessment,
  type TimeStepRecommendation,
} from "../physics/timeStepRecommendation";
export const DEFAULT_RUNTIME_ENCOUNTER_THRESHOLDS: EncounterThresholds =
  Object.freeze({
    maxRelativeDisplacementPerStep: 0.02,
    maxDynamicalStep: 0.02,
  });

export type ScenarioCompilationOptions = Readonly<{
  budget?: TimeStepBudget;
}>;

type DraftFieldAnalysis<Unit extends string> = Readonly<{
  field: DraftNumber<Unit>;
  siValue: number | null;
}>;

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value) ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function scenarioSubject(): ValidationSubject {
  return { kind: "scenario" };
}

function bodySubject(bodyId: string, bodyIndex: number): ValidationSubject {
  return { kind: "body", bodyId, bodyIndex };
}

function diagnosticFromDraftIssue(
  issue: DraftFieldIssue,
  path: string,
  subject: ValidationSubject
): ValidationDiagnostic {
  return {
    code: issue.code,
    severity: "error",
    category: "parsing",
    path,
    subject,
    message: issue.message,
  };
}

function analyzeDraftField<Unit extends string>(
  sourceField: DraftNumber<Unit>,
  converter: DraftUnitConverter<Unit>,
  path: string,
  subject: ValidationSubject,
  diagnostics: ValidationDiagnostic[],
  parsingErrorPaths: Set<string>
): DraftFieldAnalysis<Unit> {
  const resolution = resolveDraftNumber(
    sourceField.rawText,
    sourceField.unit,
    converter,
    sourceField.lastValidSiValue,
    sourceField.provenance
  );

  for (const issue of resolution.field.errors) {
    diagnostics.push(diagnosticFromDraftIssue(issue, path, subject));
    parsingErrorPaths.add(path);
  }

  return resolution;
}

function addUniqueDiagnostic(
  diagnostics: ValidationDiagnostic[],
  diagnostic: ValidationDiagnostic
): void {
  const duplicate = diagnostics.some(
    (current) =>
      current.code === diagnostic.code &&
      current.path === diagnostic.path &&
      current.message === diagnostic.message
  );

  if (!duplicate) {
    diagnostics.push(diagnostic);
  }
}

function mergeCanonicalDiagnostics(
  diagnostics: ValidationDiagnostic[],
  report: SimulationConfigValidationReport,
  parsingErrorPaths: ReadonlySet<string>
): void {
  for (const diagnostic of report.diagnostics) {
    if (
      diagnostic.code === "numeric.non-finite-config-value" &&
      parsingErrorPaths.has(diagnostic.path)
    ) {
      continue;
    }

    addUniqueDiagnostic(diagnostics, diagnostic);
  }
}

function fieldIssues(
  diagnostics: readonly ValidationDiagnostic[],
  paths: readonly string[],
  severity: "error" | "warning",
  existing: readonly DraftFieldIssue[]
): readonly DraftFieldIssue[] {
  const issues = [...existing];

  for (const diagnostic of diagnostics) {
    if (
      diagnostic.severity !== severity ||
      !paths.includes(diagnostic.path) ||
      issues.some(
        (issue) =>
          issue.code === diagnostic.code &&
          issue.message === diagnostic.message
      )
    ) {
      continue;
    }

    issues.push({
      code: diagnostic.code,
      message: diagnostic.message,
    });
  }

  return issues;
}

function annotateDraftField<Unit extends string>(
  field: DraftNumber<Unit>,
  diagnostics: readonly ValidationDiagnostic[],
  ...paths: readonly string[]
): DraftNumber<Unit> {
  return {
    ...field,
    errors: fieldIssues(diagnostics, paths, "error", field.errors),
    warnings: fieldIssues(diagnostics, paths, "warning", field.warnings),
  };
}

function annotateDraft(
  draft: ScenarioDraft,
  diagnostics: readonly ValidationDiagnostic[]
): ScenarioDraft {
  return {
    ...draft,
    bodies: draft.bodies.map((body, bodyIndex) => {
      const bodyPath = `/bodies/${bodyIndex}`;

      return {
        ...body,
        mass: annotateDraftField(
          body.mass,
          diagnostics,
          `${bodyPath}/mass`
        ),
        physicalRadius: annotateDraftField(
          body.physicalRadius,
          diagnostics,
          `${bodyPath}/physicalRadius`
        ),
        initialPosition: {
          x: annotateDraftField(
            body.initialPosition.x,
            diagnostics,
            `${bodyPath}/initialPosition/x`,
            `${bodyPath}/initialPosition`
          ),
          y: annotateDraftField(
            body.initialPosition.y,
            diagnostics,
            `${bodyPath}/initialPosition/y`,
            `${bodyPath}/initialPosition`
          ),
          z: annotateDraftField(
            body.initialPosition.z,
            diagnostics,
            `${bodyPath}/initialPosition/z`,
            `${bodyPath}/initialPosition`
          ),
        },
        initialVelocity: {
          x: annotateDraftField(
            body.initialVelocity.x,
            diagnostics,
            `${bodyPath}/initialVelocity/x`,
            `${bodyPath}/initialVelocity`
          ),
          y: annotateDraftField(
            body.initialVelocity.y,
            diagnostics,
            `${bodyPath}/initialVelocity/y`,
            `${bodyPath}/initialVelocity`
          ),
          z: annotateDraftField(
            body.initialVelocity.z,
            diagnostics,
            `${bodyPath}/initialVelocity/z`,
            `${bodyPath}/initialVelocity`
          ),
        },
      };
    }),
    maximumTimeStep:
      draft.maximumTimeStep === null
        ? null
        : annotateDraftField(
            draft.maximumTimeStep,
            diagnostics,
            "/maximumTimeStep"
          ),
  };
}

function createReport(
  diagnostics: readonly ValidationDiagnostic[],
  analyzedDraft: ScenarioDraft,
  canonicalValidation: SimulationConfigValidationReport | null,
  timeStepRecommendation: TimeStepRecommendation | null,
  budgetAssessment: TimeStepBudgetAssessment | null,
  newtonianValidity: NewtonianValidityReport | null
): ScenarioValidationReport {
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning"
  );

  return deepFreeze({
    valid: errors.length === 0,
    diagnostics: [...diagnostics],
    errors,
    warnings,
    analyzedDraft: annotateDraft(analyzedDraft, diagnostics),
    canonicalValidation,
    timeStepRecommendation,
    budgetAssessment,
    newtonianValidity,
  });
}

function failedCompilation(
  diagnostics: readonly ValidationDiagnostic[],
  analyzedDraft: ScenarioDraft,
  canonicalValidation: SimulationConfigValidationReport | null,
  timeStepRecommendation: TimeStepRecommendation | null,
  budgetAssessment: TimeStepBudgetAssessment | null,
  newtonianValidity: NewtonianValidityReport | null
): ScenarioCompilationResult {
  return {
    ok: false,
    scenario: null,
    report: createReport(
      diagnostics,
      analyzedDraft,
      canonicalValidation,
      timeStepRecommendation,
      budgetAssessment,
      newtonianValidity
    ),
  };
}

function hasErrors(diagnostics: readonly ValidationDiagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) => diagnostic.severity === "error"
  );
}

function isPrecisionProfile(value: unknown): value is PrecisionProfile {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PRECISION_PROFILE_TARGETS, value)
  );
}

export function compileScenarioDraft(
  draft: ScenarioDraft,
  options: ScenarioCompilationOptions = {}
): ScenarioCompilationResult {
  const diagnostics: ValidationDiagnostic[] = [];
  const parsingErrorPaths = new Set<string>();
  const bodies: CelestialBodyDefinition[] = [];
  const analyzedBodies: BodyDraft[] = [];

  for (let bodyIndex = 0; bodyIndex < draft.bodies.length; bodyIndex += 1) {
    const sourceBody = draft.bodies[bodyIndex];
    const subject = bodySubject(sourceBody.id, bodyIndex);
    const bodyPath = `/bodies/${bodyIndex}`;

    if (!/^#[0-9A-Fa-f]{6}$/.test(sourceBody.color)) {
      diagnostics.push({
        code: "body.color-format",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/color`,
        subject,
        message: `Color of body "${sourceBody.id}" must use the #RRGGBB format.`,
      });
    }

    const mass = analyzeDraftField(
      sourceBody.mass,
      MASS_DRAFT_UNIT_CONVERTER,
      `${bodyPath}/mass`,
      subject,
      diagnostics,
      parsingErrorPaths
    );
    const physicalRadius = analyzeDraftField(
      sourceBody.physicalRadius,
      DISTANCE_DRAFT_UNIT_CONVERTER,
      `${bodyPath}/physicalRadius`,
      subject,
      diagnostics,
      parsingErrorPaths
    );
    const positionX = analyzeDraftField(
      sourceBody.initialPosition.x,
      DISTANCE_DRAFT_UNIT_CONVERTER,
      `${bodyPath}/initialPosition/x`,
      subject,
      diagnostics,
      parsingErrorPaths
    );
    const positionY = analyzeDraftField(
      sourceBody.initialPosition.y,
      DISTANCE_DRAFT_UNIT_CONVERTER,
      `${bodyPath}/initialPosition/y`,
      subject,
      diagnostics,
      parsingErrorPaths
    );
    const positionZ = analyzeDraftField(
      sourceBody.initialPosition.z,
      DISTANCE_DRAFT_UNIT_CONVERTER,
      `${bodyPath}/initialPosition/z`,
      subject,
      diagnostics,
      parsingErrorPaths
    );
    const velocityX = analyzeDraftField(
      sourceBody.initialVelocity.x,
      SPEED_DRAFT_UNIT_CONVERTER,
      `${bodyPath}/initialVelocity/x`,
      subject,
      diagnostics,
      parsingErrorPaths
    );
    const velocityY = analyzeDraftField(
      sourceBody.initialVelocity.y,
      SPEED_DRAFT_UNIT_CONVERTER,
      `${bodyPath}/initialVelocity/y`,
      subject,
      diagnostics,
      parsingErrorPaths
    );
    const velocityZ = analyzeDraftField(
      sourceBody.initialVelocity.z,
      SPEED_DRAFT_UNIT_CONVERTER,
      `${bodyPath}/initialVelocity/z`,
      subject,
      diagnostics,
      parsingErrorPaths
    );

    analyzedBodies.push({
      ...sourceBody,
      mass: mass.field,
      physicalRadius: physicalRadius.field,
      initialPosition: {
        x: positionX.field,
        y: positionY.field,
        z: positionZ.field,
      },
      initialVelocity: {
        x: velocityX.field,
        y: velocityY.field,
        z: velocityZ.field,
      },
    });
    bodies.push({
      id: sourceBody.id,
      name: sourceBody.name,
      fixed: sourceBody.fixed,
      massKg: mass.siValue ?? Number.NaN,
      physicalRadiusM: physicalRadius.siValue ?? Number.NaN,
      initialPositionM: vector3(
        positionX.siValue ?? Number.NaN,
        positionY.siValue ?? Number.NaN,
        positionZ.siValue ?? Number.NaN
      ),
      initialVelocityMps: vector3(
        velocityX.siValue ?? Number.NaN,
        velocityY.siValue ?? Number.NaN,
        velocityZ.siValue ?? Number.NaN
      ),
    });
  }

  const maximumTimeStep =
    draft.maximumTimeStep === null
      ? null
      : analyzeDraftField(
          draft.maximumTimeStep,
          TIME_DRAFT_UNIT_CONVERTER,
          "/maximumTimeStep",
          scenarioSubject(),
          diagnostics,
          parsingErrorPaths
        );
  const analyzedDraft: ScenarioDraft = {
    bodies: analyzedBodies,
    precisionProfile: draft.precisionProfile,
    maximumTimeStep: maximumTimeStep?.field ?? null,
  };

  if (!isPrecisionProfile(draft.precisionProfile)) {
    diagnostics.push({
      code: "step.profile",
      severity: "error",
      category: "elementary",
      path: "/precisionProfile",
      subject: scenarioSubject(),
      message: "The precision profile is not supported.",
    });
  }

  const maximumTimeStepSeconds = maximumTimeStep?.siValue ?? null;

  if (
    maximumTimeStepSeconds !== null &&
    maximumTimeStepSeconds <= 0
  ) {
    diagnostics.push({
      code: "config.time-step",
      severity: "error",
      category: "elementary",
      path: "/maximumTimeStep",
      subject: scenarioSubject(),
      message: "The explicit maximum time step must be greater than zero.",
      actualValue: maximumTimeStepSeconds,
    });
  }

  const provisionalConfig: NewtonianSimulationConfig = {
    bodies,
    timeStepSeconds: 1,
    encounterThresholds: DEFAULT_RUNTIME_ENCOUNTER_THRESHOLDS,
  };
  let canonicalValidation = analyzeSimulationConfig(provisionalConfig);
  mergeCanonicalDiagnostics(
    diagnostics,
    canonicalValidation,
    parsingErrorPaths
  );

  if (hasErrors(diagnostics)) {
    return failedCompilation(
      diagnostics,
      analyzedDraft,
      canonicalValidation,
      null,
      null,
      canonicalValidation.newtonianValidity
    );
  }

  const newtonianValidity = canonicalValidation.newtonianValidity;

  if (newtonianValidity === null) {
    diagnostics.push({
      code: "numeric.initial-acceleration",
      severity: "error",
      category: "numerical",
      path: "/bodies",
      subject: scenarioSubject(),
      message:
        "Initial scientific analysis did not produce a validity report.",
    });

    return failedCompilation(
      diagnostics,
      analyzedDraft,
      canonicalValidation,
      null,
      null,
      null
    );
  }

  let timeStepRecommendation: TimeStepRecommendation;

  try {
    timeStepRecommendation = recommendTimeStep(
      bodies,
      draft.precisionProfile
    );
  } catch (error) {
    diagnostics.push({
      code: "step.non-finite",
      severity: "error",
      category: "numerical",
      path: "/precisionProfile",
      subject: scenarioSubject(),
      message:
        error instanceof Error
          ? `The fixed time step could not be recommended: ${error.message}`
          : "The fixed time step could not be recommended.",
    });

    return failedCompilation(
      diagnostics,
      analyzedDraft,
      canonicalValidation,
      null,
      null,
      newtonianValidity
    );
  }

  let timeStepSeconds: number;

  if (timeStepRecommendation.kind === "unconstrained") {
    if (maximumTimeStepSeconds === null) {
      diagnostics.push({
        code: "step.unconstrained-without-maximum",
        severity: "error",
        category: "numerical",
        path: "/maximumTimeStep",
        subject: scenarioSubject(),
        message:
          "A one-body or entirely fixed scenario needs an explicit maximum time step.",
      });

      return failedCompilation(
        diagnostics,
        analyzedDraft,
        canonicalValidation,
        timeStepRecommendation,
        null,
        newtonianValidity
      );
    }

    timeStepSeconds = maximumTimeStepSeconds;
  } else {
    timeStepSeconds =
      maximumTimeStepSeconds === null
        ? timeStepRecommendation.recommendedTimeStepSeconds
        : Math.min(
            timeStepRecommendation.recommendedTimeStepSeconds,
            maximumTimeStepSeconds
          );
  }

  if (!Number.isFinite(timeStepSeconds) || timeStepSeconds <= 0) {
    diagnostics.push({
      code: "step.non-finite",
      severity: "error",
      category: "numerical",
      path: "/maximumTimeStep",
      subject: scenarioSubject(),
      message: "The selected fixed time step is not numerically usable.",
      actualValue: timeStepSeconds,
    });

    return failedCompilation(
      diagnostics,
      analyzedDraft,
      canonicalValidation,
      timeStepRecommendation,
      null,
      newtonianValidity
    );
  }

  let budgetAssessment: TimeStepBudgetAssessment | null = null;

  if (options.budget !== undefined) {
    try {
      budgetAssessment = assessTimeStepBudget(
        timeStepSeconds,
        options.budget
      );
    } catch (error) {
      diagnostics.push({
        code: "step.budget-invalid",
        severity: "error",
        category: "numerical",
        path: "/budget",
        subject: scenarioSubject(),
        message:
          error instanceof Error
            ? `The time-step budget is invalid: ${error.message}`
            : "The time-step budget is invalid.",
      });
    }

    if (budgetAssessment?.exceedsBudget) {
      diagnostics.push({
        code: "step.budget-exceeded",
        severity: "warning",
        category: "numerical",
        path: "/budget",
        subject: scenarioSubject(),
        message:
          `The selected fixed step can require ${budgetAssessment.requiredSubStepsAtMaximumFrame} substeps at the maximum accepted frame delta, above the explicit budget of ${options.budget.maxSubStepsPerTick}. ` +
          "The time step was not enlarged silently.",
        actualValue: budgetAssessment.requiredSubStepsAtMaximumFrame,
        limit: options.budget.maxSubStepsPerTick,
      });
    }
  }

  if (hasErrors(diagnostics)) {
    return failedCompilation(
      diagnostics,
      analyzedDraft,
      canonicalValidation,
      timeStepRecommendation,
      budgetAssessment,
      newtonianValidity
    );
  }

  const finalConfig: NewtonianSimulationConfig = {
    bodies,
    timeStepSeconds,
    encounterThresholds: DEFAULT_RUNTIME_ENCOUNTER_THRESHOLDS,
  };
  canonicalValidation = analyzeSimulationConfig(finalConfig);
  mergeCanonicalDiagnostics(
    diagnostics,
    canonicalValidation,
    parsingErrorPaths
  );

  if (hasErrors(diagnostics)) {
    return failedCompilation(
      diagnostics,
      analyzedDraft,
      canonicalValidation,
      timeStepRecommendation,
      budgetAssessment,
      newtonianValidity
    );
  }

  const scenario: AppliedScenario = deepFreeze({
    kind: "gravity-lab-applied-scenario-v1",
    physics: {
      modelId: "newtonian",
      bodies: bodies.map((body) => ({
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
    },
    presentation: {
      bodies: analyzedDraft.bodies.map((body) => ({
        bodyId: body.id,
        color: body.color,
      })),
    },
    numericalPolicy: {
      precisionProfile: draft.precisionProfile,
      qTarget: timeStepRecommendation.qTarget,
      recommendedTimeStepSeconds:
        timeStepRecommendation.recommendedTimeStepSeconds,
      maximumTimeStepSeconds,
      timeStepSeconds,
      encounterThresholds: {
        ...DEFAULT_RUNTIME_ENCOUNTER_THRESHOLDS,
      },
      timeStepRecommendation,
      budgetAssessment,
    },
    initialValidity: newtonianValidity,
  });
  const report = createReport(
    diagnostics,
    analyzedDraft,
    canonicalValidation,
    timeStepRecommendation,
    budgetAssessment,
    newtonianValidity
  );

  return {
    ok: true,
    scenario,
    report,
  };
}
