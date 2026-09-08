import { SOLAR_MASS_KG } from "../core/units";
import {
  MASSIVE_GEODESIC_INDEX,
  MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  circularMassiveGeodesicProperPeriodSeconds,
  createCircularMassiveSchwarzschildState,
} from "../physics/massiveSchwarzschildGeodesic";
import {
  NULL_GEODESIC_INDEX,
  NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  createIncomingEquatorialNullSchwarzschildState,
} from "../physics/nullSchwarzschildGeodesic";
import {
  schwarzschildCriticalNullImpactParameterM,
  schwarzschildRadiusM,
} from "../physics/schwarzschildMetric";
import { HeadlessMassiveSchwarzschildSimulation } from "./massiveSchwarzschildExperiment";
import {
  HeadlessNullSchwarzschildSimulation,
  NULL_SCHWARZSCHILD_REFERENCE_AFFINE_STEP,
  NULL_SCHWARZSCHILD_REFERENCE_RAYS,
  runNullSchwarzschildScatteringExperiment,
  type NullScatteringClassification,
} from "./nullSchwarzschildExperiment";
import {
  createSchwarzschildHorizonGuard,
  type SchwarzschildHorizonGuard,
} from "./schwarzschildGeodesicRk4";

export const SCHWARZSCHILD_VISUALIZATION_CENTRAL_MASS_KG = SOLAR_MASS_KG;
export const SCHWARZSCHILD_VISUALIZATION_ORBIT_RADIUS_RATIO = 5;
export const SCHWARZSCHILD_VISUALIZATION_TRAJECTORY_STEPS = 512;
export const SCHWARZSCHILD_LIGHT_INITIAL_RADIUS_RATIO = 8;
export const SCHWARZSCHILD_LIGHT_AFFINE_STEP =
  NULL_SCHWARZSCHILD_REFERENCE_AFFINE_STEP;
export const SCHWARZSCHILD_LIGHT_MAX_STEPS = 20_000;
export const SCHWARZSCHILD_LIGHT_SAMPLE_EVERY_STEPS = 5;
export const SCHWARZSCHILD_LIGHT_MAX_POINTS_PER_RAY = 4_096;

export const SCHWARZSCHILD_REFERENCE_LIGHT_RAYS =
  NULL_SCHWARZSCHILD_REFERENCE_RAYS;

export type SchwarzschildReferenceLightRayId =
  (typeof SCHWARZSCHILD_REFERENCE_LIGHT_RAYS)[number]["id"];

export type SchwarzschildTrajectorySample = Readonly<{
  radiusM: number;
  polarAngleRad: number;
  azimuthalAngleRad: number;
}>;

export type SchwarzschildVisualizationExperiment = Readonly<{
  centralMassKg: number;
  schwarzschildRadiusM: number;
  geodesicKind: "massive-stable-circular";
  trajectory: readonly SchwarzschildTrajectorySample[];
  criticalImpactParameterM: number;
  lightTrajectories: readonly SchwarzschildLightTrajectory[];
  maxConstraintResidual: number;
}>;

export type SchwarzschildLightTrajectory = Readonly<{
  id: SchwarzschildReferenceLightRayId;
  impactParameterCriticalFactor: number;
  impactParameterM: number;
  classification: Exclude<NullScatteringClassification, "max-steps">;
  termination: "return-radius" | "horizon-guard";
  trajectory: readonly SchwarzschildTrajectorySample[];
  stepCount: number;
  maxConstraintResidual: number;
  horizonGuardRadiusRatio: number;
  horizonGuardObservedRadiusRatio: number | null;
  finalRadiusRatio: number;
}>;

function readTrajectorySample(
  phaseSpace: Float64Array,
  horizonRadiusM: number
): SchwarzschildTrajectorySample {
  const sample = Object.freeze({
    radiusM:
      phaseSpace[NULL_GEODESIC_INDEX.radius] * horizonRadiusM,
    polarAngleRad: phaseSpace[NULL_GEODESIC_INDEX.polar],
    azimuthalAngleRad: phaseSpace[NULL_GEODESIC_INDEX.azimuthal],
  });

  if (
    ![
      sample.radiusM,
      sample.polarAngleRad,
      sample.azimuthalAngleRad,
    ].every(Number.isFinite)
  ) {
    throw new RangeError(
      "Schwarzschild light trajectory samples must remain finite."
    );
  }

  return sample;
}

