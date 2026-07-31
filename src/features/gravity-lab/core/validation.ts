import {
  MAX_NEWTONIAN_BODIES,
  type CelestialBodyDefinition,
  type NewtonianSimulationConfig,
  type NewtonianState,
} from "./types";
import { isFiniteVector3 } from "./vector3";
import { computeNewtonianDiagnostics } from "../physics/diagnostics";
import { computeNewtonianAccelerations } from "../physics/newtonian";
import {
  BETA_CAUTION_THRESHOLD,
  BETA_HARD_ERROR_THRESHOLD,
  BETA_STRONG_WARNING_THRESHOLD,
  WEAK_FIELD_CAUTION_THRESHOLD,
  WEAK_FIELD_HARD_ERROR_THRESHOLD,
  WEAK_FIELD_STRONG_WARNING_THRESHOLD,
  createNewtonianValidityWorkspace,
  evaluateNewtonianValidityInto,
  materializeNewtonianValidityReport,
  type NewtonianBetaResponsible,
  type NewtonianBodyResponsible,
  type NewtonianPairResponsible,
  type NewtonianValidityLevel,
  type NewtonianValidityMeasurement,
  type NewtonianValidityReport,
} from "../physics/newtonianValidity";

export const MAX_BODY_MASS_KG = 1e33;
export const MAX_POSITION_COMPONENT_M = 1e18;
export const MAX_PHYSICAL_RADIUS_M = 1e18;

export type ValidationSeverity = "error" | "warning";

export type ValidationCategory =
  | "parsing"
  | "elementary"
  | "geometry"
  | "numerical"
  | "newtonian-domain";

export type ValidationDiagnosticCode =
  | "parse.required"
  | "parse.invalid-syntax"
  | "parse.non-finite"
  | "parse.underflow"
  | "parse.si-conversion-non-finite"
  | "parse.unit-conversion-underflow"
  | "config.body-count"
  | "body.id-required"
  | "body.id-duplicate"
  | "body.name-required"
  | "body.color-format"
  | "body.mass-non-positive"
  | "body.mass-limit"
  | "body.radius-negative"
  | "body.radius-limit"
  | "body.position-limit"
  | "body.fixed-velocity"
  | "config.time-step"
  | "config.encounter-threshold"
  | "geometry.initial-contact"
  | "numeric.non-finite-config-value"
  | "numeric.initial-acceleration"
  | "numeric.initial-diagnostics"
  | "numeric.initial-drift"
  | "step.profile"
  | "step.unconstrained-without-maximum"
  | "step.non-finite"
  | "step.budget-invalid"
  | "step.budget-exceeded"
  | "domain.external-constraint"
  | "domain.point-radius-unknown"
  | "domain.beta.caution"
  | "domain.beta.strong"
  | "domain.beta.limit"
  | "domain.chi-pair.caution"
  | "domain.chi-pair.strong"
  | "domain.chi-pair.limit"
  | "domain.chi-self.caution"
  | "domain.chi-self.strong"
  | "domain.chi-self.limit"
  | "domain.psi.caution"
  | "domain.psi.strong"
  | "domain.psi.limit";

export type ValidationSubject =
  | Readonly<{
      kind: "scenario";
    }>
  | Readonly<{
      kind: "body";
      bodyId: string;
      bodyIndex: number;
    }>
  | Readonly<{
      kind: "pair";
      firstBodyId: string;
      secondBodyId: string;
      firstBodyIndex: number;
      secondBodyIndex: number;
    }>;

export type ValidationDiagnostic = Readonly<{
  code: ValidationDiagnosticCode;
  severity: ValidationSeverity;
  category: ValidationCategory;
  path: string;
  subject: ValidationSubject;
  message: string;
  actualValue?: number;
  limit?: number;
}>;

export type SimulationConfigValidationReport = Readonly<{
  valid: boolean;
  diagnostics: readonly ValidationDiagnostic[];
  errors: readonly ValidationDiagnostic[];
  warnings: readonly ValidationDiagnostic[];
  newtonianValidity: NewtonianValidityReport | null;
}>;

