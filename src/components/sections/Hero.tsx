import { ArrowRight, Cpu, FileText, Sparkles } from "lucide-react";

import { Pill } from "@/components/Pill";
import { profile } from "@/data/profileData";

export function Hero() {
  return (
    <section className="relative px-6 pb-16 pt-20 md:pb-24 md:pt-28">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <Pill className="mb-8">
          <span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Sparkles className="size-2.5" aria-hidden="true" />
          </span>
          Portfolio informatique & IA
        </Pill>

        <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
          Je construis des projets{" "}
          <span className="text-primary">logiciels, IA et scientifiques.</span>
        </h1>

        <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
          {profile.role}. Je développe des projets concrets mêlant interfaces
          modernes, backend, intelligence artificielle, logique produit et raisonnement scientifique.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <a
            href="#projects"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Voir mes projets
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>

          <a
            href={profile.cv}
            className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-card/60 px-5 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition hover:bg-secondary/60"
          >
            Télécharger mon CV
          </a>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Cpu className="size-4 text-primary/80" aria-hidden="true" />
            Développement logiciel
          </span>

          <span className="inline-flex items-center gap-2">
            <FileText className="size-4 text-primary/80" aria-hidden="true" />
            Sciences & modélisation
          </span>

          <span className="inline-flex items-center gap-2">
            <Sparkles className="size-4 text-primary/80" aria-hidden="true" />
            IA appliquée
          </span>
        </div>
      </div>
    </section>
  );
}