function appendDistinctBoundedSample(
  trajectory: SchwarzschildTrajectorySample[],
  sample: SchwarzschildTrajectorySample
): void {
  const previous = trajectory.at(-1);

  if (
    previous?.radiusM === sample.radiusM &&
    previous.polarAngleRad === sample.polarAngleRad &&
    previous.azimuthalAngleRad === sample.azimuthalAngleRad
  ) {
    return;
  }

  if (trajectory.length >= SCHWARZSCHILD_LIGHT_MAX_POINTS_PER_RAY) {
    throw new RangeError(
      "Schwarzschild light visualization exceeded its bounded point budget."
    );
  }

  trajectory.push(sample);
}

function createReferenceLightTrajectory(
  centralMassKg: number,
  horizonRadiusM: number,
  criticalImpactParameterM: number,
  reference: (typeof SCHWARZSCHILD_REFERENCE_LIGHT_RAYS)[number],
  horizonGuard: SchwarzschildHorizonGuard
): SchwarzschildLightTrajectory {
  const initialRadiusM =
    SCHWARZSCHILD_LIGHT_INITIAL_RADIUS_RATIO * horizonRadiusM;
  const impactParameterM =
    reference.impactParameterCriticalFactor * criticalImpactParameterM;
  const authoritativeResult = runNullSchwarzschildScatteringExperiment({
    centralMassKg,
    initialRadiusM,
    impactParameterM,
    affineStep: SCHWARZSCHILD_LIGHT_AFFINE_STEP,
    maxSteps: SCHWARZSCHILD_LIGHT_MAX_STEPS,
    horizonGuard,
  });

  if (
    authoritativeResult.classification !==
      reference.expectedClassification ||
    authoritativeResult.termination === "step-budget"
  ) {
    throw new RangeError(
      `Validated Schwarzschild reference ray ${reference.id} did not reach its expected classification.`
    );
  }

  const initialState = createIncomingEquatorialNullSchwarzschildState({
    centralMassKg,
    initialRadiusM,
    impactParameterM,
  });
  const simulation = new HeadlessNullSchwarzschildSimulation({
    affineStep: SCHWARZSCHILD_LIGHT_AFFINE_STEP,
    initialState,
    horizonGuard,
  });
  const phaseSpace = new Float64Array(
    NULL_SCHWARZSCHILD_PHASE_SPACE_LENGTH
  );
  const trajectory: SchwarzschildTrajectorySample[] = [];
  simulation.copyPhaseSpaceTo(phaseSpace);
  appendDistinctBoundedSample(
    trajectory,
    readTrajectorySample(phaseSpace, horizonRadiusM)
  );
  let turnedOutward = false;
  let observedTermination: "return-radius" | "horizon-guard" | null = null;
  let horizonGuardObservedRadiusRatio: number | null = null;

  for (
    let iteration = 0;
    iteration < SCHWARZSCHILD_LIGHT_MAX_STEPS;
    iteration += 1
  ) {
    const step = simulation.advanceOneStep();

    if (!step.accepted) {
      if (step.reason !== "horizon-approach") {
        throw new RangeError(step.message);
      }

      simulation.copyPhaseSpaceTo(phaseSpace);
      appendDistinctBoundedSample(
        trajectory,
        readTrajectorySample(phaseSpace, horizonRadiusM)
      );
      horizonGuardObservedRadiusRatio = step.observedRadiusRatio;
      observedTermination = "horizon-guard";
      break;
    }

    simulation.copyPhaseSpaceTo(phaseSpace);
    const radiusRatio = phaseSpace[NULL_GEODESIC_INDEX.radius];

    if (phaseSpace[NULL_GEODESIC_INDEX.radialMomentum] > 0) {
      turnedOutward = true;
    }

    if (
      simulation.stepCount % SCHWARZSCHILD_LIGHT_SAMPLE_EVERY_STEPS === 0
    ) {
      appendDistinctBoundedSample(
        trajectory,
        readTrajectorySample(phaseSpace, horizonRadiusM)
      );
    }

    if (
      turnedOutward &&
      radiusRatio >= SCHWARZSCHILD_LIGHT_INITIAL_RADIUS_RATIO
    ) {
      appendDistinctBoundedSample(
        trajectory,
        readTrajectorySample(phaseSpace, horizonRadiusM)
      );
      observedTermination = "return-radius";
      break;
    }
  }

  if (observedTermination !== authoritativeResult.termination) {
    throw new RangeError(
      `Schwarzschild reference ray ${reference.id} sampling disagreed with the validated 4C termination.`
    );
  }

  const finalRadiusRatio =
    (trajectory.at(-1)?.radiusM ?? Number.NaN) / horizonRadiusM;

  if (!Number.isFinite(finalRadiusRatio)) {
    throw new RangeError(
      "Schwarzschild light trajectory must end at a finite radius."
    );
  }

  return Object.freeze({
    id: reference.id,
    impactParameterCriticalFactor:
      reference.impactParameterCriticalFactor,
    impactParameterM,
    classification: authoritativeResult.classification,
    termination: authoritativeResult.termination,
    trajectory: Object.freeze(trajectory),
    stepCount: authoritativeResult.stepCount,
    maxConstraintResidual: authoritativeResult.maxConstraintResidual,
    horizonGuardRadiusRatio: horizonGuard.minimumRadiusRatio,
    horizonGuardObservedRadiusRatio,
    finalRadiusRatio,
  });
}

