import { describe, expect, it } from "vitest";

import {
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SPEED_OF_LIGHT_MPS,
} from "../core/units";
import { createInclinedBinaryConfig } from "../presets/inclinedBinary";
import {
  BETA_CAUTION_THRESHOLD,
  BETA_HARD_ERROR_THRESHOLD,
  BETA_STRONG_WARNING_THRESHOLD,
  WEAK_FIELD_CAUTION_THRESHOLD,
  WEAK_FIELD_HARD_ERROR_THRESHOLD,
  WEAK_FIELD_STRONG_WARNING_THRESHOLD,
  classifyBeta,
  classifyWeakField,
  createNewtonianValidityWorkspace,
  evaluateNewtonianValidityInto,
  hasNewtonianDomainViolation,
  materializeNewtonianValidityReport,
  type NewtonianValidityReport,
} from "./newtonianValidity";

type EvaluationInput = Readonly<{
  bodyIds: readonly string[];
  massesKg: readonly number[];
  physicalRadiiM: readonly number[];
  fixed: readonly number[];
  positionsM: readonly number[];
  velocitiesMps: readonly number[];
}>;

function evaluate(input: EvaluationInput): NewtonianValidityReport {
  const workspace = createNewtonianValidityWorkspace(
    input.bodyIds.length
  );

  evaluateNewtonianValidityInto(
    new Float64Array(input.massesKg),
    new Float64Array(input.physicalRadiiM),
    new Uint8Array(input.fixed),
    new Float64Array(input.positionsM),
    new Float64Array(input.velocitiesMps),
    workspace
  );

  return materializeNewtonianValidityReport(
    input.bodyIds,
    workspace
  );
}

