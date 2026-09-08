import type { Metadata } from "next";
import Link from "next/link";

import { GravityLabOnboarding } from "@/features/gravity-lab/ui/GravityLabOnboarding";
import { GravityLabPrototype } from "@/features/gravity-lab/ui/GravityLabPrototype";

const title = "Gravity Lab — simulateur gravitationnel interactif | Léo Lecuyer";
const description =
  "Explorez la gravitation N-corps et les corrections relativistes EIH 1PN dans un laboratoire 3D interactif, éditable et scientifiquement validé.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    locale: "fr_FR",
  },
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
            Gravity Lab — de Newton aux corrections 1PN
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
            Comment rendre la gravitation observable sans sacrifier la rigueur
            du calcul ? Ce laboratoire associe un moteur N-corps éditable,
            les premières corrections relativistes EIH 1PN, avec des scénarios
            validés et des visualisations interactives.
          </p>
        </header>

        <GravityLabOnboarding />
        <GravityLabPrototype />

        <section className="mt-12 grid gap-6 border-t border-border/45 pt-6 text-sm leading-6 text-muted-foreground md:grid-cols-3 md:gap-8">
          <article className="border-l-2 border-primary/20 pl-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/85">
              Un résultat mesuré
            </h2>
            <p className="mt-2">
              La précession relativiste Soleil–Mercure est retrouvée à environ
              42,98″/siècle. Newtonien et 1PN utilisent tous deux RK4 pour cette
              comparaison : mêmes conditions initiales, même pas, contrôle
              newtonien et étude de convergence.
            </p>
          </article>
          <article className="border-l-2 border-border/55 pl-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/85">
              Du calcul à l’image
            </h2>
            <p className="mt-2">
              Physique pure, intégrateurs, validation, sessions et rendu sont
              séparés. Le noyau N-corps calcule en Float64 et en SI ; Vitest
              vérifie les références analytiques et le déterminisme des cas
              testés. Next.js, React et TypeScript portent l’interface,
              Three.js et React Three Fiber les scènes interactives.
            </p>
          </article>
          <article className="border-l-2 border-border/55 pl-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/85">
              Modèles délimités
            </h2>
            <p className="mt-2">
              Le Newtonien simule 1–16 corps avec Velocity Verlet. EIH 1PN
              reste limité au champ faible et aux vitesses non relativistes.
              Collisions et rencontres non résolues arrêtent la simulation.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
