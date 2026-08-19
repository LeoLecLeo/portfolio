import type { PrototypeTelemetry } from "../runtime/GravityPrototypeRuntime";

export type GravityLabMainControlState = Readonly<{
  mode: "Lecture" | "Pause";
  resumeDisabled: boolean;
  pauseDisabled: boolean;
  applyDisabled: boolean;
}>;

export type GravityLabMainControlAction = "resume" | "pause" | "apply";

export type GravityLabApplyAvailability = Readonly<{
  tone: "ready" | "blocked" | "synchronized";
  message: string;
}>;

export type GravityLabMainControlHandlers = Readonly<{
  resume: () => void;
  pause: () => void;
  apply: () => void;
}>;

export type GravityLabMainControlInput = Readonly<{
  status: PrototypeTelemetry["status"];
  rendererReady: boolean;
  hasUnappliedChanges: boolean;
  draftIsValid: boolean;
}>;

/**
 * SSR and the first hydration render cannot observe the WebGL renderer. Keep
 * their control snapshot identical and safe until React has mounted, then use
 * the authoritative session and renderer state without changing their rules.
 */
export function getGravityLabHydrationControlInput(
  input: GravityLabMainControlInput,
  hydrated: boolean
): GravityLabMainControlInput {
  return hydrated
    ? input
    : {
        ...input,
        status: "paused",
        rendererReady: false,
      };
}

export function getGravityLabMainControlState(
  input: GravityLabMainControlInput
): GravityLabMainControlState {
  const running = input.status === "running";

  return {
    mode: running ? "Lecture" : "Pause",
    resumeDisabled: !input.rendererReady || input.status !== "paused",
    pauseDisabled: !running,
    applyDisabled:
      !input.hasUnappliedChanges || !input.draftIsValid || running,
  };
}

export function getGravityLabApplyAvailability(input: Readonly<{
  status: PrototypeTelemetry["status"];
  hasUnappliedChanges: boolean;
  draftIsValid: boolean;
}>): GravityLabApplyAvailability {
  if (!input.hasUnappliedChanges) {
    return {
      tone: "synchronized",
      message:
        "Le brouillon correspond déjà au scénario actuellement simulé.",
    };
  }

  if (!input.draftIsValid) {
    return {
      tone: "blocked",
      message:
        "Corrigez les erreurs du brouillon avant de l’appliquer.",
    };
  }

  if (input.status === "running") {
    return {
      tone: "blocked",
      message:
        "Mettez la simulation en pause avant d’appliquer le brouillon.",
    };
  }

  return {
    tone: "ready",
    message:
      "Le brouillon est valide et prêt à remplacer la session en cours.",
  };
}

export function invokeGravityLabMainControl(
  action: GravityLabMainControlAction,
  handlers: GravityLabMainControlHandlers
): void {
  handlers[action]();
}
