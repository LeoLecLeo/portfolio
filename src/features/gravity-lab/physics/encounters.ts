import type {
  EncounterDetection,
  EncounterThresholds,
} from "../core/types";
import { GRAVITATIONAL_CONSTANT_M3_KG_S2 } from "../core/units";

export type EncounterInspectionKind =
  | "none"
  | "collision"
  | "unresolved-encounter";

export type EncounterInspectionWorkspace = {
  kind: EncounterInspectionKind;
  firstBodyIndex: number;
  secondBodyIndex: number;
  minimumSeparationM: number;
  contactDistanceM: number;
  relativeDisplacementRatio: number;
  dynamicalStepRatio: number;
  exceededRelativeDisplacement: boolean;
  exceededDynamicalStep: boolean;
};

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createEncounterInspectionWorkspace(): EncounterInspectionWorkspace {
  return {
    kind: "none",
    firstBodyIndex: -1,
    secondBodyIndex: -1,
    minimumSeparationM: 0,
    contactDistanceM: 0,
    relativeDisplacementRatio: 0,
    dynamicalStepRatio: 0,
    exceededRelativeDisplacement: false,
    exceededDynamicalStep: false,
  };
}

function resetEncounterInspectionWorkspace(
  workspace: EncounterInspectionWorkspace
): void {
  workspace.kind = "none";
  workspace.firstBodyIndex = -1;
  workspace.secondBodyIndex = -1;
  workspace.minimumSeparationM = 0;
  workspace.contactDistanceM = 0;
  workspace.relativeDisplacementRatio = 0;
  workspace.dynamicalStepRatio = 0;
  workspace.exceededRelativeDisplacement = false;
  workspace.exceededDynamicalStep = false;
}

function writeEncounterInspection(
  workspace: EncounterInspectionWorkspace,
  kind: Exclude<EncounterInspectionKind, "none">,
  firstBodyIndex: number,
  secondBodyIndex: number,
  minimumSeparationM: number,
  contactDistanceM: number,
  relativeDisplacementRatio: number,
  dynamicalStepRatio: number,
  exceededRelativeDisplacement: boolean,
  exceededDynamicalStep: boolean
): void {
  workspace.kind = kind;
  workspace.firstBodyIndex = firstBodyIndex;
  workspace.secondBodyIndex = secondBodyIndex;
  workspace.minimumSeparationM = minimumSeparationM;
  workspace.contactDistanceM = contactDistanceM;
  workspace.relativeDisplacementRatio = relativeDisplacementRatio;
  workspace.dynamicalStepRatio = dynamicalStepRatio;
  workspace.exceededRelativeDisplacement = exceededRelativeDisplacement;
  workspace.exceededDynamicalStep = exceededDynamicalStep;
}

export function inspectEncounterAcrossStep(
  previousPositionsM: Float64Array,
  candidatePositionsM: Float64Array,
  massesKg: Float64Array,
  physicalRadiiM: Float64Array,
  fixed: Uint8Array,
  timeStepSeconds: number,
  thresholds: EncounterThresholds,
  workspace: EncounterInspectionWorkspace
): EncounterInspectionWorkspace {
  const vectorLength = massesKg.length * 3;

  if (
    previousPositionsM.length !== vectorLength ||
    candidatePositionsM.length !== vectorLength ||
    physicalRadiiM.length !== massesKg.length ||
    fixed.length !== massesKg.length
  ) {
    throw new RangeError("Encounter buffers describe different body counts.");
  }

  resetEncounterInspectionWorkspace(workspace);

  for (let firstIndex = 0; firstIndex < massesKg.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < massesKg.length;
      secondIndex += 1
    ) {
      const firstOffset = firstIndex * 3;
      const secondOffset = secondIndex * 3;
      const startX =
        previousPositionsM[secondOffset] -
        previousPositionsM[firstOffset];
      const startY =
        previousPositionsM[secondOffset + 1] -
        previousPositionsM[firstOffset + 1];
      const startZ =
        previousPositionsM[secondOffset + 2] -
        previousPositionsM[firstOffset + 2];
      const endX =
        candidatePositionsM[secondOffset] -
        candidatePositionsM[firstOffset];
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
      const minimumSeparationM = Math.hypot(
        closestX,
        closestY,
        closestZ
      );
      const relativeDisplacementM = Math.sqrt(displacementSquared);
      const contactDistanceM =
        physicalRadiiM[firstIndex] + physicalRadiiM[secondIndex];
      const relativeDisplacementRatio =
        minimumSeparationM === 0
          ? Number.POSITIVE_INFINITY
          : relativeDisplacementM / minimumSeparationM;
      const dynamicalStepRatio =
        minimumSeparationM === 0
          ? Number.POSITIVE_INFINITY
          : timeStepSeconds *
            Math.sqrt(
              (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
                (massesKg[firstIndex] + massesKg[secondIndex])) /
                minimumSeparationM ** 3
            );

      if (minimumSeparationM <= contactDistanceM) {
        writeEncounterInspection(
          workspace,
          "collision",
          firstIndex,
          secondIndex,
          minimumSeparationM,
          contactDistanceM,
          relativeDisplacementRatio,
          dynamicalStepRatio,
          false,
          false
        );
        return workspace;
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
        workspace.kind === "none" &&
        (exceededRelativeDisplacement || exceededDynamicalStep)
      ) {
        writeEncounterInspection(
          workspace,
          "unresolved-encounter",
          firstIndex,
          secondIndex,
          minimumSeparationM,
          contactDistanceM,
          relativeDisplacementRatio,
          dynamicalStepRatio,
          exceededRelativeDisplacement,
          exceededDynamicalStep
        );
      }
    }
  }

  return workspace;
}

export function materializeEncounterDetection(
  workspace: EncounterInspectionWorkspace
): EncounterDetection | null {
  if (workspace.kind === "collision") {
    return {
      kind: "collision",
      firstBodyIndex: workspace.firstBodyIndex,
      secondBodyIndex: workspace.secondBodyIndex,
      minimumSeparationM: workspace.minimumSeparationM,
      contactDistanceM: workspace.contactDistanceM,
      relativeDisplacementRatio: workspace.relativeDisplacementRatio,
      dynamicalStepRatio: workspace.dynamicalStepRatio,
    };
  }

  if (workspace.kind === "unresolved-encounter") {
    return {
      kind: "unresolved-encounter",
      firstBodyIndex: workspace.firstBodyIndex,
      secondBodyIndex: workspace.secondBodyIndex,
      minimumSeparationM: workspace.minimumSeparationM,
      contactDistanceM: workspace.contactDistanceM,
      relativeDisplacementRatio: workspace.relativeDisplacementRatio,
      dynamicalStepRatio: workspace.dynamicalStepRatio,
      exceededRelativeDisplacement:
        workspace.exceededRelativeDisplacement,
      exceededDynamicalStep: workspace.exceededDynamicalStep,
    };
  }

  return null;
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
  const workspace = createEncounterInspectionWorkspace();

  inspectEncounterAcrossStep(
    previousPositionsM,
    candidatePositionsM,
    massesKg,
    physicalRadiiM,
    fixed,
    timeStepSeconds,
    thresholds,
    workspace
  );

  return materializeEncounterDetection(workspace);
}
