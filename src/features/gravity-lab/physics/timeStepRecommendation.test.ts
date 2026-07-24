import { describe, expect, it } from "vitest";

import type { CelestialBodyDefinition } from "../core/types";
import {
  GRAVITATIONAL_CONSTANT_M3_KG_S2,
  SOLAR_MASS_KG,
} from "../core/units";
import { vector3 } from "../core/vector3";
import {
  createInclinedBinaryConfig,
  INCLINED_BINARY_PERIOD_SECONDS,
  INCLINED_BINARY_TIME_STEP_SECONDS,
} from "../presets/inclinedBinary";
import {
  PRECISION_PROFILE_TARGETS,
  assessTimeStepBudget,
  recommendTimeStep,
  type PrecisionProfile,
} from "./timeStepRecommendation";

function body(
  id: string,
  positionX: number,
  velocityX = 0,
  options: Readonly<{
    massKg?: number;
    physicalRadiusM?: number;
    fixed?: boolean;
  }> = {}
): CelestialBodyDefinition {
  return {
    id,
    name: id,
    massKg: options.massKg ?? 1,
    physicalRadiusM: options.physicalRadiusM ?? 0,
    fixed: options.fixed ?? false,
    initialPositionM: vector3(positionX, 0, 0),
    initialVelocityMps: vector3(velocityX, 0, 0),
  };
}

describe("fixed time-step recommendation", () => {
  it("keeps the three approved profile targets distinct from runtime guards", () => {
    expect(PRECISION_PROFILE_TARGETS).toEqual({
      fast: 0.01,
      balanced: 0.005,
      precise: 0.0025,
    });

    const bodies = [
      body("left", 0, 0),
      body("right", 10, -1),
    ];
    const fast = recommendTimeStep(bodies, "fast");
    const balanced = recommendTimeStep(bodies, "balanced");
    const precise = recommendTimeStep(bodies, "precise");

    expect(fast.kind).toBe("bounded");
    expect(balanced.kind).toBe("bounded");
    expect(precise.kind).toBe("bounded");

    if (
      fast.kind === "bounded" &&
      balanced.kind === "bounded" &&
      precise.kind === "bounded"
    ) {
      expect(fast.recommendedTimeStepSeconds).toBeCloseTo(
        2 * balanced.recommendedTimeStepSeconds,
        15
      );
      expect(fast.recommendedTimeStepSeconds).toBeCloseTo(
        4 * precise.recommendedTimeStepSeconds,
        15
      );
    }
  });

  it("reports tau_v, tau_g and the cautious approaching-contact estimate", () => {
    const bodies = [
      body("left", 0, 0, {
        physicalRadiusM: 4,
      }),
      body("right", 10, -1, {
        physicalRadiusM: 4,
      }),
    ];
    const recommendation = recommendTimeStep(bodies, "balanced");
    const expectedDynamicalSeconds =
      10 *
      Math.sqrt(
        10 / (GRAVITATIONAL_CONSTANT_M3_KG_S2 * 2)
      );

    expect(recommendation.kind).toBe("bounded");
    expect(recommendation.relativeTraversal).toEqual({
      kind: "relative-traversal",
      seconds: 10,
      firstBodyId: "left",
      secondBodyId: "right",
    });
    expect(
      recommendation.gravitationalDynamical?.seconds
    ).toBeCloseTo(expectedDynamicalSeconds, 10);
    expect(recommendation.timeToContact).toEqual({
      kind: "time-to-contact",
      seconds: 2,
      firstBodyId: "left",
      secondBodyId: "right",
    });

    if (recommendation.kind === "bounded") {
      expect(recommendation.limiter).toEqual(
        recommendation.timeToContact
      );
      expect(recommendation.recommendedTimeStepSeconds).toBe(
        PRECISION_PROFILE_TARGETS.balanced * 2
      );
    }
  });

  it("uses tau_g when relative and contact speeds are zero", () => {
    const separationM = 1e9;
    const bodies = [
      body("a", 0, 0, { massKg: SOLAR_MASS_KG }),
      body("b", separationM, 0, {
        massKg: SOLAR_MASS_KG,
      }),
    ];
    const recommendation = recommendTimeStep(bodies, "fast");
    const expectedTauG =
      separationM *
      Math.sqrt(
        separationM /
          (GRAVITATIONAL_CONSTANT_M3_KG_S2 *
            2 *
            SOLAR_MASS_KG)
      );

    expect(recommendation.relativeTraversal).toBeNull();
    expect(recommendation.timeToContact).toBeNull();
    expect(
      recommendation.gravitationalDynamical?.seconds
    ).toBeCloseTo(expectedTauG, 12);

    if (recommendation.kind === "bounded") {
      expect(recommendation.limiter.kind).toBe(
        "gravitational-dynamical"
      );
      expect(recommendation.recommendedTimeStepSeconds).toBeCloseTo(
        PRECISION_PROFILE_TARGETS.fast * expectedTauG,
        12
      );
    }
  });

  it("does not invent a timescale for one body or a fixed-fixed system", () => {
    const isolated = recommendTimeStep(
      [body("isolated", 0, 100)],
      "balanced"
    );
    const fixedPair = recommendTimeStep(
      [
        body("fixed-a", 0, 0, { fixed: true }),
        body("fixed-b", 10, 0, { fixed: true }),
      ],
      "precise"
    );

    for (const recommendation of [isolated, fixedPair]) {
      expect(recommendation).toMatchObject({
        kind: "unconstrained",
        recommendedTimeStepSeconds: null,
        limiter: null,
        relativeTraversal: null,
        gravitationalDynamical: null,
        timeToContact: null,
      });
    }
  });

  it("includes a fixed-mobile pair in the recommendation", () => {
    const recommendation = recommendTimeStep(
      [
        body("anchor", 0, 0, {
          fixed: true,
          massKg: SOLAR_MASS_KG,
        }),
        body("mobile", 1e9, 0, { massKg: 1 }),
      ],
      "balanced"
    );

    expect(recommendation.kind).toBe("bounded");
    expect(
      recommendation.gravitationalDynamical
    ).toMatchObject({
      kind: "gravitational-dynamical",
      firstBodyId: "anchor",
      secondBodyId: "mobile",
    });
  });
});