/**
 * Produces one bounded, deterministic physical trajectory through the validated
 * 4B headless engine. Rendering policy is deliberately absent from this API.
 */
export function createSchwarzschildVisualizationExperiment(): SchwarzschildVisualizationExperiment {
  const centralMassKg = SCHWARZSCHILD_VISUALIZATION_CENTRAL_MASS_KG;
  const horizonRadiusM = schwarzschildRadiusM(centralMassKg);
  const criticalImpactParameterM =
    schwarzschildCriticalNullImpactParameterM(centralMassKg);
  const horizonGuard = createSchwarzschildHorizonGuard();
  const orbitRadiusM =
    SCHWARZSCHILD_VISUALIZATION_ORBIT_RADIUS_RATIO * horizonRadiusM;
  const initialState = createCircularMassiveSchwarzschildState({
    centralMassKg,
    radiusM: orbitRadiusM,
  });
  const properPeriodSeconds = circularMassiveGeodesicProperPeriodSeconds(
    centralMassKg,
    orbitRadiusM
  );
  const simulation = new HeadlessMassiveSchwarzschildSimulation({
    centralMassKg,
    properTimeStepSeconds:
      properPeriodSeconds / SCHWARZSCHILD_VISUALIZATION_TRAJECTORY_STEPS,
    initialState,
  });
  const phaseSpace = new Float64Array(
    MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH
  );
  const trajectory: SchwarzschildTrajectorySample[] = [];
  let maxConstraintResidual = 0;

  for (
    let step = 0;
    step <= SCHWARZSCHILD_VISUALIZATION_TRAJECTORY_STEPS;
    step += 1
  ) {
    simulation.copyPhaseSpaceTo(phaseSpace);
    const radiusM =
      phaseSpace[MASSIVE_GEODESIC_INDEX.radius] * horizonRadiusM;
    const polarAngleRad = phaseSpace[MASSIVE_GEODESIC_INDEX.polar];
    const azimuthalAngleRad =
      phaseSpace[MASSIVE_GEODESIC_INDEX.azimuthal];

    if (![radiusM, polarAngleRad, azimuthalAngleRad].every(Number.isFinite)) {
      throw new RangeError(
        "Schwarzschild visualization trajectory must remain finite."
      );
    }

    trajectory.push(Object.freeze({
      radiusM,
      polarAngleRad,
      azimuthalAngleRad,
    }));
    maxConstraintResidual = Math.max(
      maxConstraintResidual,
      Math.abs(simulation.diagnostics.constraintResidual)
    );

    if (step < SCHWARZSCHILD_VISUALIZATION_TRAJECTORY_STEPS) {
      const result = simulation.advanceOneStep();

      if (!result.accepted) {
        throw new RangeError(
          `Validated Schwarzschild visualization geodesic was rejected: ${result.message}`
        );
      }
    }
  }

  return Object.freeze({
    centralMassKg,
    schwarzschildRadiusM: horizonRadiusM,
    geodesicKind: "massive-stable-circular" as const,
    trajectory: Object.freeze(trajectory),
    criticalImpactParameterM,
    lightTrajectories: Object.freeze(
      SCHWARZSCHILD_REFERENCE_LIGHT_RAYS.map((reference) =>
        createReferenceLightTrajectory(
          centralMassKg,
          horizonRadiusM,
          criticalImpactParameterM,
          reference,
          horizonGuard
        )
      )
    ),
    maxConstraintResidual,
  });
}
