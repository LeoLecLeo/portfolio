import type { GravityLabSessionHost } from "../runtime/GravityLabSession";

type DeferCleanup = (cleanup: () => void) => void;

export type GravityLabHostLifecycle = Readonly<{
  activate: () => () => void;
}>;

/**
 * Defers disposal by one microtask so React Strict Mode can replay an effect
 * without destroying the host retained by the second setup.
 */
export function createGravityLabHostLifecycle(
  host: GravityLabSessionHost,
  deferCleanup: DeferCleanup = queueMicrotask
): GravityLabHostLifecycle {
  let activation = 0;

  return Object.freeze({
    activate: () => {
      const currentActivation = ++activation;
      let cleanupRequested = false;

      return () => {
        if (cleanupRequested) {
          return;
        }

        cleanupRequested = true;
        deferCleanup(() => {
          if (activation === currentActivation) {
            host.stop();
          }
        });
      };
    },
  });
}
