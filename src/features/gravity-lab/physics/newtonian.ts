import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";

function assertCompatibleBuffers(
  massesKg: Float64Array,
  positionsM: Float64Array,
  accelerationsMps2: Float64Array
): void {
  const expectedVectorLength = massesKg.length * 3;

  if (
    positionsM.length !== expectedVectorLength ||
    accelerationsMps2.length !== expectedVectorLength
  ) {
    throw new RangeError(
      "Mass, position, and acceleration buffers describe different body counts."
    );
  }
}

export function computeNewtonianAccelerations(
  massesKg: Float64Array,
  positionsM: Float64Array,
  outputAccelerationsMps2: Float64Array
): void {
  assertCompatibleBuffers(
    massesKg,
    positionsM,
    outputAccelerationsMps2
  );
  outputAccelerationsMps2.fill(0);

  for (let firstIndex = 0; firstIndex < massesKg.length; firstIndex += 1) {
    const firstOffset = firstIndex * 3;

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < massesKg.length;
      secondIndex += 1
    ) {
      const secondOffset = secondIndex * 3;
      const deltaX = positionsM[secondOffset] - positionsM[firstOffset];
      const deltaY =
        positionsM[secondOffset + 1] - positionsM[firstOffset + 1];
      const deltaZ =
        positionsM[secondOffset + 2] - positionsM[firstOffset + 2];
      const distanceSquared =
        deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;

      if (!Number.isFinite(distanceSquared) || distanceSquared <= 0) {
        throw new RangeError(
          `Bodies at indices ${firstIndex} and ${secondIndex} have an invalid separation.`
        );
      }

      const inverseDistanceCubed =
        1 / (distanceSquared * Math.sqrt(distanceSquared));
      const firstScale =
        GRAVITATIONAL_CONSTANT_M3_KG_S2 *
        massesKg[secondIndex] *
        inverseDistanceCubed;
      const secondScale =
        GRAVITATIONAL_CONSTANT_M3_KG_S2 *
        massesKg[firstIndex] *
        inverseDistanceCubed;

      if (!Number.isFinite(firstScale) || !Number.isFinite(secondScale)) {
        throw new RangeError(
          `Acceleration overflow for bodies at indices ${firstIndex} and ${secondIndex}.`
        );
      }

      outputAccelerationsMps2[firstOffset] += firstScale * deltaX;
      outputAccelerationsMps2[firstOffset + 1] += firstScale * deltaY;
      outputAccelerationsMps2[firstOffset + 2] += firstScale * deltaZ;

      outputAccelerationsMps2[secondOffset] -= secondScale * deltaX;
      outputAccelerationsMps2[secondOffset + 1] -= secondScale * deltaY;
      outputAccelerationsMps2[secondOffset + 2] -= secondScale * deltaZ;
    }
  }
}
