import {
  compileScenarioDraft,
  type ScenarioCompilationOptions,
} from "../core/scenarioCompiler";
import type {
  ScenarioDraft,
  ScenarioCompilationResult,
  ScenarioValidationReport,
} from "../core/scenario";
import type { FixedStepSchedulerConfig } from "../runtime/FixedStepScheduler";
import type { GravityLabSessionHost } from "../runtime/GravityLabSession";
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
  schedulerConfig: FixedStepSchedulerConfig
): ScenarioCompilationResult {
  const options: ScenarioCompilationOptions = {
    budget: schedulerConfig,
  };

  return compileScenarioDraft(draft, options);
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
    state.activeSession.schedulerConfig
  );

  if (!compilation.ok) {
    return {
      ok: false,
      report: compilation.report,
      message: null,
    };
  }

  try {
    const snapshot = host.replace({
      appliedScenario: compilation.scenario,
      schedulerConfig: state.activeSession.schedulerConfig,
    });

    return {
      ok: true,
      report: compilation.report,
      action: {
        type: "draft-applied",
        snapshot,
        draft: compilation.report.analyzedDraft,
        selectedBodyId: state.selectedDraftBodyId,
      },
    };
  } catch (error) {
    return {
      ok: false,
      report: compilation.report,
      message:
        error instanceof Error
          ? `La nouvelle session n’a pas pu être créée : ${error.message}`
          : "La nouvelle session n’a pas pu être créée.",
    };
  }
}
