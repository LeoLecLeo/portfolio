import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GravityModelSelector } from "./GravityModelSelector";

describe("GravityModelSelector", () => {
  it("renders an accessible compact choice with Newtonian selected", () => {
    const markup = renderToStaticMarkup(
      <GravityModelSelector modelId="newtonian" onChange={() => {}} />
    );

    expect(markup).toContain("Modèle gravitationnel");
    expect(markup).toMatch(
      /<input(?=[^>]*checked="")(?=[^>]*value="newtonian")[^>]*>/
    );
    expect(markup).not.toMatch(
      /<input(?=[^>]*checked="")(?=[^>]*value="first-post-newtonian")[^>]*>/
    );
    expect(markup).toContain("Velocity Verlet");
    expect(markup).toContain("RK4 fixe");
    expect(markup).toContain("approximation de la relativité générale");
    expect(markup).toContain("pas la relativité générale complète");
  });

  it("exposes the selected 1PN draft value without changing either option", () => {
    const markup = renderToStaticMarkup(
      <GravityModelSelector
        modelId="first-post-newtonian"
        onChange={() => {}}
      />
    );

    expect(markup).toMatch(
      /<input(?=[^>]*checked="")(?=[^>]*value="first-post-newtonian")[^>]*>/
    );
    expect(markup).toContain("Newtonien");
    expect(markup).toContain("Relativité 1PN");
  });
});
