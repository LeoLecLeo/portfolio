import type { Metadata } from "next";
import Link from "next/link";

import { GravityLabOnboarding } from "@/features/gravity-lab/ui/GravityLabOnboarding";
import { GravityLabPrototype } from "@/features/gravity-lab/ui/GravityLabPrototype";

export const metadata: Metadata = {
  title: "Laboratoire gravitationnel | Léo Lecuyer",
  description:
    "Laboratoire gravitationnel 3D réunissant gravitation newtonienne N-corps, approximation EIH 1PN et expérience extérieure de Schwarzschild.",
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
            De Newton à Schwarzschild, un laboratoire 3D
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
            Explorez des systèmes N-corps Newtoniens ou 1PN, modifiez leurs
            conditions initiales et observez des géodésiques de Schwarzschild
            dans des expériences 3D distinctes et scientifiquement délimitées.
          </p>
        </header>

        <GravityLabOnboarding />
        <GravityLabPrototype />

        <section className="mt-12 grid gap-6 border-t border-border/45 pt-6 text-sm leading-6 text-muted-foreground md:grid-cols-3 md:gap-8">
          <article className="border-l-2 border-primary/20 pl-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/85">
              Trois cadres scientifiques
            </h2>
            <p className="mt-2">
              Gravitation newtonienne N-corps avec Velocity Verlet, première
              approximation post-newtonienne EIH avec RK4, et solution
              extérieure de Schwarzschild dans un module indépendant.
            </p>
          </article>
          <article className="border-l-2 border-border/55 pl-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/85">
              Limites assumées
            </h2>
            <p className="mt-2">
              Les scénarios N-corps acceptent de 1 à 16 corps. Le 1PN reste
              limité au champ faible et aux vitesses non relativistes ; le
              module Schwarzschild utilise uniquement la carte extérieure.
            </p>
          </article>
          <article className="border-l-2 border-border/55 pl-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/85">
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
