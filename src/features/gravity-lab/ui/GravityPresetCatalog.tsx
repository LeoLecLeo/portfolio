import { memo } from "react";

import type {
  GravityPreset,
  GravityPresetCategory,
  GravityPresetEducationalLevel,
  GravityPresetPhysicalDomain,
} from "../presets/gravityPreset";
import { HYPERBOLIC_FLYBY_PRESET_ID } from "../presets/hyperbolicFlyby";
import { INCLINED_BINARY_PRESET_ID } from "../presets/inclinedBinary";
import { SUN_MERCURY_1PN_PRESET_ID } from "../presets/sunMercury1pn";

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

export type GravityPresetShowcasePresentation = Readonly<{
  capability: string;
  whatYouWillSee: string;
  timingHint: string;
}>;

const SHOWCASE_BY_PRESET_ID: Readonly<
  Record<string, GravityPresetShowcasePresentation>
> = Object.freeze({
  [INCLINED_BINARY_PRESET_ID]: Object.freeze({
    capability: "N-corps 3D",
    whatYouWillSee:
      "Deux étoiles décrivent une orbite inclinée autour de leur barycentre, avec un mouvement immédiatement lisible en profondeur.",
    timingHint: "Une révolution complète prend environ 24 s réelles.",
  }),
  [HYPERBOLIC_FLYBY_PRESET_ID]: Object.freeze({
    capability: "Trajectoire ouverte",
    whatYouWillSee:
      "Un visiteur accélère, est dévié au voisinage d’un corps jovien puis repart sans être capturé.",
    timingHint: "Le passage rapproché survient après environ 40 s réelles.",
  }),
  [SUN_MERCURY_1PN_PRESET_ID]: Object.freeze({
    capability: "Relativité 1PN",
    whatYouWillSee:
      "La comparaison synchronisée isole l’avance relativiste du périhélie de Mercure par rapport à Newton.",
    timingHint:
      "Une orbite prend environ 22 s ; la mesure stabilisée demande au moins cinq périhélies, soit environ 110 s.",
  }),
});

export function presentGravityPresetShowcase(
  presetId: string
): GravityPresetShowcasePresentation | null {
  return SHOWCASE_BY_PRESET_ID[presetId] ?? null;
}

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

function GravityPresetCard({
  preset,
  onLoad,
}: Readonly<{
  preset: GravityPreset;
  onLoad: (preset: GravityPreset) => void;
}>) {
  const presentation = presentGravityPreset(preset);
  const showcase = presentGravityPresetShowcase(preset.id);

  return (
    <li className="min-w-0">
      <article className="min-w-0 rounded-md border-l-2 border-transparent p-3 transition-colors hover:border-primary/35 hover:bg-secondary/20 motion-reduce:transition-none">
        {showcase !== null ? (
          <div className="mb-2 rounded-md border border-primary/25 bg-primary/6 p-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-[0.1em] text-primary">
                Expérience vitrine
              </span>
              <span className="font-medium text-foreground/80">
                {showcase.capability}
              </span>
            </div>
            <p className="mt-2 leading-relaxed text-foreground/90">
              <span className="font-semibold">À voir :</span>{" "}
              {showcase.whatYouWillSee}
            </p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              {showcase.timingHint}
            </p>
          </div>
        ) : null}
        <h5 className="break-words text-sm font-semibold">{preset.name}</h5>
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
              <h6 className="font-semibold">Objectif pédagogique</h6>
              <p className="mt-0.5 break-words leading-relaxed text-muted-foreground">
                {preset.pedagogy.learningObjective}
              </p>
            </div>
            <div>
              <h6 className="font-semibold">Phénomène observé</h6>
              <p className="mt-0.5 break-words leading-relaxed text-muted-foreground">
                {preset.pedagogy.observedPhenomenon}
              </p>
            </div>
            <div>
              <h6 className="font-semibold">Paramètres principaux</h6>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {preset.pedagogy.keyParameters.map((parameter) => (
                  <li key={parameter} className="break-words">
                    {parameter}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h6 className="font-semibold">À modifier</h6>
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
              <h6 className="font-semibold">Résultat attendu</h6>
              <p className="mt-0.5 break-words leading-relaxed text-muted-foreground">
                {preset.pedagogy.expectedResult}
              </p>
            </div>
            <div>
              <h6 className="font-semibold">Limite ou avertissement</h6>
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
}

function GravityPresetList({
  presets,
  onLoad,
}: GravityPresetCatalogProps) {
  return (
    <ul className="mt-2 grid min-w-0 grid-cols-1 gap-1.5">
      {presets.map((preset) => (
        <GravityPresetCard key={preset.id} preset={preset} onLoad={onLoad} />
      ))}
    </ul>
  );
}

export const GravityPresetCatalog = memo(function GravityPresetCatalog({
  presets,
  onLoad,
}: GravityPresetCatalogProps) {
  const showcasePresets = presets.filter(
    (preset) => presentGravityPresetShowcase(preset.id) !== null
  );
  const otherPresets = presets.filter(
    (preset) => presentGravityPresetShowcase(preset.id) === null
  );

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

      {showcasePresets.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/85">
            Recommandés · expériences vitrines
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Trois parcours complémentaires pour découvrir rapidement les
            capacités principales du laboratoire.
          </p>
          <GravityPresetList presets={showcasePresets} onLoad={onLoad} />
        </div>
      ) : null}

      {otherPresets.length > 0 ? (
        <div className="mt-5 border-t border-border/50 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Autres scénarios
          </h4>
          <GravityPresetList presets={otherPresets} onLoad={onLoad} />
        </div>
      ) : null}
    </section>
  );
});
