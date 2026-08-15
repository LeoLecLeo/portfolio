import type { Metadata } from "next";
import Link from "next/link";

import { GravityLabPrototype } from "@/features/gravity-lab/ui/GravityLabPrototype";

export const metadata: Metadata = {
  title: "Laboratoire gravitationnel | Léo Lecuyer",
  description:
    "Prototype tridimensionnel d’un laboratoire newtonien N-corps, avec intégration Velocity Verlet et diagnostics scientifiques.",
};

export default function GravityLabPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div className="absolute left-1/3 top-[-12rem] h-160 w-160 rounded-full bg-primary/12 blur-[120px]" />
        <div className="absolute right-[-12rem] top-[30rem] h-112 w-112 rounded-full bg-chart-2/10 blur-[120px]" />
      </div>

      <main className="mx-auto max-w-6xl px-3 py-8 sm:px-6 sm:py-10 md:py-16">
        <Link
          href="/"
          className="inline-flex rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
        >
          ← Retour au portfolio
        </Link>

        <header className="mb-10 mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            Laboratoire gravitationnel
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Un noyau scientifique 3D, rendu en temps réel
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
            Explorez des scénarios newtoniens N-corps, modifiez leurs
            conditions initiales et observez leur évolution dans une scène 3D
            interactive accompagnée de diagnostics scientifiques.
          </p>
        </header>

        <GravityLabPrototype />

        <section className="mt-10 grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-3">
          <article className="rounded-xl border border-border/80 bg-card/50 p-5">
            <h2 className="font-semibold text-foreground">
              Modèle actuellement présenté
            </h2>
            <p className="mt-2">
              Gravitation newtonienne N-corps en trois dimensions et
              intégration Velocity Verlet à pas fixe.
            </p>
          </article>
          <article className="rounded-xl border border-border/80 bg-card/50 p-5">
            <h2 className="font-semibold text-foreground">
              Limites assumées
            </h2>
            <p className="mt-2">
              Le laboratoire public accepte de 1 à 16 corps et reste dans un
              domaine newtonien explicitement contrôlé. Les expériences
              relativistes seront des modules distincts.
            </p>
          </article>
          <article className="rounded-xl border border-border/80 bg-card/50 p-5">
            <h2 className="font-semibold text-foreground">
              Arrêts scientifiques
            </h2>
            <p className="mt-2">
              Une collision, une rencontre non résolue ou un budget de pas
              dépassé interrompt explicitement la simulation au lieu de
              masquer le problème.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
