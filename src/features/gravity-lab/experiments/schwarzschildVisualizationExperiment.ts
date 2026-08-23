import { SOLAR_MASS_KG } from "../core/units";
import {
  MASSIVE_GEODESIC_INDEX,
  MASSIVE_SCHWARZSCHILD_PHASE_SPACE_LENGTH,
  circularMassiveGeodesicProperPeriodSeconds,
  createCircularMassiveSchwarzschildState,
} from "../physics/massiveSchwarzschildGeodesic";
import { schwarzschildRadiusM } from "../physics/schwarzschildMetric";
import { HeadlessMassiveSchwarzschildSimulation } from "./massiveSchwarzschildExperiment";

export const SCHWARZSCHILD_VISUALIZATION_CENTRAL_MASS_KG = SOLAR_MASS_KG;
export const SCHWARZSCHILD_VISUALIZATION_ORBIT_RADIUS_RATIO = 5;
export const SCHWARZSCHILD_VISUALIZATION_TRAJECTORY_STEPS = 512;

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
  maxConstraintResidual: number;
}>;

/**
 * Produces one bounded, deterministic physical trajectory through the validated
 * 4B headless engine. Rendering policy is deliberately absent from this API.
 */
export function createSchwarzschildVisualizationExperiment(): SchwarzschildVisualizationExperiment {
  const centralMassKg = SCHWARZSCHILD_VISUALIZATION_CENTRAL_MASS_KG;
  const horizonRadiusM = schwarzschildRadiusM(centralMassKg);
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
    maxConstraintResidual,
  });
}
