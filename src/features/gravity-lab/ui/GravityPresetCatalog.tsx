import { memo } from "react";

import type {
  GravityPreset,
  GravityPresetCategory,
  GravityPresetEducationalLevel,
  GravityPresetPhysicalDomain,
} from "../presets/gravityPreset";

const CATEGORY_LABELS: Readonly<
  Record<GravityPresetCategory, string>
> = Object.freeze({
  "binary-system": "Système binaire",
  "planetary-system": "Système planétaire",
  "multi-body": "Système à plusieurs corps",
  spaceflight: "Navigation spatiale",
});

const EDUCATIONAL_LEVEL_LABELS: Readonly<
  Record<GravityPresetEducationalLevel, string>
> = Object.freeze({
  introductory: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
});

const PHYSICAL_DOMAIN_LABELS: Readonly<
  Record<GravityPresetPhysicalDomain, string>
> = Object.freeze({
  "newtonian-n-body": "Gravitation newtonienne N-corps",
  "first-post-newtonian-weak-field":
    "Relativité 1PN · champ faible",
});

export type GravityPresetPresentation = Readonly<{
  category: string;
  educationalLevel: string;
  bodyCount: string;
  physicalDomain: string;
}>;

export function presentGravityPreset(
  preset: GravityPreset
): GravityPresetPresentation {
  return {
    category: CATEGORY_LABELS[preset.category],
    educationalLevel:
      EDUCATIONAL_LEVEL_LABELS[preset.educationalLevel],
    bodyCount: `${preset.bodyCount} corps`,
    physicalDomain:
      PHYSICAL_DOMAIN_LABELS[preset.expectedPhysicalDomain],
  };
}

export type GravityPresetCatalogProps = Readonly<{
  presets: readonly GravityPreset[];
  onLoad: (preset: GravityPreset) => void;
}>;

export const GravityPresetCatalog = memo(function GravityPresetCatalog({
  presets,
  onLoad,
}: GravityPresetCatalogProps) {
  return (
    <section aria-labelledby="gravity-preset-catalog-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/75">
          Presets scientifiques
        </p>
        <h3
          id="gravity-preset-catalog-title"
          className="mt-1 text-base font-semibold"
        >
          Charger un scénario dans le brouillon
        </h3>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Le chargement ne modifie jamais la simulation active avant une
          application explicite.
        </p>
      </div>

      <ul className="mt-3 grid min-w-0 grid-cols-1 gap-1.5">
        {presets.map((preset) => {
          const presentation = presentGravityPreset(preset);

          return (
            <li key={preset.id} className="min-w-0">
              <article className="min-w-0 rounded-md border-l-2 border-transparent p-3 transition-colors hover:border-primary/35 hover:bg-secondary/20 motion-reduce:transition-none">
                <h4 className="break-words text-sm font-semibold">
                  {preset.name}
                </h4>
                <p className="mt-1 break-words text-xs leading-snug text-muted-foreground">
                  {preset.shortDescription}
                </p>
                <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 border-y border-border/40 py-2 text-xs sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Catégorie</dt>
                    <dd className="break-words font-medium">
                      {presentation.category}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Niveau</dt>
                    <dd className="break-words font-medium">
                      {presentation.educationalLevel}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Corps</dt>
                    <dd className="break-words font-medium">
                      {presentation.bodyCount}
                    </dd>
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-muted-foreground">
                      Domaine physique attendu
                    </dt>
                    <dd className="break-words font-medium">
                      {presentation.physicalDomain}
                    </dd>
                  </div>
                </dl>
                <details className="mt-2 rounded-md border border-border/45 bg-background/20 text-xs">
                  <summary className="cursor-pointer rounded-md px-2 py-2 font-medium transition-colors hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none">
                    Repères pédagogiques
                  </summary>
                  <div className="space-y-2.5 border-t border-border/45 px-2 py-2.5">
                    <div>
                      <h5 className="font-semibold">Objectif pédagogique</h5>
                      <p className="mt-0.5 break-words leading-relaxed text-muted-foreground">
                        {preset.pedagogy.learningObjective}
                      </p>
                    </div>
                    <div>
                      <h5 className="font-semibold">Phénomène observé</h5>
                      <p className="mt-0.5 break-words leading-relaxed text-muted-foreground">
                        {preset.pedagogy.observedPhenomenon}
                      </p>
                    </div>
                    <div>
                      <h5 className="font-semibold">Paramètres principaux</h5>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {preset.pedagogy.keyParameters.map((parameter) => (
                          <li key={parameter} className="break-words">
                            {parameter}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-semibold">À modifier</h5>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {preset.pedagogy.interestingParametersToModify.map(
                          (parameter) => (
                            <li key={parameter} className="break-words">
                              {parameter}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-semibold">Résultat attendu</h5>
                      <p className="mt-0.5 break-words leading-relaxed text-muted-foreground">
                        {preset.pedagogy.expectedResult}
                      </p>
                    </div>
                    <div>
                      <h5 className="font-semibold">Limite ou avertissement</h5>
                      <p className="mt-0.5 break-words leading-relaxed text-muted-foreground">
                        {preset.pedagogy.limitationOrWarning}
                      </p>
                    </div>
                  </div>
                </details>
                <button
                  type="button"
                  onClick={() => onLoad(preset)}
                  className="mt-2 w-full rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
                >
                  Charger dans le brouillon
                </button>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
