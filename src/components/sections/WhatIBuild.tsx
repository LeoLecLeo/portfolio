import { Brain, Code2, Cpu, Layers } from "lucide-react";

import { Pill } from "@/components/Pill";

const highlights = [
  {
    icon: Code2,
    title: "Développement logiciel",
    description:
      "Conception de projets structurés avec une logique claire, du code maintenable et une attention portée à l’architecture.",
  },
  {
    icon: Brain,
    title: "Intelligence artificielle",
    description:
      "Intégration de modèles IA, assistants intelligents, recherche sémantique et automatisation de tâches complexes.",
  },
  {
    icon: Cpu,
    title: "Sciences & modélisation",
    description:
      "Utilisation de bases en physique et mathématiques  pour aborder des problèmes techniques avec méthode et rigueur.",
  },
  {
    icon: Layers,
    title: "Applications complètes",
    description:
      "Création d’interfaces, d’APIs et de systèmes connectés pour transformer une idée technique en projet utilisable.",
  },
];

export function WhatIBuild() {
  return (
    <section id="about" className="scroll-mt-20 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <Pill className="mb-5">Ce que je construis</Pill>

            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Des projets techniques entre logiciel, IA et sciences appliquées.
            </h2>

            <p className="mt-5 text-pretty leading-relaxed text-muted-foreground">
              Je construis des projets concrets qui combinent développement
              logiciel, intelligence artificielle, interfaces modernes et
              raisonnement scientifique.
            </p>

            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              Mon objectif est de progresser vers un profil informatique
              polyvalent, capable de comprendre un problème technique, de le
              structurer et de développer une solution claire, fiable et
              utilisable.
            </p>
          </div>

          <div className="grid gap-4">
            {highlights.map((item) => (
              <article
                key={item.title}
                className="flex items-start gap-4 rounded-2xl border border-border/80 bg-card/60 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm transition-colors hover:border-primary/30"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>

                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {item.title}
                  </h3>

                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}