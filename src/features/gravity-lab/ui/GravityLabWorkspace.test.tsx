import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GravityLabWorkspace,
  GravityWorkspaceDiagnostics,
  GravityWorkspaceInspector,
  GravityWorkspaceMain,
} from "./GravityLabWorkspace";

describe("gravity lab workspace", () => {
  it("starts with compact accessible triggers and keeps the center visible", () => {
    const markup = renderToStaticMarkup(
      <GravityLabWorkspace>
        <GravityWorkspaceInspector
          side="left"
          eyebrow="Bibliothèque"
          title="Scénarios / presets"
          compactLabel="Presets"
        >
          <p>Catalogue</p>
        </GravityWorkspaceInspector>
        <GravityWorkspaceMain>
          <p>Scène centrale</p>
        </GravityWorkspaceMain>
        <GravityWorkspaceInspector
          side="right"
          eyebrow="Inspecteur"
          title="Corps et paramètres"
          compactLabel="Corps"
        >
          <p>Éditeur</p>
        </GravityWorkspaceInspector>
        <GravityWorkspaceDiagnostics>
          <p>Diagnostics</p>
        </GravityWorkspaceDiagnostics>
      </GravityLabWorkspace>
    );

    expect(markup).toContain("Scène centrale");
    expect(markup).toContain("Diagnostics");
    expect(markup).toContain('aria-label="Ouvrir Scénarios / presets"');
    expect(markup).toContain('aria-label="Ouvrir Corps et paramètres"');
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(markup).not.toContain("Catalogue");
    expect(markup).not.toContain("Éditeur");
  });
});