export class SimulationConfigurationError extends Error {
  readonly diagnostic: ValidationDiagnostic;

  constructor(diagnostic: ValidationDiagnostic) {
    super(diagnostic.message);
    this.name = "SimulationConfigurationError";
    this.diagnostic = diagnostic;
  }
}

const SCENARIO_SUBJECT: ValidationSubject = { kind: "scenario" };

function bodySubject(bodyId: string, bodyIndex: number): ValidationSubject {
  return { kind: "body", bodyId, bodyIndex };
}

function pairSubject(
  firstBodyId: string,
  secondBodyId: string,
  firstBodyIndex: number,
  secondBodyIndex: number
): ValidationSubject {
  return {
    kind: "pair",
    firstBodyId,
    secondBodyId,
    firstBodyIndex,
    secondBodyIndex,
  };
}

function severityForValidityLevel(
  level: NewtonianValidityLevel
): ValidationSeverity | null {
  if (level === "recommended") {
    return null;
  }

  return level === "hard-error" ? "error" : "warning";
}

function validityCodeSuffix(
  level: NewtonianValidityLevel
): "caution" | "strong" | "limit" {
  switch (level) {
    case "recommended":
    case "caution":
      return "caution";
    case "strong-warning":
      return "strong";
    case "hard-error":
      return "limit";
  }
}

function thresholdForValidityLevel(
  level: NewtonianValidityLevel,
  caution: number,
  strong: number,
  hard: number
): number {
  switch (level) {
    case "recommended":
    case "caution":
      return caution;
    case "strong-warning":
      return strong;
    case "hard-error":
      return hard;
  }
}

function bodyIndexMap(
  bodies: readonly CelestialBodyDefinition[]
): ReadonlyMap<string, number> {
  return new Map(
    bodies.map((body, bodyIndex) => [body.id, bodyIndex] as const)
  );
}

function subjectForBeta(
  responsible: NewtonianBetaResponsible,
  indexById: ReadonlyMap<string, number>
): ValidationSubject {
  if (responsible.kind === "body") {
    return bodySubject(
      responsible.bodyId,
      indexById.get(responsible.bodyId) ?? -1
    );
  }

  return pairSubject(
    responsible.firstBodyId,
    responsible.secondBodyId,
    indexById.get(responsible.firstBodyId) ?? -1,
    indexById.get(responsible.secondBodyId) ?? -1
  );
}

function subjectForPairMeasurement(
  responsible: NewtonianPairResponsible,
  indexById: ReadonlyMap<string, number>
): ValidationSubject {
  return pairSubject(
    responsible.firstBodyId,
    responsible.secondBodyId,
    indexById.get(responsible.firstBodyId) ?? -1,
    indexById.get(responsible.secondBodyId) ?? -1
  );
}

function subjectForBodyMeasurement(
  responsible: NewtonianBodyResponsible,
  indexById: ReadonlyMap<string, number>
): ValidationSubject {
  return bodySubject(
    responsible.bodyId,
    indexById.get(responsible.bodyId) ?? -1
  );
}

function appendValidityMeasurement<TResponsible>(
  diagnostics: ValidationDiagnostic[],
  measurement: NewtonianValidityMeasurement<TResponsible> | null,
  metric: "beta" | "chi-pair" | "chi-self" | "psi",
  subjectFactory: (responsible: TResponsible) => ValidationSubject
): void {
  if (measurement === null) {
    return;
  }

  const severity = severityForValidityLevel(measurement.level);

  if (severity === null) {
    return;
  }

  const isBeta = metric === "beta";
  const code =
    `domain.${metric}.${validityCodeSuffix(measurement.level)}` as ValidationDiagnosticCode;
  const policyText = isBeta
    ? " These pedagogical thresholds follow the order of beta-squared corrections and are not a universal error guarantee."
    : "";

  diagnostics.push({
    code,
    severity,
    category: "newtonian-domain",
    path: "/bodies",
    subject: subjectFactory(measurement.responsible),
    message:
      `Newtonian-domain metric ${metric} is ${measurement.value}, reaching the ${measurement.level} zone.` +
      policyText,
    actualValue: measurement.value,
    limit: thresholdForValidityLevel(
      measurement.level,
      isBeta ? BETA_CAUTION_THRESHOLD : WEAK_FIELD_CAUTION_THRESHOLD,
      isBeta
        ? BETA_STRONG_WARNING_THRESHOLD
        : WEAK_FIELD_STRONG_WARNING_THRESHOLD,
      isBeta ? BETA_HARD_ERROR_THRESHOLD : WEAK_FIELD_HARD_ERROR_THRESHOLD
    ),
  });
}

