import { MAX_NEWTONIAN_BODIES } from "../core/types";
import {
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SPEED_OF_LIGHT_MPS,
} from "../core/units";

const INVERSE_SPEED_OF_LIGHT_SQUARED =
  1 / (SPEED_OF_LIGHT_MPS * SPEED_OF_LIGHT_MPS);

function viewsOverlap(
  first: Float64Array,
  second: Float64Array
): boolean {
  if (first.buffer !== second.buffer) {
    return false;
  }

  const firstStart = first.byteOffset;
  const firstEnd = firstStart + first.byteLength;
  const secondStart = second.byteOffset;
  const secondEnd = secondStart + second.byteLength;

  return firstStart < secondEnd && secondStart < firstEnd;
}

function assertFiniteBuffer(
  values: Float64Array,
  label: string
): void {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      throw new RangeError(
        `${label} contains a non-finite value at index ${index}.`
      );
    }
  }
}

function assertValidInputs(
  massesKg: Float64Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array,
  outputAccelerationsMps2: Float64Array
): void {
  const bodyCount = massesKg.length;
  const vectorLength = bodyCount * 3;

  if (bodyCount < 1 || bodyCount > MAX_NEWTONIAN_BODIES) {
    throw new RangeError(
      `EIH 1PN acceleration requires between 1 and ${MAX_NEWTONIAN_BODIES} bodies.`
    );
  }

  if (
    positionsM.length !== vectorLength ||
    velocitiesMps.length !== vectorLength ||
    outputAccelerationsMps2.length !== vectorLength
  ) {
    throw new RangeError(
      "Mass, position, velocity, and acceleration buffers describe different body counts."
    );
  }

  if (
    viewsOverlap(outputAccelerationsMps2, massesKg) ||
    viewsOverlap(outputAccelerationsMps2, positionsM) ||
    viewsOverlap(outputAccelerationsMps2, velocitiesMps)
  ) {
    throw new RangeError(
      "EIH 1PN output must not overlap any input buffer."
    );
  }

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    if (!Number.isFinite(massesKg[bodyIndex]) || massesKg[bodyIndex] <= 0) {
      throw new RangeError(
        `Mass at body index ${bodyIndex} must be finite and strictly positive.`
      );
    }
  }

  assertFiniteBuffer(positionsM, "EIH 1PN positions");
  assertFiniteBuffer(velocitiesMps, "EIH 1PN velocities");

  for (let firstIndex = 0; firstIndex < bodyCount; firstIndex += 1) {
    const firstOffset = firstIndex * 3;

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < bodyCount;
      secondIndex += 1
    ) {
      const secondOffset = secondIndex * 3;
      const deltaX = positionsM[firstOffset] - positionsM[secondOffset];
      const deltaY =
        positionsM[firstOffset + 1] - positionsM[secondOffset + 1];
      const deltaZ =
        positionsM[firstOffset + 2] - positionsM[secondOffset + 2];
      const separationSquared =
        deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;

      if (!Number.isFinite(separationSquared) || separationSquared <= 0) {
        throw new RangeError(
          `Bodies at indices ${firstIndex} and ${secondIndex} have an invalid separation for EIH 1PN acceleration.`
        );
      }
    }
  }
}

function assertFiniteIntermediate(
  value: number,
  label: string,
  bodyIndex: number,
  sourceBodyIndex: number
): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `EIH 1PN ${label} is non-finite for body indices ${bodyIndex} and ${sourceBodyIndex}.`
    );
  }

  return value;
}

/**
 * Computes the complete, order-reduced Einstein-Infeld-Hoffmann acceleration
 * through first post-Newtonian order in harmonic barycentric coordinates.
 *
 * SI units are mandatory. With r_ki = x_k - x_i and v_ki = v_k - v_i:
 *
 * a_k = -sum(i != k) G m_i r_ki / r_ki^3 + a_k^(1PN) / c^2.
 *
 * The 1PN term is kept in the literal triple-sum form specified in
 * docs/gravity-lab/PHASE_3_PLAN.md. In particular, sums over j != i include
 * j = k, and sums over j != k include j = i. No radius, softening, collision
 * policy, or runtime state participates in this force law.
 */
