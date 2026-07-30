import { describe, expect, it } from "vitest";

import type {
  EncounterThresholds,
  NewtonianState,
} from "../core/types";
import {
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SPEED_OF_LIGHT_MPS,
} from "../core/units";
import {
  createVelocityVerletWorkspace,
  type VelocityVerletWorkspace,
} from "../integrators/velocityVerlet";
import {
  createCandidateStateGuardWorkspace,
  inspectCompletedVelocityVerletCandidate,
  inspectVelocityVerletDriftCandidate,
  materializeCandidateStateRejection,
} from "./candidateStateGuard";

const SCIENTIFIC_THRESHOLDS: EncounterThresholds = {
  maxRelativeDisplacementPerStep: 0.02,
  maxDynamicalStep: 0.02,
};

const PERMISSIVE_THRESHOLDS: EncounterThresholds = {
  maxRelativeDisplacementPerStep: 1,
  maxDynamicalStep: 1,
};

function createState(
  positionsM: readonly number[],
  options: Readonly<{
    massesKg?: readonly number[];
    physicalRadiiM?: readonly number[];
    fixed?: readonly number[];
  }> = {}
): NewtonianState {
  const bodyCount = positionsM.length / 3;

  if (!Number.isInteger(bodyCount)) {
    throw new RangeError("Test positions must contain complete 3D vectors.");
  }

  return {
    bodyIds: Array.from(
      { length: bodyCount },
      (_, bodyIndex) => `body-${bodyIndex}`
    ),
    massesKg: new Float64Array(
      options.massesKg ?? Array.from({ length: bodyCount }, () => 1)
    ),
    physicalRadiiM: new Float64Array(
      options.physicalRadiiM ??
        Array.from({ length: bodyCount }, () => 0)
    ),
    fixed: new Uint8Array(
      options.fixed ?? Array.from({ length: bodyCount }, () => 0)
    ),
    positionsM: new Float64Array(positionsM),
    velocitiesMps: new Float64Array(bodyCount * 3),
    accelerationsMps2: new Float64Array(bodyCount * 3),
    stepCount: 0,
    timeSeconds: 0,
  };
}

function setCandidate(
  workspace: VelocityVerletWorkspace,
  positionsM: readonly number[],
  velocitiesMps: readonly number[] = new Array(positionsM.length).fill(0)
): void {
  workspace.candidatePositionsM.set(positionsM);
  workspace.halfStepVelocitiesMps.fill(0);
  workspace.candidateVelocitiesMps.set(velocitiesMps);
  workspace.candidateAccelerationsMps2.fill(0);
}