export function createNewtonianValidityDiagnostics(
  validity: NewtonianValidityReport,
  bodies: readonly CelestialBodyDefinition[]
): readonly ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const indexById = bodyIndexMap(bodies);

  appendValidityMeasurement(
    diagnostics,
    validity.beta,
    "beta",
    (responsible) => subjectForBeta(responsible, indexById)
  );
  appendValidityMeasurement(
    diagnostics,
    validity.chiPair,
    "chi-pair",
    (responsible) => subjectForPairMeasurement(responsible, indexById)
  );
  appendValidityMeasurement(
    diagnostics,
    validity.chiSelf,
    "chi-self",
    (responsible) => subjectForBodyMeasurement(responsible, indexById)
  );
  appendValidityMeasurement(
    diagnostics,
    validity.psi,
    "psi",
    (responsible) => subjectForBodyMeasurement(responsible, indexById)
  );

  return diagnostics;
}

function pushDiagnostic(
  diagnostics: ValidationDiagnostic[],
  diagnostic: ValidationDiagnostic
): void {
  diagnostics.push(diagnostic);
}

function inspectPositiveFiniteConfigValue(
  diagnostics: ValidationDiagnostic[],
  value: number,
  path: string,
  label: string,
  code: "config.time-step" | "config.encounter-threshold"
): void {
  if (!Number.isFinite(value)) {
    pushDiagnostic(diagnostics, {
      code: "numeric.non-finite-config-value",
      severity: "error",
      category: "numerical",
      path,
      subject: SCENARIO_SUBJECT,
      message: `${label} must be finite.`,
      actualValue: value,
    });
    return;
  }

  if (value <= 0) {
    pushDiagnostic(diagnostics, {
      code,
      severity: "error",
      category: "elementary",
      path,
      subject: SCENARIO_SUBJECT,
      message: `${label} must be a finite number greater than zero.`,
      actualValue: value,
    });
  }
}

