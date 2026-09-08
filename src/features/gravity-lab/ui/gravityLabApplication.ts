import {
  compileScenarioDraft,
} from "../core/scenarioCompiler";
import type {
  AppliedScenario,
  ScenarioDraft,
  ScenarioCompilationResult,
  ScenarioValidationReport,
} from "../core/scenario";
import type { FixedStepSchedulerConfig } from "../runtime/FixedStepScheduler";
import type { GravityLabSessionHost } from "../runtime/GravityLabSession";
import { createGravityLabSchedulerConfig } from "../runtime/schedulerPolicy";
import type {
  GravityLabAction,
  GravityLabState,
} from "./gravityLabReducer";

export type GravityLabApplicationResult =
  | Readonly<{
      ok: true;
      report: ScenarioValidationReport;
      action: Extract<GravityLabAction, { type: "draft-applied" }>;
    }>
  | Readonly<{
      ok: false;
      report: ScenarioValidationReport | null;
      message: string | null;
    }>;

export function validateGravityLabDraft(
  draft: ScenarioDraft,
  preferredSimulatedSecondsPerRealSecond: number | null
): ScenarioCompilationResult {
  const preliminary = compileScenarioDraft(draft);

  if (!preliminary.ok) {
    return preliminary;
  }

  const schedulerConfig = schedulerConfigForAppliedScenario(
    preliminary.scenario,
    preferredSimulatedSecondsPerRealSecond
  );

  return compileScenarioDraft(draft, { budget: schedulerConfig });
}

export function schedulerConfigForAppliedScenario(
  scenario: AppliedScenario,
  preferredSimulatedSecondsPerRealSecond: number | null
): FixedStepSchedulerConfig {
  return createGravityLabSchedulerConfig(
    scenario.numericalPolicy.timeStepSeconds,
    preferredSimulatedSecondsPerRealSecond
  );
}

export function applyGravityLabDraft(
  state: GravityLabState,
  host: GravityLabSessionHost
): GravityLabApplicationResult {
  const authoritativeSnapshot = host.snapshot;

  if (
    authoritativeSnapshot.session !== state.activeSession ||
    authoritativeSnapshot.appliedScenario !== state.appliedScenario
  ) {
    return {
      ok: false,
      report: null,
      message:
        "La session active a changé avant l’application ; aucune modification n’a été effectuée.",
    };
  }

  if (authoritativeSnapshot.session.runtime.isRunning) {
    return {
      ok: false,
      report: null,
      message:
        "Mettez la simulation en pause avant d’appliquer le brouillon.",
    };
  }

  const compilation = validateGravityLabDraft(
    state.draft,
    state.draftPreferredSimulatedSecondsPerRealSecond
  );

  if (!compilation.ok) {
    return {
      ok: false,
      report: compilation.report,
      message: null,
    };
  }

  try {
    const schedulerConfig = schedulerConfigForAppliedScenario(
      compilation.scenario,
      state.draftPreferredSimulatedSecondsPerRealSecond
    );
    const snapshot = host.replace({
      appliedScenario: compilation.scenario,
      schedulerConfig,
    });

    return {
      ok: true,
      report: compilation.report,
      action: {
        type: "draft-applied",
        snapshot,
        draft: compilation.report.analyzedDraft,
        selectedBodyId: state.selectedDraftBodyId,
        preferredSimulatedSecondsPerRealSecond:
          state.draftPreferredSimulatedSecondsPerRealSecond,
      },
    };
  } catch {
    return {
      ok: false,
      report: compilation.report,
      message:
        "La nouvelle session n’a pas pu être créée. Le scénario et la session précédents ont été conservés.",
    };
  }
}
