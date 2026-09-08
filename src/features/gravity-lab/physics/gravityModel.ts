export const GRAVITY_MODEL_IDS = Object.freeze([
  "newtonian",
  "first-post-newtonian",
] as const);

export type GravityModelId = (typeof GRAVITY_MODEL_IDS)[number];

export type GravityIntegratorId = "velocity-verlet" | "fixed-rk4";

export type FirstPostNewtonianDomain =
  | "weak-correction"
  | "transition"
  | "outside-product-domain";

export function isGravityModelId(value: unknown): value is GravityModelId {
  return value === "newtonian" || value === "first-post-newtonian";
}

export function productionIntegratorForModel(
  modelId: GravityModelId
): GravityIntegratorId {
  return modelId === "newtonian" ? "velocity-verlet" : "fixed-rk4";
}

export function classifyFirstPostNewtonianDomain(
  report: NewtonianValidityReport
): FirstPostNewtonianDomain {
  if (report.overallLevel === "hard-error") {
    return "outside-product-domain";
  }

  const orbitalCorrectionIsElevated =
    report.beta.level !== "recommended" ||
    report.chiPair?.level === "caution" ||
    report.chiPair?.level === "strong-warning" ||
    report.psi.level === "caution" ||
    report.psi.level === "strong-warning";

  // chiSelf remains visible in the full report as a separate body-model
  // compactness diagnostic. It does not by itself measure the EIH orbital
  // correction, though its hard limit still excludes the product domain.
  return orbitalCorrectionIsElevated ? "transition" : "weak-correction";
}
import type { NewtonianValidityReport } from "./newtonianValidity";
