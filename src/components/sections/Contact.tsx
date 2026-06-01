import { ArrowRight, Mail, MessageCircle } from "lucide-react";

import { Pill } from "@/components/Pill";
import { profile } from "@/data/profileData";

export function Contact() {
  return (
    <section id="contact" className="scroll-mt-20 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/60 px-6 py-16 text-center shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_24px_48px_-24px_rgba(0,0,0,0.6)] backdrop-blur-sm md:px-12 md:py-20">
          <div
            className="pointer-events-none absolute left-1/2 top-0 size-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-2xl">
            <Pill className="mb-6">
              <MessageCircle className="size-3.5 text-primary" />
              Contact
            </Pill>

            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
              Ouvert à de nouvelles opportunités.
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground md:text-lg">
              Je recherche un environnement technique où je pourrai contribuer à des projets concrets, progresser dans un cadre professionnel et mettre en pratique mes compétences en développement logiciel, IA et sciences appliquées.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={`mailto:${profile.email}`}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                <Mail className="size-4" aria-hidden="true" />
                Me contacter
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>

              <a
                href={profile.github}
                target="_blank"
                rel="noreferrer"
                aria-label="Ouvrir mon GitHub"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-border/80 bg-secondary/40 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-secondary/70 hover:text-primary"
              >
                GH
              </a>

              <a
                href={profile.linkedin}
                target="_blank"
                rel="noreferrer"
                aria-label="Ouvrir mon LinkedIn"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-border/80 bg-secondary/40 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-secondary/70 hover:text-primary"
              >
                in
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}