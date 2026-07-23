import type {
  NewtonianDiagnostics,
  NewtonianState,
} from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";
import { vector3 } from "../core/vector3";

export function computeNewtonianDiagnostics(
  state: NewtonianState
): NewtonianDiagnostics {
  let kineticEnergyJ = 0;
  let potentialEnergyJ = 0;
  let momentumX = 0;
  let momentumY = 0;
  let momentumZ = 0;
  let angularMomentumX = 0;
  let angularMomentumY = 0;
  let angularMomentumZ = 0;
  let weightedPositionX = 0;
  let weightedPositionY = 0;
  let weightedPositionZ = 0;
  let totalMassKg = 0;
  let hasFixedBodies = false;

  for (let bodyIndex = 0; bodyIndex < state.massesKg.length; bodyIndex += 1) {
    const offset = bodyIndex * 3;
    const massKg = state.massesKg[bodyIndex];
    const positionX = state.positionsM[offset];
    const positionY = state.positionsM[offset + 1];
    const positionZ = state.positionsM[offset + 2];
    const velocityX = state.velocitiesMps[offset];
    const velocityY = state.velocitiesMps[offset + 1];
    const velocityZ = state.velocitiesMps[offset + 2];
    const momentumBodyX = massKg * velocityX;
    const momentumBodyY = massKg * velocityY;
    const momentumBodyZ = massKg * velocityZ;

    kineticEnergyJ +=
      0.5 *
      massKg *
      (velocityX * velocityX +
        velocityY * velocityY +
        velocityZ * velocityZ);
    momentumX += momentumBodyX;
    momentumY += momentumBodyY;
    momentumZ += momentumBodyZ;
    angularMomentumX +=
      positionY * momentumBodyZ - positionZ * momentumBodyY;
    angularMomentumY +=
      positionZ * momentumBodyX - positionX * momentumBodyZ;
    angularMomentumZ +=
      positionX * momentumBodyY - positionY * momentumBodyX;
    weightedPositionX += massKg * positionX;
    weightedPositionY += massKg * positionY;
    weightedPositionZ += massKg * positionZ;
    totalMassKg += massKg;
    hasFixedBodies ||= state.fixed[bodyIndex] === 1;

    for (
      let secondIndex = bodyIndex + 1;
      secondIndex < state.massesKg.length;
      secondIndex += 1
    ) {
      const secondOffset = secondIndex * 3;
      const separationM = Math.hypot(
        state.positionsM[secondOffset] - positionX,
        state.positionsM[secondOffset + 1] - positionY,
        state.positionsM[secondOffset + 2] - positionZ
      );

      if (!Number.isFinite(separationM) || separationM <= 0) {
        throw new RangeError(
          `Cannot compute potential energy for bodies at indices ${bodyIndex} and ${secondIndex}.`
        );
      }

      potentialEnergyJ -=
        (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
          massKg *
          state.massesKg[secondIndex]) /
        separationM;
    }
  }

  return {
    kineticEnergyJ,
    potentialEnergyJ,
    totalEnergyJ: kineticEnergyJ + potentialEnergyJ,
    linearMomentumKgMps: vector3(momentumX, momentumY, momentumZ),
    angularMomentumKgM2ps: vector3(
      angularMomentumX,
      angularMomentumY,
      angularMomentumZ
    ),
    centerOfMassM: vector3(
      weightedPositionX / totalMassKg,
      weightedPositionY / totalMassKg,
      weightedPositionZ / totalMassKg
    ),
    hasFixedBodies,
  };
}
