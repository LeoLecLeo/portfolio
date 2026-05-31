import { Layers, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { Pill } from "@/components/Pill";

const highlights = [
  {
    icon: Layers,
    title: "Applications web",
    description:
      "Interfaces modernes, responsives et maintenables avec React, Next.js, TypeScript et Tailwind CSS.",
  },
  {
    icon: Sparkles,
    title: "Systèmes IA",
    description:
      "Intégration de LLM, assistants IA, recherche sémantique, RAG et workflows intelligents.",
  },
  {
    icon: Zap,
    title: "Backend & APIs",
    description:
      "APIs robustes, logique métier claire, traitement de documents et services connectés à des modèles IA.",
  },
  {
    icon: ShieldCheck,
    title: "Qualité produit",
    description:
      "Code structuré, expérience utilisateur soignée, composants réutilisables et attention aux détails.",
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
              Des produits web propres, utiles et orientés IA.
            </h2>

            <p className="mt-5 text-pretty leading-relaxed text-muted-foreground">
              Je construis des applications qui combinent interfaces modernes,
              logique backend solide et intégration d’intelligence artificielle.
              Mon objectif est de transformer une idée technique en produit
              clair, utilisable et professionnel.
            </p>

            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              J’accorde beaucoup d’importance à la structure du code, à la
              maintenabilité, au design de l’expérience utilisateur et à la
              cohérence visuelle des projets.
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