describe("candidate-state guard ordering", () => {
  it("rejects a non-finite drift before interpreting its geometry", () => {
    const state = createState([-1, 0, 0, 1, 0, 0], {
      physicalRadiiM: [0.1, 0.1],
    });
    const verlet = createVelocityVerletWorkspace(2);
    const guard = createCandidateStateGuardWorkspace(2);
    setCandidate(verlet, [
      1,
      Number.NaN,
      0,
      -1,
      0,
      0,
    ]);

    expect(
      inspectVelocityVerletDriftCandidate(
        state,
        1,
        SCIENTIFIC_THRESHOLDS,
        verlet,
        guard
      )
    ).toBe("numerical-error");
    expect(guard.encounter.kind).toBe("none");
    expect(
      materializeCandidateStateRejection(state.bodyIds, guard)
    ).toEqual({
      kind: "numerical-error",
      buffer: "candidate-positions",
      vectorIndex: 1,
      bodyIndex: 0,
      axis: "y",
    });
  });

  it("gives a later swept collision priority over an earlier q violation", () => {
    const state = createState([
      -1_000, 0, 0,
      -900, 0, 0,
      -1, 0, 0,
      1, 0, 0,
    ], {
      physicalRadiiM: [0, 0, 0.1, 0.1],
    });
    const verlet = createVelocityVerletWorkspace(4);
    const guard = createCandidateStateGuardWorkspace(4);
    setCandidate(verlet, [
      -1_000, 0, 0,
      -890, 0, 0,
      1, 0, 0,
      -1, 0, 0,
    ]);

    expect(
      inspectVelocityVerletDriftCandidate(
        state,
        1,
        SCIENTIFIC_THRESHOLDS,
        verlet,
        guard
      )
    ).toBe("collision");

    const rejection = materializeCandidateStateRejection(
      state.bodyIds,
      guard
    );
    expect(rejection?.kind).toBe("encounter");
    if (rejection?.kind === "encounter") {
      expect(rejection.encounter.kind).toBe("collision");
      expect(rejection.encounter.firstBodyIndex).toBe(2);
      expect(rejection.encounter.secondBodyIndex).toBe(3);
    }
  });

  it("reports q before a domain violation present in the same candidate", () => {
    const state = createState([-10, 0, 0, 10, 0, 0]);
    const verlet = createVelocityVerletWorkspace(2);
    const guard = createCandidateStateGuardWorkspace(2);
    setCandidate(
      verlet,
      [-9, 0, 0, 9, 0, 0],
      [
        -0.05 * SPEED_OF_LIGHT_MPS,
        0,
        0,
        0.05 * SPEED_OF_LIGHT_MPS,
        0,
        0,
      ]
    );

    expect(
      inspectVelocityVerletDriftCandidate(
        state,
        1,
        SCIENTIFIC_THRESHOLDS,
        verlet,
        guard
      )
    ).toBe("unresolved-encounter");
    const driftRejection = materializeCandidateStateRejection(
      state.bodyIds,
      guard
    );
    expect(driftRejection?.kind).toBe("encounter");
    if (driftRejection?.kind === "encounter") {
      expect(driftRejection.encounter.kind).toBe(
        "unresolved-encounter"
      );
    }

    const completedGuard = createCandidateStateGuardWorkspace(2);
    expect(
      inspectCompletedVelocityVerletCandidate(
        state,
        verlet,
        completedGuard
      )
    ).toBe("newtonian-domain-violation");
  });

  it("rejects a non-finite completed buffer before the domain check", () => {
    const state = createState([-1e12, 0, 0, 1e12, 0, 0]);
    const verlet = createVelocityVerletWorkspace(2);
    const guard = createCandidateStateGuardWorkspace(2);
    setCandidate(
      verlet,
      [-1e12, 0, 0, 1e12, 0, 0],
      [
        Number.POSITIVE_INFINITY,
        0,
        0,
        0.1 * SPEED_OF_LIGHT_MPS,
        0,
        0,
      ]
    );

    expect(
      inspectCompletedVelocityVerletCandidate(state, verlet, guard)
    ).toBe("numerical-error");
    expect(
      materializeCandidateStateRejection(state.bodyIds, guard)
    ).toMatchObject({
      kind: "numerical-error",
      buffer: "candidate-velocities",
      vectorIndex: 0,
      bodyIndex: 0,
      axis: "x",
    });
  });

  it("identifies a non-finite half-step velocity before geometry", () => {
    const state = createState([-1e6, 0, 0, 1e6, 0, 0]);
    const verlet = createVelocityVerletWorkspace(2);
    const guard = createCandidateStateGuardWorkspace(2);
    setCandidate(verlet, [-1e6, 0, 0, 1e6, 0, 0]);
    verlet.halfStepVelocitiesMps[5] = Number.NaN;

    expect(
      inspectVelocityVerletDriftCandidate(
        state,
        1,
        PERMISSIVE_THRESHOLDS,
        verlet,
        guard
      )
    ).toBe("numerical-error");
    expect(
      materializeCandidateStateRejection(state.bodyIds, guard)
    ).toMatchObject({
      kind: "numerical-error",
      buffer: "half-step-velocities",
      vectorIndex: 5,
      bodyIndex: 1,
      axis: "z",
    });
  });

  it("identifies a non-finite candidate acceleration before domain checks", () => {
    const state = createState([-1e6, 0, 0, 1e6, 0, 0]);
    const verlet = createVelocityVerletWorkspace(2);
    const guard = createCandidateStateGuardWorkspace(2);
    setCandidate(verlet, [-1e6, 0, 0, 1e6, 0, 0]);
    verlet.candidateAccelerationsMps2[2] =
      Number.POSITIVE_INFINITY;

    expect(
      inspectCompletedVelocityVerletCandidate(state, verlet, guard)
    ).toBe("numerical-error");
    expect(
      materializeCandidateStateRejection(state.bodyIds, guard)
    ).toMatchObject({
      kind: "numerical-error",
      buffer: "candidate-accelerations",
      vectorIndex: 2,
      bodyIndex: 0,
      axis: "z",
    });
  });
});

