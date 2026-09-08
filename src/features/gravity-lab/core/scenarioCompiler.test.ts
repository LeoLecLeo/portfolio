import { describe, expect, it } from "vitest";

import {
  DISTANCE_DRAFT_UNIT_CONVERTER,
  MASS_DRAFT_UNIT_CONVERTER,
  SPEED_DRAFT_UNIT_CONVERTER,
  TIME_DRAFT_UNIT_CONVERTER,
  appliedScenarioToDraft,
  appliedScenarioToSimulationConfig,
  changeDraftNumberUnit,
  createDraftNumber,
  createDraftNumberFromSi,
  isAppliedScenario,
  tryCreateDraftNumberFromSi,
  updateDraftNumberRawText,
  type BodyDraft,
  type ScenarioDraft,
} from "./scenario";
import {
  DEFAULT_RUNTIME_ENCOUNTER_THRESHOLDS,
  compileScenarioDraft,
} from "./scenarioCompiler";
import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_PERIOD_SECONDS,
  INCLINED_BINARY_TIME_STEP_SECONDS,
} from "../presets/inclinedBinary";
import {
  EARTH_MASS_KG,
  EARTH_RADIUS_M,
  JUPITER_MASS_KG,
  JUPITER_RADIUS_M,
  SPEED_OF_LIGHT_MPS,
  type DistanceUnit,
  type MassUnit,
  type SpeedUnit,
  type TimeUnit,
} from "./units";

function mass(rawText: string, unit: MassUnit = "kg") {
  return createDraftNumber(rawText, unit, MASS_DRAFT_UNIT_CONVERTER);
}

function distance(rawText: string, unit: DistanceUnit = "m") {
  return createDraftNumber(rawText, unit, DISTANCE_DRAFT_UNIT_CONVERTER);
}

function speed(rawText: string, unit: SpeedUnit = "m/s") {
  return createDraftNumber(rawText, unit, SPEED_DRAFT_UNIT_CONVERTER);
}

function time(rawText: string, unit: TimeUnit = "s") {
  return createDraftNumber(rawText, unit, TIME_DRAFT_UNIT_CONVERTER);
}

function body(
  id: string,
  positionX: ReturnType<typeof distance>,
  overrides: Partial<BodyDraft> = {}
): BodyDraft {
  return {
    id,
    name: id,
    color: "#67e8f9",
    fixed: false,
    mass: mass("1e20"),
    physicalRadius: distance("1e6"),
    initialPosition: {
      x: positionX,
      y: distance("0"),
      z: distance("0"),
    },
    initialVelocity: {
      x: speed("0"),
      y: speed("0"),
      z: speed("0"),
    },
    ...overrides,
  };
}

function dynamicDraft(
  overrides: Partial<ScenarioDraft> = {}
): ScenarioDraft {
  return {
    modelId: "newtonian",
    bodies: [body("left", distance("0")), body("right", distance("1e9"))],
    precisionProfile: "balanced",
    maximumTimeStep: null,
    ...overrides,
  };
}

function deepFreezeForTest<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(
      value as Record<string, unknown>
    )) {
      deepFreezeForTest(child);
    }
    Object.freeze(value);
  }

  return value;
}

