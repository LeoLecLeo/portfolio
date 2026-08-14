import type { PrototypeTelemetry } from "../runtime/GravityPrototypeRuntime";

export type GravityLabMainControlState = Readonly<{
  mode: "Lecture" | "Pause";
  resumeDisabled: boolean;
  pauseDisabled: boolean;
  applyDisabled: boolean;
}>;

export type GravityLabMainControlAction = "resume" | "pause" | "apply";

export type GravityLabMainControlHandlers = Readonly<{
  resume: () => void;
  pause: () => void;
  apply: () => void;
}>;

export function getGravityLabMainControlState(input: Readonly<{
  status: PrototypeTelemetry["status"];
  rendererReady: boolean;
  hasUnappliedChanges: boolean;
  draftIsValid: boolean;
}>): GravityLabMainControlState {
  const running = input.status === "running";

  return {
    mode: running ? "Lecture" : "Pause",
    resumeDisabled: !input.rendererReady || input.status !== "paused",
    pauseDisabled: !running,
    applyDisabled:
      !input.hasUnappliedChanges || !input.draftIsValid || running,
  };
}

export function invokeGravityLabMainControl(
  action: GravityLabMainControlAction,
  handlers: GravityLabMainControlHandlers
): void {
  handlers[action]();
}
