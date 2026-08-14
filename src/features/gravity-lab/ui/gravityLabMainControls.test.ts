import { describe, expect, it, vi } from "vitest";

import {
  getGravityLabMainControlState,
  invokeGravityLabMainControl,
  type GravityLabMainControlHandlers,
} from "./gravityLabMainControls";

describe("gravityLabMainControls", () => {
  it("active Stop et bloque Lecture et Appliquer pendant l'exécution", () => {
    expect(
      getGravityLabMainControlState({
        status: "running",
        rendererReady: true,
        hasUnappliedChanges: true,
        draftIsValid: true,
      })
    ).toEqual({
      mode: "Lecture",
      resumeDisabled: true,
      pauseDisabled: false,
      applyDisabled: true,
    });
  });

  it("active Lecture et Appliquer lorsque la session est en pause et le brouillon applicable", () => {
    expect(
      getGravityLabMainControlState({
        status: "paused",
        rendererReady: true,
        hasUnappliedChanges: true,
        draftIsValid: true,
      })
    ).toEqual({
      mode: "Pause",
      resumeDisabled: false,
      pauseDisabled: true,
      applyDisabled: false,
    });
  });

  it("conserve les règles existantes de disponibilité du rendu et du brouillon", () => {
    const rendererMissing = getGravityLabMainControlState({
      status: "paused",
      rendererReady: false,
      hasUnappliedChanges: true,
      draftIsValid: true,
    });
    const invalidDraft = getGravityLabMainControlState({
      status: "paused",
      rendererReady: true,
      hasUnappliedChanges: true,
      draftIsValid: false,
    });
    const synchronizedDraft = getGravityLabMainControlState({
      status: "paused",
      rendererReady: true,
      hasUnappliedChanges: false,
      draftIsValid: true,
    });

    expect(rendererMissing.resumeDisabled).toBe(true);
    expect(rendererMissing.applyDisabled).toBe(false);
    expect(invalidDraft.applyDisabled).toBe(true);
    expect(synchronizedDraft.applyDisabled).toBe(true);
  });

  it.each(["resume", "pause", "apply"] as const)(
    "branche l'action %s à son handler existant uniquement",
    (action) => {
      const handlers: GravityLabMainControlHandlers = {
        resume: vi.fn(),
        pause: vi.fn(),
        apply: vi.fn(),
      };

      invokeGravityLabMainControl(action, handlers);

      expect(handlers[action]).toHaveBeenCalledOnce();
      for (const [name, handler] of Object.entries(handlers)) {
        if (name !== action) {
          expect(handler).not.toHaveBeenCalled();
        }
      }
    }
  );
});