describe("scenario draft helpers", () => {
  it("exposes immutable unit-conversion policies", () => {
    expect(Object.isFrozen(MASS_DRAFT_UNIT_CONVERTER)).toBe(true);
    expect(Object.isFrozen(DISTANCE_DRAFT_UNIT_CONVERTER)).toBe(true);
    expect(Object.isFrozen(SPEED_DRAFT_UNIT_CONVERTER)).toBe(true);
    expect(Object.isFrozen(TIME_DRAFT_UNIT_CONVERTER)).toBe(true);
    expect(
      Object.isFrozen(DEFAULT_RUNTIME_ENCOUNTER_THRESHOLDS)
    ).toBe(true);
  });

  it("restarts display-unit changes from the last valid SI value", () => {
    const originalSi = 1_234_567.8901234567;
    const initial = createDraftNumberFromSi(
      originalSi,
      "s",
      TIME_DRAFT_UNIT_CONVERTER
    );
    const hours = changeDraftNumberUnit(
      initial,
      "hour",
      TIME_DRAFT_UNIT_CONVERTER
    );

    expect(hours.changed).toBe(true);
    if (!hours.changed) {
      throw new Error("Expected the unit change to succeed.");
    }

    const days = changeDraftNumberUnit(
      hours.field,
      "day",
      TIME_DRAFT_UNIT_CONVERTER
    );
    expect(days.changed).toBe(true);
    if (days.changed) {
      expect(days.field.siValue).toBe(originalSi);
      expect(days.field.lastValidSiValue).toBe(originalSi);
      expect(days.field.provenance.kind).toBe("canonical-si");
    }
  });

  it("keeps the last valid SI value but never uses it to rescue invalid raw text", () => {
    const valid = mass("5");
    const invalid = updateDraftNumberRawText(
      valid,
      "5 kg",
      MASS_DRAFT_UNIT_CONVERTER
    );

    expect(invalid.siValue).toBeNull();
    expect(invalid.lastValidSiValue).toBe(5);
    const unitChange = changeDraftNumberUnit(
      invalid,
      "solar-mass",
      MASS_DRAFT_UNIT_CONVERTER
    );
    expect(unitChange).toMatchObject({
      changed: false,
      field: invalid,
      reason: "current-value-invalid",
      issue: null,
    });
    expect(unitChange.field).toBe(invalid);
    expect(unitChange.field.rawText).toBe("5 kg");
    expect(unitChange.field.errors).toEqual(invalid.errors);

    const result = compileScenarioDraft(
      dynamicDraft({
        bodies: [
          body("left", distance("0"), { mass: invalid }),
          body("right", distance("1e9")),
        ],
      })
    );

    expect(result.ok).toBe(false);
    expect(result.report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "parse.invalid-syntax",
          path: "/bodies/0/mass",
        }),
      ])
    );
  });

  it("returns a structured failure when display-unit conversion underflows", () => {
    const results = [
      tryCreateDraftNumberFromSi(
        Number.MIN_VALUE,
        "solar-mass",
        MASS_DRAFT_UNIT_CONVERTER
      ),
      tryCreateDraftNumberFromSi(
        Number.MIN_VALUE,
        "au",
        DISTANCE_DRAFT_UNIT_CONVERTER
      ),
      tryCreateDraftNumberFromSi(
        Number.MIN_VALUE,
        "km/s",
        SPEED_DRAFT_UNIT_CONVERTER
      ),
      tryCreateDraftNumberFromSi(
        Number.MIN_VALUE,
        "julian-year",
        TIME_DRAFT_UNIT_CONVERTER
      ),
    ];

    for (const result of results) {
      expect(result).toMatchObject({
        ok: false,
        issue: { code: "parse.unit-conversion-underflow" },
        siValue: Number.MIN_VALUE,
      });
    }
  });

  it("rejects a non-zero parsed value that underflows while converting to SI", () => {
    const result = createDraftNumber("0.5", "tiny", {
      toSi: (value) => value * Number.MIN_VALUE,
      fromSi: (value) => value / Number.MIN_VALUE,
    });

    expect(result.siValue).toBeNull();
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "parse.unit-conversion-underflow",
      }),
    ]);
  });
});

