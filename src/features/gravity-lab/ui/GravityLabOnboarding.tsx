const GETTING_STARTED_STEPS = Object.freeze([
  Object.freeze({
    title: "Mettre en pause",
    description:
      "Cliquez sur « Stop » avant de changer de scénario, sans effacer la simulation actuelle.",
  }),
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
      "Cliquez sur « Lecture » pour démarrer le scénario appliqué.",
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
            Changer d’expérience en quatre gestes
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Pour essayer un autre scénario, suivez ces quatre étapes.
            Les réglages avancés restent disponibles dans « Corps et paramètres ».
          </p>
        </div>

        <aside
          aria-label="Point de départ recommandé"
          className="rounded-xl border border-primary/25 bg-primary/7 px-3.5 py-3 text-sm"
        >
          <p className="font-semibold text-primary">Démarrage immédiat</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            Le système binaire incliné Newtonien{" "}
            <strong className="text-foreground">démarre automatiquement</strong>{" "}
            dès que la scène est prête. Observez son orbite 3D et manipulez
            immédiatement la caméra et les visualisations.
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

    </section>
  );
}