export function computeFirstPostNewtonianAccelerations(
  massesKg: Float64Array,
  positionsM: Float64Array,
  velocitiesMps: Float64Array,
  outputAccelerationsMps2: Float64Array
): void {
  assertValidInputs(
    massesKg,
    positionsM,
    velocitiesMps,
    outputAccelerationsMps2
  );

  outputAccelerationsMps2.fill(0);

  for (let bodyIndex = 0; bodyIndex < massesKg.length; bodyIndex += 1) {
    const bodyOffset = bodyIndex * 3;
    const bodyPositionX = positionsM[bodyOffset];
    const bodyPositionY = positionsM[bodyOffset + 1];
    const bodyPositionZ = positionsM[bodyOffset + 2];
    const bodyVelocityX = velocitiesMps[bodyOffset];
    const bodyVelocityY = velocitiesMps[bodyOffset + 1];
    const bodyVelocityZ = velocitiesMps[bodyOffset + 2];
    const bodySpeedSquared =
      bodyVelocityX * bodyVelocityX +
      bodyVelocityY * bodyVelocityY +
      bodyVelocityZ * bodyVelocityZ;
    let accelerationX = 0;
    let accelerationY = 0;
    let accelerationZ = 0;

    if (!Number.isFinite(bodySpeedSquared)) {
      throw new RangeError(
        `EIH 1PN squared speed is non-finite for body index ${bodyIndex}.`
      );
    }

    for (
      let sourceBodyIndex = 0;
      sourceBodyIndex < massesKg.length;
      sourceBodyIndex += 1
    ) {
      if (sourceBodyIndex === bodyIndex) {
        continue;
      }

      const sourceOffset = sourceBodyIndex * 3;
      const sourcePositionX = positionsM[sourceOffset];
      const sourcePositionY = positionsM[sourceOffset + 1];
      const sourcePositionZ = positionsM[sourceOffset + 2];
      const sourceVelocityX = velocitiesMps[sourceOffset];
      const sourceVelocityY = velocitiesMps[sourceOffset + 1];
      const sourceVelocityZ = velocitiesMps[sourceOffset + 2];
      const sourceSpeedSquared =
        sourceVelocityX * sourceVelocityX +
        sourceVelocityY * sourceVelocityY +
        sourceVelocityZ * sourceVelocityZ;
      const relativePositionX = bodyPositionX - sourcePositionX;
      const relativePositionY = bodyPositionY - sourcePositionY;
      const relativePositionZ = bodyPositionZ - sourcePositionZ;
      const separationSquared =
        relativePositionX * relativePositionX +
        relativePositionY * relativePositionY +
        relativePositionZ * relativePositionZ;
      const separation = Math.sqrt(separationSquared);
      const inverseSeparation = 1 / separation;
      const inverseSeparationCubed =
        inverseSeparation / separationSquared;
      const sourceMassKg = massesKg[sourceBodyIndex];
      const newtonianScale =
        -GRAVITATIONAL_CONSTANT_M3_KG_S2 *
        sourceMassKg *
        inverseSeparationCubed;

      if (!Number.isFinite(sourceSpeedSquared)) {
        throw new RangeError(
          `EIH 1PN squared speed is non-finite for body index ${sourceBodyIndex}.`
        );
      }

      accelerationX += newtonianScale * relativePositionX;
      accelerationY += newtonianScale * relativePositionY;
      accelerationZ += newtonianScale * relativePositionZ;

      let potentialAtSource = 0;
      let potentialAtBody = 0;
      let orderReductionDotSum = 0;
      let sourceNewtonianSumX = 0;
      let sourceNewtonianSumY = 0;
      let sourceNewtonianSumZ = 0;

      for (
        let thirdBodyIndex = 0;
        thirdBodyIndex < massesKg.length;
        thirdBodyIndex += 1
      ) {
        const thirdMassKg = massesKg[thirdBodyIndex];

        if (thirdBodyIndex !== sourceBodyIndex) {
          const thirdOffset = thirdBodyIndex * 3;
          const sourceToThirdX =
            sourcePositionX - positionsM[thirdOffset];
          const sourceToThirdY =
            sourcePositionY - positionsM[thirdOffset + 1];
          const sourceToThirdZ =
            sourcePositionZ - positionsM[thirdOffset + 2];
          const sourceToThirdSquared =
            sourceToThirdX * sourceToThirdX +
            sourceToThirdY * sourceToThirdY +
            sourceToThirdZ * sourceToThirdZ;
          const sourceToThirdDistance = Math.sqrt(sourceToThirdSquared);
          const sourceToThirdInverse = 1 / sourceToThirdDistance;
          const sourceToThirdInverseCubed =
            sourceToThirdInverse / sourceToThirdSquared;
          const weightedPotential =
            GRAVITATIONAL_CONSTANT_M3_KG_S2 *
            thirdMassKg *
            sourceToThirdInverse;
          const weightedInverseCube =
            GRAVITATIONAL_CONSTANT_M3_KG_S2 *
            thirdMassKg *
            sourceToThirdInverseCubed;

          potentialAtSource += weightedPotential;
          orderReductionDotSum +=
            weightedInverseCube *
            (relativePositionX * sourceToThirdX +
              relativePositionY * sourceToThirdY +
              relativePositionZ * sourceToThirdZ);
          sourceNewtonianSumX += weightedInverseCube * sourceToThirdX;
          sourceNewtonianSumY += weightedInverseCube * sourceToThirdY;
          sourceNewtonianSumZ += weightedInverseCube * sourceToThirdZ;
        }

        if (thirdBodyIndex !== bodyIndex) {
          const thirdOffset = thirdBodyIndex * 3;
          const bodyToThirdX = bodyPositionX - positionsM[thirdOffset];
          const bodyToThirdY =
            bodyPositionY - positionsM[thirdOffset + 1];
          const bodyToThirdZ =
            bodyPositionZ - positionsM[thirdOffset + 2];
          const bodyToThirdDistance = Math.hypot(
            bodyToThirdX,
            bodyToThirdY,
            bodyToThirdZ
          );

          potentialAtBody +=
            (GRAVITATIONAL_CONSTANT_M3_KG_S2 * thirdMassKg) /
            bodyToThirdDistance;
        }
      }

      const sourceProjection =
        relativePositionX * sourceVelocityX +
        relativePositionY * sourceVelocityY +
        relativePositionZ * sourceVelocityZ;
      const velocityDot =
        bodyVelocityX * sourceVelocityX +
        bodyVelocityY * sourceVelocityY +
        bodyVelocityZ * sourceVelocityZ;
      const radialBracket = assertFiniteIntermediate(
        potentialAtSource +
          4 * potentialAtBody -
          0.5 * orderReductionDotSum +
          (1.5 * sourceProjection * sourceProjection) /
            separationSquared -
          2 * sourceSpeedSquared -
          bodySpeedSquared +
          4 * velocityDot,
        "radial bracket",
        bodyIndex,
        sourceBodyIndex
      );
      const radialCorrectionScale = assertFiniteIntermediate(
        GRAVITATIONAL_CONSTANT_M3_KG_S2 *
          sourceMassKg *
          inverseSeparationCubed *
          radialBracket *
          INVERSE_SPEED_OF_LIGHT_SQUARED,
        "radial correction",
        bodyIndex,
        sourceBodyIndex
      );
      const relativeVelocityX = bodyVelocityX - sourceVelocityX;
      const relativeVelocityY = bodyVelocityY - sourceVelocityY;
      const relativeVelocityZ = bodyVelocityZ - sourceVelocityZ;
      const velocityProjection =
        relativePositionX * (4 * bodyVelocityX - 3 * sourceVelocityX) +
        relativePositionY * (4 * bodyVelocityY - 3 * sourceVelocityY) +
        relativePositionZ * (4 * bodyVelocityZ - 3 * sourceVelocityZ);
      const velocityCorrectionScale = assertFiniteIntermediate(
        GRAVITATIONAL_CONSTANT_M3_KG_S2 *
          sourceMassKg *
          inverseSeparationCubed *
          velocityProjection *
          INVERSE_SPEED_OF_LIGHT_SQUARED,
        "velocity correction",
        bodyIndex,
        sourceBodyIndex
      );
      const orderReductionScale = assertFiniteIntermediate(
        -3.5 *
          GRAVITATIONAL_CONSTANT_M3_KG_S2 *
          sourceMassKg *
          inverseSeparation *
          INVERSE_SPEED_OF_LIGHT_SQUARED,
        "order-reduction correction",
        bodyIndex,
        sourceBodyIndex
      );

      accelerationX +=
        radialCorrectionScale * relativePositionX +
        velocityCorrectionScale * relativeVelocityX +
        orderReductionScale * sourceNewtonianSumX;
      accelerationY +=
        radialCorrectionScale * relativePositionY +
        velocityCorrectionScale * relativeVelocityY +
        orderReductionScale * sourceNewtonianSumY;
      accelerationZ +=
        radialCorrectionScale * relativePositionZ +
        velocityCorrectionScale * relativeVelocityZ +
        orderReductionScale * sourceNewtonianSumZ;

      assertFiniteIntermediate(
        accelerationX,
        "accumulated x acceleration",
        bodyIndex,
        sourceBodyIndex
      );
      assertFiniteIntermediate(
        accelerationY,
        "accumulated y acceleration",
        bodyIndex,
        sourceBodyIndex
      );
      assertFiniteIntermediate(
        accelerationZ,
        "accumulated z acceleration",
        bodyIndex,
        sourceBodyIndex
      );
    }

    outputAccelerationsMps2[bodyOffset] = accelerationX;
    outputAccelerationsMps2[bodyOffset + 1] = accelerationY;
    outputAccelerationsMps2[bodyOffset + 2] = accelerationZ;
  }
}
