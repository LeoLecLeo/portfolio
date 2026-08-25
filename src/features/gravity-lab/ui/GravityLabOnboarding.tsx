const GETTING_STARTED_STEPS = Object.freeze([
  Object.freeze({
    title: "Choisir une expérience",
    description:
      "Ouvrez « Scénarios / presets » avec le lanceur dédié. Le preset choisi charge uniquement le brouillon.",
  }),
  Object.freeze({
    title: "Appliquer le scénario",
    description:
      "Utilisez « Appliquer et réinitialiser » pour valider le brouillon et créer une session à t = 0, en pause.",
  }),
  Object.freeze({
    title: "Lancer la simulation",
    description:
      "« Lecture » démarre ou reprend l’évolution. « Stop » la met en pause sans effacer son état physique.",
  }),
  Object.freeze({
    title: "Explorer",
    description:
      "Manipulez la caméra et les visualisations, puis ouvrez « Corps et paramètres » pour modifier le scénario.",
  }),
] as const);

const SCIENTIFIC_FAMILIES = Object.freeze([
  Object.freeze({
    name: "Newtonien",
    description:
      "Simulation N-corps 3D classique, intégrée avec Velocity Verlet.",
  }),
  Object.freeze({
    name: "Relativité 1PN",
    description:
      "Premières corrections relativistes N-corps en champ faible, intégrées avec RK4. Ce n’est pas la relativité générale complète.",
  }),
  Object.freeze({
    name: "Schwarzschild",
    description:
      "Module séparé autour d’une masse sphérique fixe : géodésiques massives et lumineuses, horizon, sphère de photons et ISCO.",
  }),
] as const);

export function GravityLabOnboarding() {
  return (
    <section
      aria-labelledby="gravity-lab-getting-started-title"
      className="mb-6 overflow-hidden rounded-2xl border border-border/60 bg-card/55 shadow-[0_18px_55px_-42px_rgba(0,0,0,0.8)]"
    >
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.48fr)] lg:items-start">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
            Prise en main
          </p>
          <h2
            id="gravity-lab-getting-started-title"
            className="mt-1 text-xl font-semibold tracking-tight"
          >
            Une expérience en quatre gestes
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Choisissez un cadre scientifique, appliquez ses conditions initiales,
            lancez le temps puis explorez la scène sans perdre l’accès aux
            réglages avancés.
          </p>
        </div>

        <aside
          aria-label="Point de départ recommandé"
          className="rounded-xl border border-primary/25 bg-primary/7 px-3.5 py-3 text-sm"
        >
          <p className="font-semibold text-primary">Démarrage immédiat</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            Le système binaire incliné Newtonien est déjà appliqué. Cliquez
            directement sur <strong className="text-foreground">Lecture</strong>{" "}
            pour observer son orbite 3D.
          </p>
        </aside>
      </div>

      <ol className="grid gap-px border-y border-border/50 bg-border/45 sm:grid-cols-2 lg:grid-cols-4">
        {GETTING_STARTED_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="min-w-0 bg-background/85 px-4 py-3.5"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full border border-primary/35 bg-primary/8 text-xs font-semibold text-primary"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Trois familles scientifiques
        </p>
        <ul className="mt-3 grid gap-2 md:grid-cols-3">
          {SCIENTIFIC_FAMILIES.map((family) => (
            <li
              key={family.name}
              className="min-w-0 rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5"
            >
              <h3 className="text-sm font-semibold text-foreground">
                {family.name}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {family.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