export function analyzeSimulationConfig(
  config: NewtonianSimulationConfig
): SimulationConfigValidationReport {
  const diagnostics: ValidationDiagnostic[] = [];
  let newtonianValidity: NewtonianValidityReport | null = null;

  if (
    config.bodies.length < 1 ||
    config.bodies.length > MAX_NEWTONIAN_BODIES
  ) {
    pushDiagnostic(diagnostics, {
      code: "config.body-count",
      severity: "error",
      category: "elementary",
      path: "/bodies",
      subject: SCENARIO_SUBJECT,
      message: `A simulation must contain between 1 and ${MAX_NEWTONIAN_BODIES} bodies.`,
      actualValue: config.bodies.length,
      limit: MAX_NEWTONIAN_BODIES,
    });
  }

  inspectPositiveFiniteConfigValue(
    diagnostics,
    config.timeStepSeconds,
    "/timeStepSeconds",
    "The fixed time step",
    "config.time-step"
  );
  inspectPositiveFiniteConfigValue(
    diagnostics,
    config.encounterThresholds.maxRelativeDisplacementPerStep,
    "/encounterThresholds/maxRelativeDisplacementPerStep",
    "The relative-displacement encounter threshold",
    "config.encounter-threshold"
  );
  inspectPositiveFiniteConfigValue(
    diagnostics,
    config.encounterThresholds.maxDynamicalStep,
    "/encounterThresholds/maxDynamicalStep",
    "The dynamical-step encounter threshold",
    "config.encounter-threshold"
  );

  if (
    Number.isFinite(
      config.encounterThresholds.maxRelativeDisplacementPerStep
    ) &&
    config.encounterThresholds.maxRelativeDisplacementPerStep > 1
  ) {
    pushDiagnostic(diagnostics, {
      code: "config.encounter-threshold",
      severity: "error",
      category: "elementary",
      path: "/encounterThresholds/maxRelativeDisplacementPerStep",
      subject: SCENARIO_SUBJECT,
      message: "Encounter thresholds must not exceed one.",
      actualValue:
        config.encounterThresholds.maxRelativeDisplacementPerStep,
      limit: 1,
    });
  }

  if (
    Number.isFinite(config.encounterThresholds.maxDynamicalStep) &&
    config.encounterThresholds.maxDynamicalStep > 1
  ) {
    pushDiagnostic(diagnostics, {
      code: "config.encounter-threshold",
      severity: "error",
      category: "elementary",
      path: "/encounterThresholds/maxDynamicalStep",
      subject: SCENARIO_SUBJECT,
      message: "Encounter thresholds must not exceed one.",
      actualValue: config.encounterThresholds.maxDynamicalStep,
      limit: 1,
    });
  }

  const identifierIndexes = new Map<string, number>();
  let hasFixedBodies = false;

  for (
    let bodyIndex = 0;
    bodyIndex < config.bodies.length;
    bodyIndex += 1
  ) {
    const body = config.bodies[bodyIndex];
    const subject = bodySubject(body.id, bodyIndex);
    const bodyPath = `/bodies/${bodyIndex}`;

    if (body.id.trim().length === 0) {
      pushDiagnostic(diagnostics, {
        code: "body.id-required",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/id`,
        subject,
        message: "Every body needs an identifier.",
      });
    }

    const previousIdentifierIndex = identifierIndexes.get(body.id);
    if (previousIdentifierIndex !== undefined) {
      pushDiagnostic(diagnostics, {
        code: "body.id-duplicate",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/id`,
        subject,
        message: `Body identifiers must be unique; received "${body.id}" twice.`,
      });
    } else {
      identifierIndexes.set(body.id, bodyIndex);
    }

    if (body.name.trim().length === 0) {
      pushDiagnostic(diagnostics, {
        code: "body.name-required",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/name`,
        subject,
        message: `Body "${body.id}" needs a display name.`,
      });
    }

    if (!Number.isFinite(body.massKg)) {
      pushDiagnostic(diagnostics, {
        code: "numeric.non-finite-config-value",
        severity: "error",
        category: "numerical",
        path: `${bodyPath}/mass`,
        subject,
        message: `Mass of body "${body.id}" must be finite.`,
        actualValue: body.massKg,
      });
    } else if (body.massKg <= 0) {
      pushDiagnostic(diagnostics, {
        code: "body.mass-non-positive",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/mass`,
        subject,
        message: `Mass of body "${body.id}" must be a finite number greater than zero.`,
        actualValue: body.massKg,
      });
    } else if (body.massKg > MAX_BODY_MASS_KG) {
      pushDiagnostic(diagnostics, {
        code: "body.mass-limit",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/mass`,
        subject,
        message: `Mass of body "${body.id}" must not exceed ${MAX_BODY_MASS_KG} kg.`,
        actualValue: body.massKg,
        limit: MAX_BODY_MASS_KG,
      });
    }

    if (!Number.isFinite(body.physicalRadiusM)) {
      pushDiagnostic(diagnostics, {
        code: "numeric.non-finite-config-value",
        severity: "error",
        category: "numerical",
        path: `${bodyPath}/physicalRadius`,
        subject,
        message: `Physical radius of body "${body.id}" must be finite and non-negative.`,
        actualValue: body.physicalRadiusM,
      });
    } else if (body.physicalRadiusM < 0) {
      pushDiagnostic(diagnostics, {
        code: "body.radius-negative",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/physicalRadius`,
        subject,
        message: `Physical radius of body "${body.id}" must be finite and non-negative.`,
        actualValue: body.physicalRadiusM,
      });
    } else if (body.physicalRadiusM > MAX_PHYSICAL_RADIUS_M) {
      pushDiagnostic(diagnostics, {
        code: "body.radius-limit",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/physicalRadius`,
        subject,
        message: `Physical radius of body "${body.id}" must not exceed ${MAX_PHYSICAL_RADIUS_M} m.`,
        actualValue: body.physicalRadiusM,
        limit: MAX_PHYSICAL_RADIUS_M,
      });
    } else if (body.physicalRadiusM === 0) {
      pushDiagnostic(diagnostics, {
        code: "domain.point-radius-unknown",
        severity: "warning",
        category: "newtonian-domain",
        path: `${bodyPath}/physicalRadius`,
        subject,
        message:
          `Body "${body.id}" is an idealized point body; its self-compactness is unknown.`,
        actualValue: body.physicalRadiusM,
      });
    }

    const positionComponents = [
      ["x", body.initialPositionM.x],
      ["y", body.initialPositionM.y],
      ["z", body.initialPositionM.z],
    ] as const;
    const velocityComponents = [
      ["x", body.initialVelocityMps.x],
      ["y", body.initialVelocityMps.y],
      ["z", body.initialVelocityMps.z],
    ] as const;

    for (const [axis, value] of positionComponents) {
      if (!Number.isFinite(value)) {
        pushDiagnostic(diagnostics, {
          code: "numeric.non-finite-config-value",
          severity: "error",
          category: "numerical",
          path: `${bodyPath}/initialPosition/${axis}`,
          subject,
          message:
            `Initial position and velocity of body "${body.id}" must be finite 3D vectors.`,
          actualValue: value,
        });
      } else if (Math.abs(value) > MAX_POSITION_COMPONENT_M) {
        pushDiagnostic(diagnostics, {
          code: "body.position-limit",
          severity: "error",
          category: "elementary",
          path: `${bodyPath}/initialPosition/${axis}`,
          subject,
          message:
            `Initial position component ${axis} of body "${body.id}" must have an absolute value no greater than ${MAX_POSITION_COMPONENT_M} m.`,
          actualValue: value,
          limit: MAX_POSITION_COMPONENT_M,
        });
      }
    }

    for (const [axis, value] of velocityComponents) {
      if (!Number.isFinite(value)) {
        pushDiagnostic(diagnostics, {
          code: "numeric.non-finite-config-value",
          severity: "error",
          category: "numerical",
          path: `${bodyPath}/initialVelocity/${axis}`,
          subject,
          message:
            `Initial position and velocity of body "${body.id}" must be finite 3D vectors.`,
          actualValue: value,
        });
      }
    }

    if (
      body.fixed &&
      isFiniteVector3(body.initialVelocityMps) &&
      (body.initialVelocityMps.x !== 0 ||
        body.initialVelocityMps.y !== 0 ||
        body.initialVelocityMps.z !== 0)
    ) {
      pushDiagnostic(diagnostics, {
        code: "body.fixed-velocity",
        severity: "error",
        category: "elementary",
        path: `${bodyPath}/initialVelocity`,
        subject,
        message: `Fixed body "${body.id}" must have a zero initial velocity.`,
      });
    }

    hasFixedBodies ||= body.fixed;
  }

  if (hasFixedBodies) {
    pushDiagnostic(diagnostics, {
      code: "domain.external-constraint",
      severity: "warning",
      category: "newtonian-domain",
      path: "/bodies",
      subject: SCENARIO_SUBJECT,
      message:
        "At least one fixed body imposes an external constraint; velocity-domain checks use the scenario coordinate frame.",
    });
  }

  for (
    let firstIndex = 0;
    firstIndex < config.bodies.length;
    firstIndex += 1
  ) {
    const firstBody = config.bodies[firstIndex];

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < config.bodies.length;
      secondIndex += 1
    ) {
      const secondBody = config.bodies[secondIndex];

      if (
        !isFiniteVector3(firstBody.initialPositionM) ||
        !isFiniteVector3(secondBody.initialPositionM) ||
        !Number.isFinite(firstBody.physicalRadiusM) ||
        !Number.isFinite(secondBody.physicalRadiusM) ||
        firstBody.physicalRadiusM < 0 ||
        secondBody.physicalRadiusM < 0
      ) {
        continue;
      }

      const separationM = Math.hypot(
        secondBody.initialPositionM.x - firstBody.initialPositionM.x,
        secondBody.initialPositionM.y - firstBody.initialPositionM.y,
        secondBody.initialPositionM.z - firstBody.initialPositionM.z
      );
      const contactDistanceM =
        firstBody.physicalRadiusM + secondBody.physicalRadiusM;

      if (separationM <= contactDistanceM) {
        pushDiagnostic(diagnostics, {
          code: "geometry.initial-contact",
          severity: "error",
          category: "geometry",
          path: "/bodies",
          subject: pairSubject(
            firstBody.id,
            secondBody.id,
            firstIndex,
            secondIndex
          ),
          message:
            `Bodies "${firstBody.id}" and "${secondBody.id}" overlap or touch in the initial configuration.`,
          actualValue: separationM,
          limit: contactDistanceM,
        });
      }
    }
  }

  const hasPhysicalAnalysisPreconditionError = diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      diagnostic.code !== "config.time-step" &&
      diagnostic.code !== "config.encounter-threshold" &&
      !(
        diagnostic.code === "numeric.non-finite-config-value" &&
        (diagnostic.path === "/timeStepSeconds" ||
          diagnostic.path.startsWith("/encounterThresholds/"))
      )
  );

  if (!hasPhysicalAnalysisPreconditionError) {
    const bodyCount = config.bodies.length;
    const massesKg = new Float64Array(bodyCount);
    const physicalRadiiM = new Float64Array(bodyCount);
    const fixed = new Uint8Array(bodyCount);
    const positionsM = new Float64Array(bodyCount * 3);
    const velocitiesMps = new Float64Array(bodyCount * 3);
    const accelerationsMps2 = new Float64Array(bodyCount * 3);

    for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
      const body = config.bodies[bodyIndex];
      const offset = bodyIndex * 3;
      massesKg[bodyIndex] = body.massKg;
      physicalRadiiM[bodyIndex] = body.physicalRadiusM;
      fixed[bodyIndex] = body.fixed ? 1 : 0;
      positionsM[offset] = body.initialPositionM.x;
      positionsM[offset + 1] = body.initialPositionM.y;
      positionsM[offset + 2] = body.initialPositionM.z;
      velocitiesMps[offset] = body.initialVelocityMps.x;
      velocitiesMps[offset + 1] = body.initialVelocityMps.y;
      velocitiesMps[offset + 2] = body.initialVelocityMps.z;
    }

    let hasUsableInitialAcceleration = true;

    try {
      computeNewtonianAccelerations(
        massesKg,
        positionsM,
        accelerationsMps2
      );

      if (
        accelerationsMps2.some(
          (acceleration) => !Number.isFinite(acceleration)
        )
      ) {
        throw new RangeError(
          "Initial acceleration contains a non-finite value."
        );
      }
    } catch (error) {
      hasUsableInitialAcceleration = false;
      pushDiagnostic(diagnostics, {
        code: "numeric.initial-acceleration",
        severity: "error",
        category: "numerical",
        path: "/bodies",
        subject: SCENARIO_SUBJECT,
        message:
          error instanceof Error
            ? `Initial acceleration evaluation failed: ${error.message}`
            : "Initial acceleration evaluation failed.",
      });
    }

    if (hasUsableInitialAcceleration) {
      try {
        const diagnosticState: NewtonianState = {
          bodyIds: config.bodies.map((body) => body.id),
          massesKg,
          physicalRadiiM,
          fixed,
          positionsM,
          velocitiesMps,
          accelerationsMps2,
          stepCount: 0,
          timeSeconds: 0,
        };
        const initialDiagnostics =
          computeNewtonianDiagnostics(diagnosticState);
        const diagnosticValues = [
          initialDiagnostics.kineticEnergyJ,
          initialDiagnostics.potentialEnergyJ,
          initialDiagnostics.totalEnergyJ,
          initialDiagnostics.linearMomentumKgMps.x,
          initialDiagnostics.linearMomentumKgMps.y,
          initialDiagnostics.linearMomentumKgMps.z,
          initialDiagnostics.angularMomentumKgM2ps.x,
          initialDiagnostics.angularMomentumKgM2ps.y,
          initialDiagnostics.angularMomentumKgM2ps.z,
          initialDiagnostics.centerOfMassM.x,
          initialDiagnostics.centerOfMassM.y,
          initialDiagnostics.centerOfMassM.z,
        ];

        if (diagnosticValues.some((value) => !Number.isFinite(value))) {
          throw new RangeError(
            "Initial diagnostics contain a non-finite value."
          );
        }
      } catch (error) {
        pushDiagnostic(diagnostics, {
          code: "numeric.initial-diagnostics",
          severity: "error",
          category: "numerical",
          path: "/bodies",
          subject: SCENARIO_SUBJECT,
          message:
            error instanceof Error
              ? `Initial diagnostics evaluation failed: ${error.message}`
              : "Initial diagnostics evaluation failed.",
        });
      }

      if (
        Number.isFinite(config.timeStepSeconds) &&
        config.timeStepSeconds > 0
      ) {
        const halfTimeStep = config.timeStepSeconds * 0.5;
        const axes = ["x", "y", "z"] as const;

        for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
          if (fixed[bodyIndex] === 1) {
            continue;
          }

          const offset = bodyIndex * 3;

          for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
            const vectorIndex = offset + axisIndex;
            const halfStepVelocity =
              velocitiesMps[vectorIndex] +
              accelerationsMps2[vectorIndex] * halfTimeStep;
            const candidatePosition =
              positionsM[vectorIndex] +
              halfStepVelocity * config.timeStepSeconds;

            if (
              Number.isFinite(halfStepVelocity) &&
              Number.isFinite(candidatePosition)
            ) {
              continue;
            }

            pushDiagnostic(diagnostics, {
              code: "numeric.initial-drift",
              severity: "error",
              category: "numerical",
              path:
                `/bodies/${bodyIndex}/initialPosition/` +
                axes[axisIndex],
              subject: bodySubject(
                config.bodies[bodyIndex].id,
                bodyIndex
              ),
              message:
                `The first fixed-step drift of body ` +
                `"${config.bodies[bodyIndex].id}" produces a non-finite ` +
                `${axes[axisIndex]} component.`,
              actualValue: candidatePosition,
            });
          }
        }
      }
    }

    try {
      const validityWorkspace =
        createNewtonianValidityWorkspace(bodyCount);
      evaluateNewtonianValidityInto(
        massesKg,
        physicalRadiiM,
        fixed,
        positionsM,
        velocitiesMps,
        validityWorkspace
      );
      newtonianValidity = materializeNewtonianValidityReport(
        config.bodies.map((body) => body.id),
        validityWorkspace
      );

      for (const diagnostic of createNewtonianValidityDiagnostics(
        newtonianValidity,
        config.bodies
      )) {
        pushDiagnostic(diagnostics, diagnostic);
      }
    } catch (error) {
      pushDiagnostic(diagnostics, {
        code: "numeric.initial-acceleration",
        severity: "error",
        category: "numerical",
        path: "/bodies",
        subject: SCENARIO_SUBJECT,
        message:
          error instanceof Error
            ? `Initial Newtonian-domain analysis failed: ${error.message}`
            : "Initial Newtonian-domain analysis failed.",
      });
    }
  }

  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning"
  );

  return {
    valid: errors.length === 0,
    diagnostics,
    errors,
    warnings,
    newtonianValidity,
  };
}

/**
 * Internal assertion kept for the engine and backwards compatibility. User
 * input must use analyzeSimulationConfig or compileScenarioDraft instead.
 */
export function validateSimulationConfig(
  config: NewtonianSimulationConfig
): void {
  const report = analyzeSimulationConfig(config);

  if (!report.valid) {
    throw new SimulationConfigurationError(report.errors[0]);
  }
}