describe("scenario draft compilation", () => {
  it("parses mixed display units into an immutable SI scenario", () => {
    const first = body("earth", distance("0"), {
      mass: mass("1", "earth-mass"),
      physicalRadius: distance("1", "earth-radius"),
      initialVelocity: {
        x: speed("1,5", "km/s"),
        y: speed("0"),
        z: speed("0"),
      },
    });
    const second = body("jupiter", distance("0.01", "au"), {
      mass: mass("1", "jupiter-mass"),
      physicalRadius: distance("1", "jupiter-radius"),
    });
    const draft: ScenarioDraft = {
      modelId: "newtonian",
      bodies: [first, second],
      precisionProfile: "balanced",
      maximumTimeStep: time("1", "hour"),
    };
    const result = compileScenarioDraft(draft);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(JSON.stringify(result.report.errors));
    }

    expect(result.scenario.physics.bodies[0].massKg).toBe(EARTH_MASS_KG);
    expect(result.scenario.physics.bodies[1].massKg).toBe(
      JUPITER_MASS_KG
    );
    expect(result.scenario.physics.bodies[0].physicalRadiusM).toBe(
      EARTH_RADIUS_M
    );
    expect(result.scenario.physics.bodies[1].physicalRadiusM).toBe(
      JUPITER_RADIUS_M
    );
    expect(
      result.scenario.physics.bodies[0].initialVelocityMps.x
    ).toBe(1_500);
    expect(result.scenario.numericalPolicy.precisionProfile).toBe(
      "balanced"
    );
    expect(result.scenario.numericalPolicy.qTarget).toBe(0.005);
    expect(result.scenario.kind).toBe(
      "gravity-lab-applied-scenario-v1"
    );
    expect(isAppliedScenario(result.scenario)).toBe(true);
    expect(
      result.scenario.numericalPolicy.timeStepSeconds
    ).toBeLessThanOrEqual(3_600);
    expect(Object.isFrozen(result.scenario)).toBe(true);
    expect(Object.isFrozen(result.scenario.physics.bodies)).toBe(true);
    expect(
      Object.isFrozen(result.scenario.physics.bodies[0].initialPositionM)
    ).toBe(true);
  });

  it("does not freeze provenance objects owned by the source draft", () => {
    const provenance = {
      kind: "canonical-si" as const,
      rawText: "1e20",
      unit: "kg" as const,
      siValue: 1e20,
    };
    const sourceMass = {
      ...mass("1e20"),
      provenance,
    };
    const draft = dynamicDraft({
      bodies: [
        body("left", distance("0"), { mass: sourceMass }),
        body("right", distance("1e9")),
      ],
    });
    const result = compileScenarioDraft(draft);

    expect(result.ok).toBe(true);
    expect(Object.isFrozen(provenance)).toBe(false);
    expect(
      result.report.analyzedDraft.bodies[0].mass.provenance
    ).not.toBe(provenance);
    expect(
      Object.isFrozen(
        result.report.analyzedDraft.bodies[0].mass.provenance
      )
    ).toBe(true);
  });

  it("does not accept a forged applied-scenario marker", () => {
    const forged = Object.freeze({
      kind: "gravity-lab-applied-scenario-v1",
    });

    expect(isAppliedScenario(forged)).toBe(false);
    expect(() =>
      appliedScenarioToSimulationConfig(
        forged as unknown as Parameters<
          typeof appliedScenarioToSimulationConfig
        >[0]
      )
    ).toThrow(/canonical compiler/);
  });

  it("rejects frozen applied-scenario lookalikes that violate invariants", () => {
    const valid = createInclinedBinaryAppliedScenario();
    const zeroBodies = deepFreezeForTest({
      ...valid,
      physics: { bodies: [] },
    });
    const shallowOnly = Object.freeze({
      ...valid,
      physics: { bodies: valid.physics.bodies },
    });
    const incompleteValidity = deepFreezeForTest({
      ...valid,
      initialValidity: {
        beta: valid.initialValidity.beta,
      },
    });
    const unvalidatedLookalike = deepFreezeForTest({
      ...valid,
      physics: {
        bodies: valid.physics.bodies.map((source, index) =>
          index === 0 ? { ...source, massKg: -1 } : source
        ),
      },
    });

    expect(isAppliedScenario(zeroBodies)).toBe(false);
    expect(isAppliedScenario(shallowOnly)).toBe(false);
    expect(isAppliedScenario(incompleteValidity)).toBe(false);
    expect(isAppliedScenario(unvalidatedLookalike)).toBe(false);
  });

  it("round-trips any valid applied scenario through an explicit unit policy", () => {
    const initial = compileScenarioDraft({
      modelId: "newtonian",
      bodies: [
        body("earth", distance("0"), {
          name: "Earth",
          mass: mass("1", "earth-mass"),
          physicalRadius: distance("1", "earth-radius"),
          initialVelocity: {
            x: speed("1.25", "km/s"),
            y: speed("-0.75", "km/s"),
            z: speed("0.125", "km/s"),
          },
        }),
        body("jupiter", distance("0.01", "au"), {
          name: "Jupiter",
          mass: mass("0.25", "jupiter-mass"),
          physicalRadius: distance("0.5", "jupiter-radius"),
          initialVelocity: {
            x: speed("-0.4", "km/s"),
            y: speed("2.5", "km/s"),
            z: speed("-0.2", "km/s"),
          },
        }),
        body("probe", distance("-0.02", "au"), {
          name: "Probe",
          mass: mass("0.125", "earth-mass"),
          physicalRadius: distance("10", "km"),
          initialVelocity: {
            x: speed("0.1", "km/s"),
            y: speed("-3.2", "km/s"),
            z: speed("0.8", "km/s"),
          },
        }),
      ],
      precisionProfile: "precise",
      maximumTimeStep: time("0.5", "hour"),
    });

    expect(initial.ok).toBe(true);
    if (!initial.ok) {
      throw new Error(JSON.stringify(initial.report.errors));
    }

    const reconstructed = appliedScenarioToDraft(initial.scenario, {
      mass: "earth-mass",
      physicalRadius: "earth-radius",
      position: "au",
      velocity: "km/s",
      time: "day",
    });
    const recompiled = compileScenarioDraft(reconstructed);

    expect(reconstructed.bodies.map(({ id }) => id)).toEqual([
      "earth",
      "jupiter",
      "probe",
    ]);
    expect(reconstructed.bodies).not.toBe(
      initial.scenario.physics.bodies
    );
    expect(reconstructed.bodies[0]).not.toBe(
      initial.scenario.physics.bodies[0]
    );
    expect(reconstructed.bodies[0].initialPosition).not.toBe(
      initial.scenario.physics.bodies[0].initialPositionM
    );
    expect(reconstructed.bodies[0].mass.unit).toBe("earth-mass");
    expect(reconstructed.bodies[0].initialPosition.x.unit).toBe("au");
    expect(reconstructed.bodies[0].initialVelocity.x.unit).toBe(
      "km/s"
    );
    expect(reconstructed.maximumTimeStep?.unit).toBe("day");
    expect(recompiled.ok).toBe(true);
    if (recompiled.ok) {
      expect(recompiled.scenario.physics).toEqual(
        initial.scenario.physics
      );
      expect(recompiled.scenario.numericalPolicy).toEqual(
        initial.scenario.numericalPolicy
      );
      expect(recompiled.scenario.initialValidity).toEqual(
        initial.scenario.initialValidity
      );
    }

    (
      reconstructed.bodies[0].mass as unknown as {
        rawText: string;
      }
    ).rawText = "999";
    expect(initial.scenario.physics.bodies[0].massKg).toBe(
      EARTH_MASS_KG
    );
  });

  it("does not clamp a value above the product limit", () => {
    const result = compileScenarioDraft(
      dynamicDraft({
        bodies: [
          body("left", distance("0"), { mass: mass("1e34") }),
          body("right", distance("1e9")),
        ],
      })
    );

    expect(result.ok).toBe(false);
    expect(result.report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "body.mass-limit",
          actualValue: 1e34,
        }),
      ])
    );
    expect(result.report.analyzedDraft.bodies[0].mass.siValue).toBe(1e34);
    expect(
      result.report.analyzedDraft.bodies[0].mass.errors
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "body.mass-limit" }),
      ])
    );
  });

  it("reparses raw text instead of trusting stale cached parsing state", () => {
    const validMass = mass("5");
    const staleMass = {
      ...validMass,
      rawText: "5 trailing",
    };
    const result = compileScenarioDraft(
      dynamicDraft({
        bodies: [
          body("left", distance("0"), { mass: staleMass }),
          body("right", distance("1e9")),
        ],
      })
    );

    expect(result.ok).toBe(false);
    expect(result.report.errors[0]).toEqual(
      expect.objectContaining({ code: "parse.invalid-syntax" })
    );
  });

  it("uses an explicit maximum for an unconstrained one-body scenario", () => {
    const sourceSi = 7_654.321012345678;
    const maximum = createDraftNumberFromSi(
      sourceSi,
      "hour",
      TIME_DRAFT_UNIT_CONVERTER
    );
    const withMaximum = compileScenarioDraft({
      modelId: "newtonian",
      bodies: [body("isolated", distance("0"))],
      precisionProfile: "precise",
      maximumTimeStep: maximum,
    });

    expect(withMaximum.ok).toBe(true);
    if (withMaximum.ok) {
      expect(
        withMaximum.scenario.numericalPolicy.timeStepRecommendation.kind
      ).toBe("unconstrained");
      expect(withMaximum.scenario.numericalPolicy.timeStepSeconds).toBe(
        sourceSi
      );
    }

    const withoutMaximum = compileScenarioDraft({
      modelId: "newtonian",
      bodies: [body("isolated", distance("0"))],
      precisionProfile: "precise",
      maximumTimeStep: null,
    });
    expect(withoutMaximum.ok).toBe(false);
    expect(withoutMaximum.report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "step.unconstrained-without-maximum",
        }),
      ])
    );
  });

  it("requires the same explicit maximum for an entirely fixed system", () => {
    const fixedBodies = [
      body("fixed-left", distance("0"), { fixed: true }),
      body("fixed-right", distance("1e9"), { fixed: true }),
    ];
    const withMaximum = compileScenarioDraft({
      modelId: "newtonian",
      bodies: fixedBodies,
      precisionProfile: "fast",
      maximumTimeStep: time("2", "hour"),
    });

    expect(withMaximum.ok).toBe(true);
    if (withMaximum.ok) {
      expect(
        withMaximum.scenario.numericalPolicy.timeStepRecommendation.kind
      ).toBe("unconstrained");
      expect(withMaximum.scenario.numericalPolicy.timeStepSeconds).toBe(
        7_200
      );
      expect(withMaximum.report.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "domain.external-constraint",
          }),
        ])
      );
    }

    const withoutMaximum = compileScenarioDraft({
      modelId: "newtonian",
      bodies: fixedBodies,
      precisionProfile: "fast",
      maximumTimeStep: null,
    });
    expect(withoutMaximum.ok).toBe(false);
    expect(withoutMaximum.report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "step.unconstrained-without-maximum",
        }),
      ])
    );
  });

  it("takes the smaller of the profile recommendation and explicit maximum", () => {
    const uncapped = compileScenarioDraft(dynamicDraft());
    expect(uncapped.ok).toBe(true);
    if (!uncapped.ok) {
      throw new Error("Expected a bounded recommendation.");
    }

    const capSeconds =
      uncapped.scenario.numericalPolicy.timeStepSeconds / 2;
    const capped = compileScenarioDraft(
      dynamicDraft({
        maximumTimeStep: createDraftNumberFromSi(
          capSeconds,
          "day",
          TIME_DRAFT_UNIT_CONVERTER
        ),
      })
    );
    expect(capped.ok).toBe(true);
    if (capped.ok) {
      expect(capped.scenario.numericalPolicy.timeStepSeconds).toBe(
        capSeconds
      );
      expect(
        capped.scenario.numericalPolicy.recommendedTimeStepSeconds
      ).toBe(
        uncapped.scenario.numericalPolicy.recommendedTimeStepSeconds
      );
    }
  });

  it("reports an excessive budget without enlarging the fixed step", () => {
    const result = compileScenarioDraft(dynamicDraft(), {
      budget: {
        simulatedSecondsPerRealSecond: 1e12,
        maxSubStepsPerTick: 1,
        maxFrameDeltaSeconds: 0.25,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.scenario.numericalPolicy.budgetAssessment?.exceedsBudget
      ).toBe(true);
      expect(result.report.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "step.budget-exceeded" }),
        ])
      );
      expect(result.scenario.numericalPolicy.timeStepSeconds).toBe(
        result.scenario.numericalPolicy.recommendedTimeStepSeconds
      );
    }
  });

  it("rejects an initial hard Newtonian-domain violation", () => {
    const result = compileScenarioDraft(
      dynamicDraft({
        bodies: [
          body("left", distance("0"), {
            initialVelocity: {
              x: speed(String(-0.06 * SPEED_OF_LIGHT_MPS)),
              y: speed("0"),
              z: speed("0"),
            },
          }),
          body("right", distance("1e9"), {
            initialVelocity: {
              x: speed(String(0.06 * SPEED_OF_LIGHT_MPS)),
              y: speed("0"),
              z: speed("0"),
            },
          }),
        ],
      })
    );

    expect(result.ok).toBe(false);
    expect(result.report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "domain.beta.limit",
          subject: expect.objectContaining({
            kind: "pair",
            firstBodyId: "left",
            secondBodyId: "right",
          }),
        }),
      ])
    );
  });

  it("keeps the applied scenario independent from draft and engine copies", () => {
    const draft = dynamicDraft();
    const result = compileScenarioDraft(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected a compiled scenario.");
    }

    const initialMass = result.scenario.physics.bodies[0].massKg;
    (
      draft.bodies[0].mass as unknown as {
        rawText: string;
      }
    ).rawText = "9e32";
    expect(result.scenario.physics.bodies[0].massKg).toBe(initialMass);

    const engineConfig = appliedScenarioToSimulationConfig(result.scenario);
    (
      engineConfig.bodies[0] as unknown as {
        massKg: number;
      }
    ).massKg = 1;
    expect(result.scenario.physics.bodies[0].massKg).toBe(initialMass);
  });

  it("compiles fresh inclined-binary scenarios with tested and recommended steps separated", () => {
    const budget = {
      simulatedSecondsPerRealSecond:
        INCLINED_BINARY_PERIOD_SECONDS / 24,
      maxSubStepsPerTick: 32,
      maxFrameDeltaSeconds: 0.25,
    };
    const first = createInclinedBinaryAppliedScenario(budget);
    const second = createInclinedBinaryAppliedScenario(budget);

    expect(first).not.toBe(second);
    expect(first.physics.bodies).not.toBe(second.physics.bodies);
    expect(first.numericalPolicy).toMatchObject({
      precisionProfile: "balanced",
      qTarget: 0.005,
      timeStepSeconds: INCLINED_BINARY_TIME_STEP_SECONDS,
      budgetAssessment: {
        requiredSubStepsAtMaximumFrame: 22,
        exceedsBudget: false,
      },
    });
    expect(
      first.numericalPolicy.recommendedTimeStepSeconds
    ).toBeCloseTo(1_588.2751266912621, 9);
    expect(first.initialValidity.beta.value).toBeCloseTo(
      3.141803176605156e-4,
      15
    );
    expect(first.initialValidity.chiPair?.value).toBeCloseTo(
      9.87092720052625e-8,
      15
    );
    expect(first.initialValidity.chiSelf?.value).toBeCloseTo(
      2.122566754396204e-6,
      15
    );
    expect(first.initialValidity.psi.value).toBeCloseTo(
      4.935463600263125e-8,
      15
    );
    expect(first.initialValidity.overallLevel).toBe("recommended");
  });
});
