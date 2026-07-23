import type {
  EncounterDetection,
  EncounterThresholds,
} from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";

type PairGeometry = Readonly<{
  minimumSeparationM: number;
  relativeDisplacementM: number;
}>;

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function inspectSweptPair(
  previousPositionsM: Float64Array,
  candidatePositionsM: Float64Array,
  firstIndex: number,
  secondIndex: number
): PairGeometry {
  const firstOffset = firstIndex * 3;
  const secondOffset = secondIndex * 3;

  const startX =
    previousPositionsM[secondOffset] - previousPositionsM[firstOffset];
  const startY =
    previousPositionsM[secondOffset + 1] -
    previousPositionsM[firstOffset + 1];
  const startZ =
    previousPositionsM[secondOffset + 2] -
    previousPositionsM[firstOffset + 2];

  const endX =
    candidatePositionsM[secondOffset] - candidatePositionsM[firstOffset];
  const endY =
    candidatePositionsM[secondOffset + 1] -
    candidatePositionsM[firstOffset + 1];
  const endZ =
    candidatePositionsM[secondOffset + 2] -
    candidatePositionsM[firstOffset + 2];

  const displacementX = endX - startX;
  const displacementY = endY - startY;
  const displacementZ = endZ - startZ;
  const displacementSquared =
    displacementX * displacementX +
    displacementY * displacementY +
    displacementZ * displacementZ;

  const closestFraction =
    displacementSquared === 0
      ? 0
      : clampUnitInterval(
          -(
            startX * displacementX +
            startY * displacementY +
            startZ * displacementZ
          ) / displacementSquared
        );

  const closestX = startX + displacementX * closestFraction;
  const closestY = startY + displacementY * closestFraction;
  const closestZ = startZ + displacementZ * closestFraction;

  return {
    minimumSeparationM: Math.hypot(closestX, closestY, closestZ),
    relativeDisplacementM: Math.sqrt(displacementSquared),
  };
}

export function detectEncounterAcrossStep(
  previousPositionsM: Float64Array,
  candidatePositionsM: Float64Array,
  massesKg: Float64Array,
  physicalRadiiM: Float64Array,
  fixed: Uint8Array,
  timeStepSeconds: number,
  thresholds: EncounterThresholds
): EncounterDetection | null {
  const vectorLength = massesKg.length * 3;

  if (
    previousPositionsM.length !== vectorLength ||
    candidatePositionsM.length !== vectorLength ||
    physicalRadiiM.length !== massesKg.length ||
    fixed.length !== massesKg.length
  ) {
    throw new RangeError("Encounter buffers describe different body counts.");
  }

  let unresolvedEncounter: EncounterDetection | null = null;

  for (let firstIndex = 0; firstIndex < massesKg.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < massesKg.length;
      secondIndex += 1
    ) {
      const geometry = inspectSweptPair(
        previousPositionsM,
        candidatePositionsM,
        firstIndex,
        secondIndex
      );
      const contactDistanceM =
        physicalRadiiM[firstIndex] + physicalRadiiM[secondIndex];
      const relativeDisplacementRatio =
        geometry.minimumSeparationM === 0
          ? Number.POSITIVE_INFINITY
          : geometry.relativeDisplacementM / geometry.minimumSeparationM;
      const dynamicalStepRatio =
        geometry.minimumSeparationM === 0
          ? Number.POSITIVE_INFINITY
          : timeStepSeconds *
            Math.sqrt(
              (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
                (massesKg[firstIndex] + massesKg[secondIndex])) /
                geometry.minimumSeparationM ** 3
            );

      if (geometry.minimumSeparationM <= contactDistanceM) {
        return {
          kind: "collision",
          firstBodyIndex: firstIndex,
          secondBodyIndex: secondIndex,
          minimumSeparationM: geometry.minimumSeparationM,
          contactDistanceM,
          relativeDisplacementRatio,
          dynamicalStepRatio,
        };
      }

      if (fixed[firstIndex] === 1 && fixed[secondIndex] === 1) {
        continue;
      }

      const exceededRelativeDisplacement =
        relativeDisplacementRatio >
        thresholds.maxRelativeDisplacementPerStep;
      const exceededDynamicalStep =
        dynamicalStepRatio > thresholds.maxDynamicalStep;

      if (
        unresolvedEncounter === null &&
        (exceededRelativeDisplacement || exceededDynamicalStep)
      ) {
        unresolvedEncounter = {
          kind: "unresolved-encounter",
          firstBodyIndex: firstIndex,
          secondBodyIndex: secondIndex,
          minimumSeparationM: geometry.minimumSeparationM,
          contactDistanceM,
          relativeDisplacementRatio,
          dynamicalStepRatio,
          exceededRelativeDisplacement,
          exceededDynamicalStep,
        };
      }
    }
  }

  return unresolvedEncounter;
}