describe("inclined binary time-step policy", () => {
  it.each([
    ["fast", 3_176.5502533825243],
    ["balanced", 1_588.2751266912621],
    ["precise", 794.1375633456311],
  ] as const)(
    "matches the %s profile reference recommendation",
    (profile, expectedSeconds) => {
      const recommendation = recommendTimeStep(
        createInclinedBinaryConfig().bodies,
        profile
      );

      expect(recommendation.kind).toBe("bounded");
      expect(recommendation.recommendedTimeStepSeconds).toBeCloseTo(
        expectedSeconds,
        9
      );
      expect(recommendation.relativeTraversal?.seconds).toBeCloseTo(
        317_655.0253382524,
        8
      );
      expect(
        recommendation.gravitationalDynamical?.seconds
      ).toBeCloseTo(317_655.0253382524, 8);
      expect(recommendation.timeToContact).toBeNull();

      if (recommendation.kind === "bounded") {
        expect(recommendation.limiter).toMatchObject({
          firstBodyId: "binary-a",
          secondBodyId: "binary-b",
        });
      }
    }
  );

  it("fits all profiles and the existing tested step in the hard budget", () => {
    const config = createInclinedBinaryConfig();
    const budget = {
      simulatedSecondsPerRealSecond:
        INCLINED_BINARY_PERIOD_SECONDS / 24,
      maxSubStepsPerTick: 32,
      maxFrameDeltaSeconds: 0.25,
    };
    const expectedSubSteps: Readonly<
      Record<PrecisionProfile, number>
    > = {
      fast: 7,
      balanced: 14,
      precise: 27,
    };

    for (const profile of [
      "fast",
      "balanced",
      "precise",
    ] as const) {
      const recommendation = recommendTimeStep(
        config.bodies,
        profile
      );

      if (recommendation.kind !== "bounded") {
        throw new Error("The inclined binary must have a bounded step.");
      }

      expect(
        assessTimeStepBudget(
          recommendation.recommendedTimeStepSeconds,
          budget
        )
      ).toEqual({
        requiredSubStepsAtMaximumFrame: expectedSubSteps[profile],
        exceedsBudget: false,
      });
    }

    expect(
      assessTimeStepBudget(INCLINED_BINARY_TIME_STEP_SECONDS, budget)
    ).toEqual({
      requiredSubStepsAtMaximumFrame: 22,
      exceedsBudget: false,
    });
  });
});