describe("candidate-state rejection materialization", () => {
  it("materializes a finite hard-domain report with its responsible pair", () => {
    const state = createState([-1e12, 0, 0, 1e12, 0, 0], {
      physicalRadiiM: [1, 1],
    });
    const verlet = createVelocityVerletWorkspace(2);
    const guard = createCandidateStateGuardWorkspace(2);
    setCandidate(
      verlet,
      [-1e12, 0, 0, 1e12, 0, 0],
      [
        -0.05 * SPEED_OF_LIGHT_MPS,
        0,
        0,
        0.05 * SPEED_OF_LIGHT_MPS,
        0,
        0,
      ]
    );

    expect(
      inspectVelocityVerletDriftCandidate(
        state,
        1,
        PERMISSIVE_THRESHOLDS,
        verlet,
        guard
      )
    ).toBeNull();
    expect(
      inspectCompletedVelocityVerletCandidate(state, verlet, guard)
    ).toBe("newtonian-domain-violation");

    const rejection = materializeCandidateStateRejection(
      state.bodyIds,
      guard
    );
    expect(rejection?.kind).toBe("newtonian-domain-violation");
    if (rejection?.kind === "newtonian-domain-violation") {
      expect(rejection.violation.metric).toBe("beta");
      expect(rejection.violation.value).toBeCloseTo(0.1, 14);
      expect(rejection.violation.limit).toBe(0.1);
      expect(rejection.violation.velocityFrame).toBe("relative");
      expect(rejection.violation.responsibility).toEqual({
        kind: "pair",
        firstBodyId: "body-0",
        secondBodyId: "body-1",
      });
      expect(rejection.report.beta.responsible).toEqual({
        kind: "pair",
        firstBodyId: "body-0",
        secondBodyId: "body-1",
        frame: "relative",
      });
    }
  });

  it("clears a previous rejection when the reusable workspace accepts", () => {
    const state = createState([-1e12, 0, 0, 1e12, 0, 0]);
    const verlet = createVelocityVerletWorkspace(2);
    const guard = createCandidateStateGuardWorkspace(2);
    setCandidate(verlet, [
      Number.NaN, 0, 0,
      1e12, 0, 0,
    ]);

    expect(
      inspectVelocityVerletDriftCandidate(
        state,
        1,
        PERMISSIVE_THRESHOLDS,
        verlet,
        guard
      )
    ).toBe("numerical-error");

    setCandidate(verlet, [-1e12, 0, 0, 1e12, 0, 0]);
    expect(
      inspectVelocityVerletDriftCandidate(
        state,
        1,
        PERMISSIVE_THRESHOLDS,
        verlet,
        guard
      )
    ).toBeNull();
    expect(
      inspectCompletedVelocityVerletCandidate(state, verlet, guard)
    ).toBeNull();
    expect(
      materializeCandidateStateRejection(state.bodyIds, guard)
    ).toBeNull();
  });

  it("keeps chi-pair as a distinct hard-domain cause", () => {
    const gravitationalLengthPerKg =
      GRAVITATIONAL_CONSTANT_M3_KG_S2 /
      (SPEED_OF_LIGHT_MPS * SPEED_OF_LIGHT_MPS);
    const massKg = 1e30;
    const separationM =
      (gravitationalLengthPerKg * 2 * massKg) / 0.02;
    const state = createState(
      [0, 0, 0, separationM, 0, 0],
      {
        massesKg: [massKg, massKg],
        physicalRadiiM: [0, 0],
      }
    );
    const verlet = createVelocityVerletWorkspace(2);
    const guard = createCandidateStateGuardWorkspace(2);
    setCandidate(verlet, [0, 0, 0, separationM, 0, 0]);

    expect(
      inspectCompletedVelocityVerletCandidate(state, verlet, guard)
    ).toBe("newtonian-domain-violation");
    const rejection = materializeCandidateStateRejection(
      state.bodyIds,
      guard
    );

    expect(rejection?.kind).toBe("newtonian-domain-violation");
    if (rejection?.kind === "newtonian-domain-violation") {
      expect(rejection.violation).toMatchObject({
        metric: "chi-pair",
        limit: 0.01,
        responsibility: {
          kind: "pair",
          firstBodyId: "body-0",
          secondBodyId: "body-1",
        },
      });
      expect(rejection.report.chiPair?.value).toBeCloseTo(0.02, 14);
      expect(rejection.report.psi.value).toBeCloseTo(0.01, 14);
      expect(rejection.report.psi.level).toBe("hard-error");
    }
  });

  it("selects chi-self directly when self compactness is the terminal cause", () => {
    const targetChiSelf = 0.02;
    const massKg =
      (targetChiSelf *
        SPEED_OF_LIGHT_MPS *
        SPEED_OF_LIGHT_MPS) /
      GRAVITATIONAL_CONSTANT_M3_KG_S2;
    const state = createState([0, 0, 0], {
      massesKg: [massKg],
      physicalRadiiM: [1],
    });
    const verlet = createVelocityVerletWorkspace(1);
    const guard = createCandidateStateGuardWorkspace(1);
    setCandidate(verlet, [0, 0, 0]);

    expect(
      inspectCompletedVelocityVerletCandidate(state, verlet, guard)
    ).toBe("newtonian-domain-violation");
    const rejection = materializeCandidateStateRejection(
      state.bodyIds,
      guard
    );

    expect(rejection?.kind).toBe("newtonian-domain-violation");
    if (rejection?.kind === "newtonian-domain-violation") {
      expect(rejection.violation).toMatchObject({
        metric: "chi-self",
        limit: 0.01,
        responsibility: {
          kind: "body",
          bodyId: "body-0",
        },
      });
      expect(rejection.report.beta.value).toBe(0);
      expect(rejection.report.chiPair).toBeNull();
      expect(rejection.report.chiSelf?.value).toBeCloseTo(
        targetChiSelf,
        14
      );
      expect(rejection.report.psi.value).toBe(0);
    }
  });

  it("reports cumulative psi without hiding lower pair compactness", () => {
    const gravitationalLengthPerKg =
      GRAVITATIONAL_CONSTANT_M3_KG_S2 /
      (SPEED_OF_LIGHT_MPS * SPEED_OF_LIGHT_MPS);
    const massKg = 1e30;
    const separationM =
      (gravitationalLengthPerKg * massKg) / 0.004;
    const state = createState(
      [
        0, 0, 0,
        separationM, 0, 0,
        0, separationM, 0,
        0, 0, separationM,
      ],
      {
        massesKg: [massKg, massKg, massKg, massKg],
      }
    );
    const verlet = createVelocityVerletWorkspace(4);
    const guard = createCandidateStateGuardWorkspace(4);
    setCandidate(verlet, Array.from(state.positionsM));

    expect(
      inspectCompletedVelocityVerletCandidate(state, verlet, guard)
    ).toBe("newtonian-domain-violation");
    const rejection = materializeCandidateStateRejection(
      state.bodyIds,
      guard
    );

    expect(rejection?.kind).toBe("newtonian-domain-violation");
    if (rejection?.kind === "newtonian-domain-violation") {
      expect(rejection.violation).toMatchObject({
        metric: "psi",
        responsibility: { kind: "body", bodyId: "body-0" },
      });
      expect(rejection.report.psi.value).toBeCloseTo(0.012, 14);
      expect(rejection.report.chiPair?.value).toBeCloseTo(0.008, 14);
    }
  });
});