describe("Newtonian validity level classification", () => {
  it("uses the exact approved beta boundaries", () => {
    expect(classifyBeta(BETA_CAUTION_THRESHOLD / 2)).toBe(
      "recommended"
    );
    expect(classifyBeta(BETA_CAUTION_THRESHOLD)).toBe("caution");
    expect(classifyBeta(BETA_STRONG_WARNING_THRESHOLD)).toBe(
      "strong-warning"
    );
    expect(classifyBeta(BETA_HARD_ERROR_THRESHOLD)).toBe(
      "hard-error"
    );
  });

  it("uses the exact approved weak-field boundaries", () => {
    expect(
      classifyWeakField(WEAK_FIELD_CAUTION_THRESHOLD / 2)
    ).toBe("recommended");
    expect(
      classifyWeakField(WEAK_FIELD_CAUTION_THRESHOLD)
    ).toBe("caution");
    expect(
      classifyWeakField(WEAK_FIELD_STRONG_WARNING_THRESHOLD)
    ).toBe("strong-warning");
    expect(
      classifyWeakField(WEAK_FIELD_HARD_ERROR_THRESHOLD)
    ).toBe("hard-error");
  });

  it("treats unusable classifier inputs as hard errors", () => {
    for (const value of [
      -Number.MIN_VALUE,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(classifyBeta(value)).toBe("hard-error");
      expect(classifyWeakField(value)).toBe("hard-error");
    }
  });
});

describe("Newtonian velocity-domain evaluation", () => {
  it("uses the barycentric frame when no body is fixed", () => {
    const report = evaluate({
      bodyIds: ["traveller"],
      massesKg: [1],
      physicalRadiiM: [1],
      fixed: [0],
      positionsM: [0, 0, 0],
      velocitiesMps: [
        0.2 * SPEED_OF_LIGHT_MPS,
        -0.1 * SPEED_OF_LIGHT_MPS,
        0.05 * SPEED_OF_LIGHT_MPS,
      ],
    });

    expect(report.velocityFrame).toBe("barycentric");
    expect(report.hasExternalConstraint).toBe(false);
    expect(report.beta.value).toBeCloseTo(0, 15);
    expect(report.beta.responsible).toEqual({
      kind: "body",
      bodyId: "traveller",
      frame: "barycentric",
    });
  });

  it("also evaluates every relative pair and keeps its identity", () => {
    const report = evaluate({
      bodyIds: ["a", "b", "c"],
      massesKg: [1, 1, 1],
      physicalRadiiM: [1, 1, 1],
      fixed: [0, 0, 0],
      positionsM: [-10, 0, 0, 0, 10, 0, 10, 0, 0],
      velocitiesMps: [
        -0.02 * SPEED_OF_LIGHT_MPS,
        0,
        0,
        0.005 * SPEED_OF_LIGHT_MPS,
        0,
        0,
        0.03 * SPEED_OF_LIGHT_MPS,
        0,
        0,
      ],
    });

    expect(report.beta.value).toBeCloseTo(0.05, 14);
    expect(report.beta.level).toBe("strong-warning");
    expect(report.beta.responsible).toEqual({
      kind: "pair",
      firstBodyId: "a",
      secondBodyId: "c",
      frame: "relative",
    });
  });

  it("uses the scenario frame and reports an external constraint", () => {
    const report = evaluate({
      bodyIds: ["anchor", "mobile"],
      massesKg: [10, 1],
      physicalRadiiM: [1, 1],
      fixed: [1, 0],
      positionsM: [0, 0, 0, 100, 0, 0],
      velocitiesMps: [
        0,
        0,
        0,
        0.02 * SPEED_OF_LIGHT_MPS,
        0,
        0,
      ],
    });

    expect(report.velocityFrame).toBe("scenario");
    expect(report.hasExternalConstraint).toBe(true);
    expect(report.beta.value).toBeCloseTo(0.02, 14);
    expect(report.beta.responsible).toEqual({
      kind: "body",
      bodyId: "mobile",
      frame: "scenario",
    });
  });
});

describe("Newtonian weak-field evaluation", () => {
  it("keeps chi_pair, chi_self and psi separate with responsible bodies", () => {
    const report = evaluate({
      bodyIds: ["a", "b", "c"],
      massesKg: [2e20, 3e20, 5e20],
      physicalRadiiM: [1e6, 2e6, 3e6],
      fixed: [0, 0, 0],
      positionsM: [0, 0, 0, 1e6, 0, 0, 4e6, 0, 0],
      velocitiesMps: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    const gravitationalLengthPerKg =
      GRAVITATIONAL_CONSTANT_M3_KG_S2 /
      (SPEED_OF_LIGHT_MPS * SPEED_OF_LIGHT_MPS);

    expect(report.chiPair?.value).toBeCloseTo(
      (gravitationalLengthPerKg * 5e20) / 1e6,
      15
    );
    expect(report.chiPair?.responsible).toEqual({
      kind: "pair",
      firstBodyId: "a",
      secondBodyId: "b",
    });
    expect(report.chiSelf?.value).toBeCloseTo(
      (gravitationalLengthPerKg * 2e20) / 1e6,
      15
    );
    expect(report.chiSelf?.responsible).toEqual({
      kind: "body",
      bodyId: "a",
    });
    expect(report.psi.value).toBeCloseTo(
      gravitationalLengthPerKg *
        (3e20 / 1e6 + 5e20 / 4e6),
      15
    );
    expect(report.psi.responsible).toEqual({
      kind: "body",
      bodyId: "a",
    });
    expect(report.overallLevel).toBe("recommended");
  });

  it("marks zero-radius self compactness as unknown, not infinite", () => {
    const mixedReport = evaluate({
      bodyIds: ["point", "extended"],
      massesKg: [1e20, 2e20],
      physicalRadiiM: [0, 1e6],
      fixed: [0, 0],
      positionsM: [0, 0, 0, 1e9, 0, 0],
      velocitiesMps: [0, 0, 0, 0, 0, 0],
    });

    expect(mixedReport.unknownSelfCompactnessBodyIds).toEqual([
      "point",
    ]);
    expect(mixedReport.chiSelf?.responsible).toEqual({
      kind: "body",
      bodyId: "extended",
    });
    expect(Number.isFinite(mixedReport.chiSelf?.value)).toBe(true);

    const pointOnlyReport = evaluate({
      bodyIds: ["point"],
      massesKg: [1e20],
      physicalRadiiM: [0],
      fixed: [0],
      positionsM: [0, 0, 0],
      velocitiesMps: [0, 0, 0],
    });

    expect(pointOnlyReport.chiPair).toBeNull();
    expect(pointOnlyReport.chiSelf).toBeNull();
    expect(pointOnlyReport.unknownSelfCompactnessBodyIds).toEqual([
      "point",
    ]);
    expect(pointOnlyReport.psi.value).toBe(0);
    expect(Object.isFrozen(pointOnlyReport)).toBe(true);
    expect(Object.isFrozen(pointOnlyReport.beta)).toBe(true);
    expect(Object.isFrozen(pointOnlyReport.beta.responsible)).toBe(true);
    expect(
      Object.isFrozen(pointOnlyReport.unknownSelfCompactnessBodyIds)
    ).toBe(true);
    expect(Object.isFrozen(pointOnlyReport.psi)).toBe(true);
    expect(Object.isFrozen(pointOnlyReport.psi.responsible)).toBe(true);
  });

  it("detects hard-domain states without materializing a report", () => {
    const workspace = createNewtonianValidityWorkspace(2);

    evaluateNewtonianValidityInto(
      new Float64Array([1, 1]),
      new Float64Array([1, 1]),
      new Uint8Array([0, 0]),
      new Float64Array([-10, 0, 0, 10, 0, 0]),
      new Float64Array([
        -0.05 * SPEED_OF_LIGHT_MPS,
        0,
        0,
        0.05 * SPEED_OF_LIGHT_MPS,
        0,
        0,
      ]),
      workspace
    );

    expect(workspace.maximumBeta).toBeCloseTo(0.1, 14);
    expect(hasNewtonianDomainViolation(workspace)).toBe(true);
    expect(
      materializeNewtonianValidityReport(["left", "right"], workspace)
        .beta.responsible
    ).toEqual({
      kind: "pair",
      firstBodyId: "left",
      secondBodyId: "right",
      frame: "relative",
    });
  });

  it("reuses and fully resets its preallocated workspace", () => {
    const workspace = createNewtonianValidityWorkspace(2);
    const masses = new Float64Array([2e20, 1e20]);
    const fixed = new Uint8Array([0, 0]);
    const positions = new Float64Array([0, 0, 0, 1e9, 0, 0]);

    evaluateNewtonianValidityInto(
      masses,
      new Float64Array([0, 1]),
      fixed,
      positions,
      new Float64Array([
        -0.02 * SPEED_OF_LIGHT_MPS,
        0,
        0,
        0.02 * SPEED_OF_LIGHT_MPS,
        0,
        0,
      ]),
      workspace
    );
    expect(workspace.unknownSelfCompactnessCount).toBe(1);
    expect(workspace.localPotentialBodyIndex).toBe(1);

    masses[0] = 1e20;
    masses[1] = 2e20;
    evaluateNewtonianValidityInto(
      masses,
      new Float64Array([1e6, 1e6]),
      fixed,
      positions,
      new Float64Array(6),
      workspace
    );
    const report = materializeNewtonianValidityReport(
      ["a", "b"],
      workspace
    );

    expect(report.beta.value).toBe(0);
    expect(report.unknownSelfCompactnessBodyIds).toEqual([]);
    expect(report.psi.responsible).toEqual({
      kind: "body",
      bodyId: "a",
    });
    expect(workspace.unknownSelfCompactnessCount).toBe(0);
  });
});

describe("inclined binary Newtonian validity", () => {
  it("matches the approved reference measures and responsible identities", () => {
    const config = createInclinedBinaryConfig();
    const bodyIds = config.bodies.map((body) => body.id);
    const massesKg = config.bodies.map((body) => body.massKg);
    const radiiM = config.bodies.map(
      (body) => body.physicalRadiusM
    );
    const fixed = config.bodies.map((body) => (body.fixed ? 1 : 0));
    const positionsM = config.bodies.flatMap((body) => [
      body.initialPositionM.x,
      body.initialPositionM.y,
      body.initialPositionM.z,
    ]);
    const velocitiesMps = config.bodies.flatMap((body) => [
      body.initialVelocityMps.x,
      body.initialVelocityMps.y,
      body.initialVelocityMps.z,
    ]);
    const report = evaluate({
      bodyIds,
      massesKg,
      physicalRadiiM: radiiM,
      fixed,
      positionsM,
      velocitiesMps,
    });

    expect(report.beta.value).toBeCloseTo(
      3.141803176605156e-4,
      15
    );
    expect(report.beta.responsible).toEqual({
      kind: "pair",
      firstBodyId: "binary-a",
      secondBodyId: "binary-b",
      frame: "relative",
    });
    expect(report.chiPair?.value).toBeCloseTo(
      9.87092720052625e-8,
      15
    );
    expect(report.chiPair?.responsible).toEqual({
      kind: "pair",
      firstBodyId: "binary-a",
      secondBodyId: "binary-b",
    });
    expect(report.chiSelf?.value).toBeCloseTo(
      2.122566754396204e-6,
      15
    );
    expect(report.chiSelf?.responsible).toEqual({
      kind: "body",
      bodyId: "binary-a",
    });
    expect(report.psi.value).toBeCloseTo(
      4.935463600263125e-8,
      15
    );
    expect(report.psi.responsible).toEqual({
      kind: "body",
      bodyId: "binary-a",
    });
    expect(report.overallLevel).toBe("recommended");
    expect(report.hasExternalConstraint).toBe(false);
  });
});
