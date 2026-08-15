import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContextualHelp } from "./ContextualHelp";

describe("ContextualHelp", () => {
  it("renders concise help as a native disclosure without opening it by default", () => {
    const markup = renderToStaticMarkup(
      <ContextualHelp
        summary="Comprendre"
        items={[
          {
            term: "Grandeur",
            description: "Explication contextuelle.",
          },
        ]}
      />
    );

    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
    expect(markup).not.toContain("<details open");
    expect(markup).toContain("<dt");
    expect(markup).toContain("Grandeur");
    expect(markup).toContain("Explication contextuelle.");
  });
});
