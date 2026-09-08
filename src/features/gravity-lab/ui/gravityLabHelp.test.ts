import { describe, expect, it } from "vitest";

import {
  SCENARIO_STATE_HELP,
  SCIENTIFIC_DIAGNOSTIC_HELP,
  SIMULATION_CONTROL_HELP,
  VISUALIZATION_HELP,
} from "./gravityLabHelp";

describe("gravity-lab contextual help", () => {
  it("covers every requested state, control, and scientific diagnostic", () => {
    expect(SCENARIO_STATE_HELP.map(({ term }) => term)).toEqual([
      "Brouillon",
      "Scénario appliqué",
      "Simulation active",
    ]);
    expect(SIMULATION_CONTROL_HELP.map(({ term }) => term)).toEqual([
      "Lecture",
      "Stop",
      "Appliquer et réinitialiser",
      "Réinitialiser la physique",
    ]);
    expect(SCIENTIFIC_DIAGNOSTIC_HELP.map(({ term }) => term)).toEqual([
      "Énergie totale",
      "Dérive énergétique",
      "Moment cinétique",
      "Pas physique",
      "Pas recommandé",
      "β (bêta)",
      "χ paire",
      "χ propre",
      "ψ local",
      "Domaine recommandé",
    ]);
  });

  it("distinguishes visual aids from physical quantities", () => {
    expect(VISUALIZATION_HELP.radii).toContain(
      "aucune donnée physique"
    );
    expect(VISUALIZATION_HELP.trajectories).toContain(
      "n’interviennent jamais dans le calcul physique"
    );
    expect(VISUALIZATION_HELP.potentialGrid).toContain(
      "visualisation qualitative"
    );
    expect(VISUALIZATION_HELP.potentialGrid).toContain(
      "ne représente aucune courbure réelle de l’espace-temps"
    );
    expect(VISUALIZATION_HELP.gravityField).toContain(
      "direction du champ gravitationnel"
    );
    expect(VISUALIZATION_HELP.gravityField).toContain(
      "intensité relative"
    );
  });

  it("keeps every contextual explanation concise", () => {
    const descriptions = [
      ...SCENARIO_STATE_HELP.map(({ description }) => description),
      ...SIMULATION_CONTROL_HELP.map(({ description }) => description),
      ...SCIENTIFIC_DIAGNOSTIC_HELP.map(({ description }) => description),
      ...Object.values(VISUALIZATION_HELP),
    ];

    expect(descriptions.every((description) => description.length <= 280)).toBe(
      true
    );
  });

  it("describes the shared weak-field diagnostics without implying that 1PN removes their limits", () => {
    const domainHelp = SCIENTIFIC_DIAGNOSTIC_HELP.find(
      ({ term }) => term === "Domaine recommandé"
    );

    expect(domainHelp?.description).toContain("faible champ");
    expect(domainHelp?.description).toContain("vitesses non relativistes");
    expect(domainHelp?.description).toContain("Newtonien et 1PN");
  });
});
