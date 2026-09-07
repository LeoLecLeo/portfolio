import { describe, expect, it, vi } from "vitest";

import { isAppliedScenario } from "../core/scenario";
import {
  MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS,
  createMercuryValidationInitialState,
} from "../experiments/mercuryPerihelionExperiment";
import {
  INCLINED_BINARY_SCHEDULER_CONFIG,
  createInclinedBinaryAppliedScenario,
} from "./inclinedBinary";
import { GravityLabSessionHost } from "../runtime/GravityLabSession";
import {
  createGravityLabState,
  gravityLabReducer,
} from "../ui/gravityLabReducer";
import { preparePresetDraftLoad } from "../ui/presetDraftLoading";
import {
  SUN_MERCURY_1PN_PRESET,
  SUN_MERCURY_1PN_PRESET_ID,
} from "./sunMercury1pn";

describe("Sun-Mercury public 1PN preset", () => {
  it("reuses the validated barycentric 3C state and remains in the recommended domain", () => {
    const initialState = createMercuryValidationInitialState();
    const scenario = SUN_MERCURY_1PN_PRESET.createScenario();
    const [sun, mercury] = scenario.physics.bodies;

    expect(isAppliedScenario(scenario)).toBe(true);
    expect(scenario.physics.modelId).toBe("first-post-newtonian");
    expect(scenario.physics.bodies).toHaveLength(2);
    expect([sun.id, mercury.id]).toEqual(["sun", "mercury"]);
    expect([sun.name, mercury.name]).toEqual(["Soleil", "Mercure"]);
    expect([sun.massKg, mercury.massKg]).toEqual(
      Array.from(initialState.massesKg)
    );
    expect([
      sun.initialPositionM.x,
      sun.initialPositionM.y,
      sun.initialPositionM.z,
      mercury.initialPositionM.x,
      mercury.initialPositionM.y,
      mercury.initialPositionM.z,
    ]).toEqual(Array.from(initialState.positionsM));
    expect([
      sun.initialVelocityMps.x,
      sun.initialVelocityMps.y,
      sun.initialVelocityMps.z,
      mercury.initialVelocityMps.x,
      mercury.initialVelocityMps.y,
      mercury.initialVelocityMps.z,
    ]).toEqual(Array.from(initialState.velocitiesMps));
    expect(sun.fixed).toBe(false);
    expect(mercury.fixed).toBe(false);
    expect(scenario.numericalPolicy.timeStepSeconds).toBe(
      MERCURY_VALIDATED_INTERACTIVE_TIME_STEP_SECONDS
    );
    expect(scenario.initialValidity.overallLevel).toBe("recommended");
    expect(scenario.initialValidity.beta.level).toBe("recommended");
    expect(scenario.initialValidity.chiPair?.level).toBe("recommended");
    expect(scenario.initialValidity.chiSelf?.level).toBe("recommended");
    expect(scenario.initialValidity.psi.level).toBe("recommended");
  });

  it("is public, explicitly 1PN, and carries concise relativistic pedagogy", () => {
    expect(SUN_MERCURY_1PN_PRESET).toMatchObject({
      id: SUN_MERCURY_1PN_PRESET_ID,
      bodyCount: 2,
      expectedPhysicalDomain: "first-post-newtonian-weak-field",
    });
    expect(SUN_MERCURY_1PN_PRESET.pedagogy.observedPhenomenon).toContain(
      "Newton seul"
    );
    expect(SUN_MERCURY_1PN_PRESET.pedagogy.keyParameters.join(" ")).toContain(
      "42,98 secondes d’arc par siècle"
    );
    expect(SUN_MERCURY_1PN_PRESET.pedagogy.expectedResult).toContain(
      "première correction"
    );
    expect(SUN_MERCURY_1PN_PRESET.pedagogy.limitationOrWarning).toContain(
      "pas la relativité générale complète"
    );
    expect(SUN_MERCURY_1PN_PRESET.pedagogy.limitationOrWarning).toContain(
      "vitesses non relativistes"
    );
  });

  it("loads only the draft and still allows selecting Newtonian before application", () => {
    const host = new GravityLabSessionHost({
      appliedScenario: createInclinedBinaryAppliedScenario(
        INCLINED_BINARY_SCHEDULER_CONFIG
      ),
      schedulerConfig: INCLINED_BINARY_SCHEDULER_CONFIG,
    });
    const initial = createGravityLabState(host.snapshot);
    const result = preparePresetDraftLoad(
      SUN_MERCURY_1PN_PRESET,
      false,
      vi.fn()
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      return;
    }

    const loaded = gravityLabReducer(initial, result.action);

    expect(loaded.draft.modelId).toBe("first-post-newtonian");
    expect(loaded.selectedDraftBodyId).toBe("sun");
    expect(loaded.activeSession).toBe(initial.activeSession);
    expect(loaded.appliedScenario).toBe(initial.appliedScenario);
    expect(loaded.sessionTelemetry).toBe(initial.sessionTelemetry);

    const switched = gravityLabReducer(loaded, {
      type: "set-gravity-model",
      modelId: "newtonian",
    });

    expect(switched.draft.modelId).toBe("newtonian");
    expect(switched.activeSession).toBe(initial.activeSession);
    expect(switched.appliedScenario).toBe(initial.appliedScenario);
    expect(switched.draft.bodies).toBe(loaded.draft.bodies);
  });
});
