import { describe, expect, it } from "vitest";

import {
  bodyListLabel,
  cameraFollowLabel,
  diagnosticMessageFr,
  visualizationToggleLabel,
} from "./gravityLabPresentation";

describe("gravity-lab UI presentation", () => {
  it("keeps a valid body name and supplies an accessible fallback for a blank name", () => {
    expect(bodyListLabel({ id: "earth", name: "Terre" })).toBe(
      "Terre"
    );
    expect(bodyListLabel({ id: "body-7", name: "   " })).toBe(
      "Corps body-7"
    );
  });

  it("presents editor parsing and fixed-body diagnostics in French", () => {
    expect(
      diagnosticMessageFr({ code: "parse.invalid-syntax" })
    ).toBe(
      "La valeur complète doit respecter la syntaxe décimale prise en charge."
    );
    expect(
      diagnosticMessageFr({ code: "body.fixed-velocity" })
    ).toBe(
      "Un corps fixe doit avoir une vitesse initiale exactement nulle."
    );
    expect(
      diagnosticMessageFr({ code: "domain.beta.limit" })
    ).toBe(
      "La vitesse dépasse la limite non relativiste admise par le laboratoire."
    );
  });

  it("adds the responsible body to a global diagnostic", () => {
    expect(
      diagnosticMessageFr({
        code: "body.position-limit",
        subject: {
          kind: "body",
          bodyId: "probe",
          bodyIndex: 2,
        },
      })
    ).toBe(
      "La valeur absolue de chaque composante de position ne doit pas dépasser 1e18 m. Corps concerné : probe."
    );
  });

  it("uses an explicit French fallback for an unknown diagnostic code", () => {
    expect(
      diagnosticMessageFr({ code: "future.unknown-code" })
    ).toBe(
      "Un diagnostic non reconnu a été produit (code : future.unknown-code)."
    );
  });

  it("provides explicit accessible names for visual toggles and camera tracking", () => {
    expect(visualizationToggleLabel("trajectories", false)).toBe(
      "Afficher les trajectoires"
    );
    expect(
      visualizationToggleLabel("potential-grid", true)
    ).toBe("Masquer la grille d’influence newtonienne");
    expect(
      visualizationToggleLabel("gravity-field", false)
    ).toBe("Afficher le champ gravitationnel");
    expect(cameraFollowLabel("earth", null)).toBe(
      "Activer le suivi caméra du corps earth"
    );
    expect(cameraFollowLabel("earth", "sun")).toBe(
      "Désactiver le suivi caméra du corps sun"
    );
  });
});
