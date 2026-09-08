import { describe, expect, it } from "vitest";

import type { EncounterThresholds } from "../core/types";
import { SOLAR_MASS_KG } from "../core/units";
import {
  createEncounterInspectionWorkspace,
  detectEncounterAcrossStep,
  inspectEncounterAcrossStep,
  materializeEncounterDetection,
} from "./encounters";

const permissiveThresholds: EncounterThresholds = {
  maxRelativeDisplacementPerStep: 1,
  maxDynamicalStep: 1,
};

const scientificThresholds: EncounterThresholds = {
  maxRelativeDisplacementPerStep: 0.02,
  maxDynamicalStep: 0.02,
};

describe("collision and unresolved-encounter detection", () => {
  it("detects a collision crossed between two non-colliding endpoints", () => {
    const detection = detectEncounterAcrossStep(
      new Float64Array([-1, 0, 0, 1, 0, 0]),
      new Float64Array([1, 0, 0, -1, 0, 0]),
      new Float64Array([1, 1]),
      new Float64Array([0.1, 0.1]),
      new Uint8Array([0, 0]),
      0.01,
      permissiveThresholds
    );

    expect(detection?.kind).toBe("collision");
    expect(detection?.minimumSeparationM).toBe(0);
  });

  it("does not report a safe swept separation", () => {
    const detection = detectEncounterAcrossStep(
      new Float64Array([-1, 0, 0, 1, 0, 0]),
      new Float64Array([-0.75, 0, 0, 0.75, 0, 0]),
      new Float64Array([1, 1]),
      new Float64Array([0.1, 0.1]),
      new Uint8Array([0, 0]),
      0.01,
      permissiveThresholds
    );

    expect(detection).toBeNull();
  });

  it("detects an under-resolved fast flyby", () => {
    const detection = detectEncounterAcrossStep(
      new Float64Array([-10, 0, 0, 10, 0, 0]),
      new Float64Array([-9, 0, 0, 9, 0, 0]),
      new Float64Array([1, 1]),
      new Float64Array([0, 0]),
      new Uint8Array([0, 0]),
      1,
      scientificThresholds
    );

    expect(detection?.kind).toBe("unresolved-encounter");
    if (detection?.kind === "unresolved-encounter") {
      expect(detection.exceededRelativeDisplacement).toBe(true);
      expect(detection.exceededDynamicalStep).toBe(false);
    }
  });

  it("detects a step too large for the local gravitational timescale", () => {
    const positions = new Float64Array([0, 0, 0, 1e9, 0, 0]);
    const detection = detectEncounterAcrossStep(
      positions,
      positions,
      new Float64Array([SOLAR_MASS_KG, SOLAR_MASS_KG]),
      new Float64Array([0, 0]),
      new Uint8Array([0, 0]),
      1_000,
      scientificThresholds
    );

    expect(detection?.kind).toBe("unresolved-encounter");
    if (detection?.kind === "unresolved-encounter") {
      expect(detection.exceededRelativeDisplacement).toBe(false);
      expect(detection.exceededDynamicalStep).toBe(true);
    }
  });

  it("does not apply a dynamical-step warning to a fixed-fixed pair", () => {
    const positions = new Float64Array([0, 0, 0, 1e9, 0, 0]);
    const detection = detectEncounterAcrossStep(
      positions,
      positions,
      new Float64Array([SOLAR_MASS_KG, SOLAR_MASS_KG]),
      new Float64Array([0, 0]),
      new Uint8Array([1, 1]),
      1_000,
      scientificThresholds
    );

    expect(detection).toBeNull();
  });

  it("reuses a mutable inspection workspace and clears stale results", () => {
    const workspace = createEncounterInspectionWorkspace();
    const previous = new Float64Array([-10, 0, 0, 10, 0, 0]);
    const candidate = new Float64Array([-9, 0, 0, 9, 0, 0]);
    const masses = new Float64Array([1, 1]);
    const radii = new Float64Array([0, 0]);
    const fixed = new Uint8Array([0, 0]);

    const unresolved = inspectEncounterAcrossStep(
      previous,
      candidate,
      masses,
      radii,
      fixed,
      1,
      scientificThresholds,
      workspace
    );

    expect(unresolved).toBe(workspace);
    expect(workspace.kind).toBe("unresolved-encounter");
    expect(materializeEncounterDetection(workspace)?.kind).toBe(
      "unresolved-encounter"
    );

    const safe = inspectEncounterAcrossStep(
      previous,
      previous,
      masses,
      radii,
      fixed,
      0.01,
      permissiveThresholds,
      workspace
    );

    expect(safe).toBe(workspace);
    expect(workspace.kind).toBe("none");
    expect(workspace.firstBodyIndex).toBe(-1);
    expect(materializeEncounterDetection(workspace)).toBeNull();
  });

  it("gives any collision global priority over an earlier q violation", () => {
    const workspace = createEncounterInspectionWorkspace();

    inspectEncounterAcrossStep(
      new Float64Array([
        -1_000, 0, 0,
        -900, 0, 0,
        -1, 0, 0,
        1, 0, 0,
      ]),
      new Float64Array([
        -1_000, 0, 0,
        -890, 0, 0,
        1, 0, 0,
        -1, 0, 0,
      ]),
      new Float64Array([1, 1, 1, 1]),
      new Float64Array([0, 0, 0.1, 0.1]),
      new Uint8Array([0, 0, 0, 0]),
      1,
      scientificThresholds,
      workspace
    );

    expect(workspace.kind).toBe("collision");
    expect(workspace.firstBodyIndex).toBe(2);
    expect(workspace.secondBodyIndex).toBe(3);
  });

  it("still detects a collision for a fixed-fixed pair", () => {
    const workspace = createEncounterInspectionWorkspace();

    inspectEncounterAcrossStep(
      new Float64Array([-1, 0, 0, 1, 0, 0]),
      new Float64Array([1, 0, 0, -1, 0, 0]),
      new Float64Array([1, 1]),
      new Float64Array([0.1, 0.1]),
      new Uint8Array([1, 1]),
      0.01,
      permissiveThresholds,
      workspace
    );

    expect(workspace.kind).toBe("collision");
  });
});
