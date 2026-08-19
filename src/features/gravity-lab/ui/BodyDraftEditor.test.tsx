import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { appliedScenarioToDraft } from "../core/scenario";
import { compileScenarioDraft } from "../core/scenarioCompiler";
import {
  createInclinedBinaryAppliedScenario,
  INCLINED_BINARY_SCHEDULER_CONFIG,
} from "../presets/inclinedBinary";
import { BodyDraftEditor } from "./BodyDraftEditor";
import { EDITOR_DRAFT_UNIT_POLICY } from "./gravityLabReducer";

function renderEditor(): string {
  const scenario = createInclinedBinaryAppliedScenario(
    INCLINED_BINARY_SCHEDULER_CONFIG
  );
  const draft = appliedScenarioToDraft(
    scenario,
    EDITOR_DRAFT_UNIT_POLICY
  );
  const validation = compileScenarioDraft(draft, {
    budget: INCLINED_BINARY_SCHEDULER_CONFIG,
  });

  return renderToStaticMarkup(
    <BodyDraftEditor
      draft={draft}
      validationReport={validation.report}
      selectedBodyId={draft.bodies[0].id}
      dispatch={() => undefined}
    />
  );
}

describe("body draft inspector editor", () => {
  it("groups every existing field into four native collapsible sections", () => {
    const markup = renderEditor();

    expect(markup.match(/<details/g)).toHaveLength(4);
    expect(markup).toContain("Général");
    expect(markup).toContain("Propriétés physiques");
    expect(markup).toContain("Position initiale");
    expect(markup).toContain("Vitesse initiale");
    expect(markup).toContain("Identifiant technique");
    expect(markup).toContain("Masse");
    expect(markup).toContain("Rayon physique");
    expect(markup).toContain("Mobile");
    expect(markup).toContain("Fixe");
    expect(markup).toContain("draft-body-0-position-z");
    expect(markup).toContain("draft-body-0-velocity-z");
  });

  it("opens general and physical properties initially without expanding vectors", () => {
    const markup = renderEditor();
    const openSections = markup.match(/<details open=""/g) ?? [];

    expect(openSections).toHaveLength(2);
    expect(markup).toMatch(/<details[^>]*open=""[^>]*>[\s\S]*?Général/);
    expect(markup).toMatch(
      /<details[^>]*open=""[^>]*>[\s\S]*?Propriétés physiques/
    );
  });
});
