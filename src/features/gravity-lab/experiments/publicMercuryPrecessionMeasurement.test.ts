import { describe, expect, it } from "vitest";

import { appliedScenarioToDraft } from "../core/scenario";
import { compileScenarioDraft } from "../core/scenarioCompiler";
import { SUN_MERCURY_1PN_PRESET } from "../presets/sunMercury1pn";
import { SynchronizedGravityComparisonEngine } from "../runtime/SynchronizedGravityComparison";
import { EDITOR_DRAFT_UNIT_POLICY } from "../ui/gravityLabReducer";
import {
  PublicMercuryPrecessionTracker,
  arcsecondsPerCenturyToArcsecondsPerOrbit,
  arcsecondsPerOrbitToArcsecondsPerCentury,
  isValidatedSunMercuryScenario,
} from "./publicMercuryPrecessionMeasurement";

describe("public Mercury precession measurement", () => {
  it("withholds a value until five interpolated periapsides per branch", () => {
    const scenario = SUN_MERCURY_1PN_PRESET.createScenario();
    const tracker = new PublicMercuryPrecessionTracker(scenario);
    const comparison = new SynchronizedGravityComparisonEngine(
      scenario,
      (...step) => tracker.observeSynchronizedStep(...step)
    );

    expect(tracker.snapshot()).toMatchObject({
      kind: "collecting",
      minimumEventCount: 5,
      firstPostNewtonianEventCount: 0,
      newtonianEventCount: 0,
    });
    expect(comparison.start()).toBe(true);

    let stepCount = 0;
    while (tracker.snapshot().kind !== "ready" && stepCount < 15_000) {
      expect(comparison.advanceOneStep()).toBe(true);
      stepCount += 1;
    }

    const measurement = tracker.snapshot();
    expect(measurement.kind).toBe("ready");
    if (measurement.kind !== "ready") {
      return;
    }

    expect(measurement.firstPostNewtonianEventCount).toBeGreaterThanOrEqual(5);
    expect(measurement.newtonianEventCount).toBeGreaterThanOrEqual(5);
    expect(measurement.firstPostNewtonian.arcsecondsPerCentury).toBeGreaterThan(
      0
    );
    expect(
      Math.abs(measurement.newtonian.arcsecondsPerCentury)
    ).toBeLessThan(0.1);
    expect(measurement.differential.arcsecondsPerCentury).toBeCloseTo(
      measurement.referenceArcsecondsPerCentury,
      2
    );
    expect(measurement.referenceArcsecondsPerCentury).toBeCloseTo(
      42.98,
      2
    );

    tracker.reset();
    expect(tracker.snapshot()).toMatchObject({
      kind: "collecting",
      firstPostNewtonianEventCount: 0,
      newtonianEventCount: 0,
    });
  });

  it("converts arcseconds per orbit and per century reversibly", () => {
    const perOrbit = 0.103_5;
    const perCentury =
      arcsecondsPerOrbitToArcsecondsPerCentury(perOrbit);

    expect(
      arcsecondsPerCenturyToArcsecondsPerOrbit(perCentury)
    ).toBeCloseTo(perOrbit, 14);
  });

  it("invalidates the analytical reference after a physical initial-condition change", () => {
    const scenario = SUN_MERCURY_1PN_PRESET.createScenario();
    const draft = appliedScenarioToDraft(
      scenario,
      EDITOR_DRAFT_UNIT_POLICY
    );
    const mercury = draft.bodies.find(({ id }) => id === "mercury");
    expect(mercury).toBeDefined();
    if (mercury === undefined) {
      return;
    }

    const changedPosition = (mercury.initialPosition.x.siValue ?? 0) + 1;
    const changedDraft = {
      ...draft,
      bodies: draft.bodies.map((body) =>
        body.id === mercury.id
          ? {
              ...body,
              initialPosition: {
                ...body.initialPosition,
                x: {
                  ...body.initialPosition.x,
                  rawText: String(changedPosition),
                  siValue: changedPosition,
                  lastValidSiValue: changedPosition,
                },
              },
            }
          : body
      ),
    };
    const compilation = compileScenarioDraft(changedDraft);

    expect(compilation.ok).toBe(true);
    if (!compilation.ok) {
      return;
    }
    expect(isValidatedSunMercuryScenario(compilation.scenario)).toBe(
      false
    );
  });
});
