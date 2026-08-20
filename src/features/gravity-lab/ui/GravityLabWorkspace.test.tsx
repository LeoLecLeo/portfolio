import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getGravityWorkspaceCenterClassName,
  getGravityWorkspaceInspectorPlacement,
  GravityLabWorkspace,
  GravityWorkspaceDiagnostics,
  GravityWorkspaceInspector,
  GravityWorkspaceMain,
} from "./GravityLabWorkspace";

describe("gravity lab workspace", () => {
  it("starts with compact accessible triggers and keeps the center visible", () => {
    let renderedInspectorContents = 0;
    const renderInspectorContent = (label: string) =>
      function InspectorTestContent() {
        renderedInspectorContents += 1;
        return <p>{label}</p>;
      };
    const markup = renderToStaticMarkup(
      <GravityLabWorkspace>
        <GravityWorkspaceInspector
          side="left"
          eyebrow="Bibliothèque"
          title="Scénarios / presets"
        >
          {renderInspectorContent("Catalogue")}
        </GravityWorkspaceInspector>
        <GravityWorkspaceMain>
          <p>Scène centrale</p>
        </GravityWorkspaceMain>
        <GravityWorkspaceInspector
          side="right"
          eyebrow="Inspecteur"
          title="Corps et paramètres"
        >
          {renderInspectorContent("Éditeur")}
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
    expect(markup).toContain("Bibliothèque");
    expect(markup).toContain("Scénarios / presets");
    expect(markup).toContain("Inspecteur");
    expect(markup).toContain("Corps et paramètres");
    expect(markup).not.toContain("Catalogue");
    expect(markup).not.toContain("Éditeur");
    expect(renderedInspectorContents).toBe(0);
    expect(markup.match(/class="fixed bottom-2/g)).toHaveLength(2);
    expect(markup).toContain("left-2 sm:left-4");
    expect(markup).toContain("right-2 sm:right-4");
    expect(markup).toContain("min-[1888px]:bottom-auto");
    expect(markup).toContain("bg-card/98");
    expect(markup).not.toContain("rounded-full");
    expect(markup).not.toContain("sticky");
    expect(markup).toContain(
      "min-[1888px]:ml-[calc(50%_-_50vw_+_1rem)]"
    );
    expect(markup).not.toContain("translate-x");
  });

  it("keeps the central width contract identical for every inspector state", () => {
    const states = [
      { leftOpen: false, rightOpen: false },
      { leftOpen: true, rightOpen: false },
      { leftOpen: false, rightOpen: true },
      { leftOpen: true, rightOpen: true },
    ];
    const classNames = states.map(getGravityWorkspaceCenterClassName);

    expect(new Set(classNames)).toEqual(
      new Set([
        "min-w-0 min-[1888px]:col-start-2 min-[1888px]:row-start-1",
      ])
    );
  });

  it("anchors Presets left and Corps right outside the central track", () => {
    expect(getGravityWorkspaceInspectorPlacement("left")).toContain(
      "left-4!"
    );
    expect(getGravityWorkspaceInspectorPlacement("left")).toContain(
      "right-auto!"
    );
    expect(getGravityWorkspaceInspectorPlacement("right")).toContain(
      "right-4!"
    );
    expect(getGravityWorkspaceInspectorPlacement("right")).toContain(
      "left-auto!"
    );
    expect(getGravityWorkspaceInspectorPlacement("right")).not.toContain(
      "left-4!"
    );
  });
});