describe("time-step budget assessment", () => {
  it("exposes immutable precision-profile targets", () => {
    expect(Object.isFrozen(PRECISION_PROFILE_TARGETS)).toBe(true);
  });

  it("counts the possible residual step at an exact integer boundary", () => {
    expect(
      assessTimeStepBudget(1, {
        simulatedSecondsPerRealSecond: 32,
        maxSubStepsPerTick: 32,
        maxFrameDeltaSeconds: 1,
      })
    ).toEqual({
      requiredSubStepsAtMaximumFrame: 33,
      exceedsBudget: true,
    });
  });

  it("does not round a ratio just above the hard budget back down", () => {
    expect(
      assessTimeStepBudget(1, {
        simulatedSecondsPerRealSecond: 32 + 1e-14,
        maxSubStepsPerTick: 32,
        maxFrameDeltaSeconds: 1,
      })
    ).toEqual({
      requiredSubStepsAtMaximumFrame: 33,
      exceedsBudget: true,
    });
  });

  it("allows for a pre-existing fractional-step accumulator", () => {
    expect(
      assessTimeStepBudget(1e12, {
        simulatedSecondsPerRealSecond: 1,
        maxSubStepsPerTick: 32,
        maxFrameDeltaSeconds: 1e-6,
      })
    ).toEqual({
      requiredSubStepsAtMaximumFrame: 1,
      exceedsBudget: false,
    });
  });

  it("reports excessive cost without changing the scientific step", () => {
    const recommendation = recommendTimeStep(
      [body("a", 0), body("b", 10, -1)],
      "precise"
    );

    if (recommendation.kind !== "bounded") {
      throw new Error("This pair must have a bounded step.");
    }

    const stepBeforeBudgetAssessment =
      recommendation.recommendedTimeStepSeconds;
    const assessment = assessTimeStepBudget(
      stepBeforeBudgetAssessment,
      {
        simulatedSecondsPerRealSecond: 1_000,
        maxSubStepsPerTick: 32,
        maxFrameDeltaSeconds: 0.25,
      }
    );

    expect(assessment.exceedsBudget).toBe(true);
    expect(assessment.requiredSubStepsAtMaximumFrame).toBeGreaterThan(
      32
    );
    expect(recommendation.recommendedTimeStepSeconds).toBe(
      stepBeforeBudgetAssessment
    );
  });

  it("keeps recommendation independent from time-flow speed", () => {
    const bodies = [body("a", 0), body("b", 10, -1)];
    const before = recommendTimeStep(bodies, "balanced");

    assessTimeStepBudget(1, {
      simulatedSecondsPerRealSecond: 1,
      maxSubStepsPerTick: 32,
      maxFrameDeltaSeconds: 0.25,
    });
    assessTimeStepBudget(1, {
      simulatedSecondsPerRealSecond: 1e6,
      maxSubStepsPerTick: 32,
      maxFrameDeltaSeconds: 0.25,
    });

    expect(recommendTimeStep(bodies, "balanced")).toEqual(before);
  });
});
