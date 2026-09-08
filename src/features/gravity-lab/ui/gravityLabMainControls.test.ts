import { describe, expect, it, vi } from "vitest";

import {
  getGravityLabApplyAvailability,
  getGravityLabHydrationControlInput,
  getGravityLabMainControlState,
  invokeGravityLabMainControl,
  type GravityLabMainControlHandlers,
} from "./gravityLabMainControls";

describe("gravityLabMainControls", () => {
  it("conserve un premier rendu SSR/hydratation identique avant de publier le runtime", () => {
    const authoritativeRunningInput = {
      status: "running" as const,
      rendererReady: true,
      hasUnappliedChanges: false,
      draftIsValid: true,
    };
    const serverInput = getGravityLabHydrationControlInput(
      authoritativeRunningInput,
      false
    );
    const firstClientInput = getGravityLabHydrationControlInput(
      authoritativeRunningInput,
      false
    );

    expect(serverInput).toEqual(firstClientInput);
    expect(getGravityLabMainControlState(serverInput)).toEqual({
      mode: "Pause",
      resumeDisabled: true,
      pauseDisabled: true,
      applyDisabled: true,
    });

    const mountedInput = getGravityLabHydrationControlInput(
      authoritativeRunningInput,
      true
    );
    expect(getGravityLabMainControlState(mountedInput)).toEqual({
      mode: "Lecture",
      resumeDisabled: true,
      pauseDisabled: false,
      applyDisabled: true,
    });

    expect(
      getGravityLabMainControlState(
        getGravityLabHydrationControlInput(
          {
            ...authoritativeRunningInput,
            status: "paused",
          },
          true
        )
      )
    ).toMatchObject({
      mode: "Pause",
      resumeDisabled: false,
      pauseDisabled: true,
    });
  });

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

  it("explique pourquoi l’application est disponible ou bloquée", () => {
    expect(
      getGravityLabApplyAvailability({
        status: "paused",
        hasUnappliedChanges: false,
        draftIsValid: true,
      })
    ).toEqual({
      tone: "synchronized",
      message:
        "Le brouillon correspond déjà au scénario actuellement simulé.",
    });
    expect(
      getGravityLabApplyAvailability({
        status: "paused",
        hasUnappliedChanges: true,
        draftIsValid: false,
      }).tone
    ).toBe("blocked");
    expect(
      getGravityLabApplyAvailability({
        status: "running",
        hasUnappliedChanges: true,
        draftIsValid: true,
      }).message
    ).toContain("pause");
    expect(
      getGravityLabApplyAvailability({
        status: "paused",
        hasUnappliedChanges: true,
        draftIsValid: true,
      }).tone
    ).toBe("ready");
  });
});
