import { ArrowUpRight, FolderKanban, Sparkles } from "lucide-react";

import { Pill } from "@/components/Pill";
import { projects } from "@/data/projectsData";

export function Projects() {
  return (
    <section id="projects" className="scroll-mt-20 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 max-w-2xl">
          <Pill className="mb-5">
            <FolderKanban className="size-3.5 text-primary" />
            Projets
          </Pill>

          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Des projets pensés comme des preuves de compétence.
          </h2>

          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Chaque projet est construit pour démontrer une compétence concrète :
            architecture, expérience utilisateur, intégration IA, backend,
            frontend ou logique produit.
          </p>
        </div>

        <div className="grid gap-5">
          {projects.map((project) => {
            const isClickable = Boolean(project.demoUrl);

            const cardContent = (
              <>
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                        <Sparkles className="size-5" aria-hidden="true" />
                      </span>

                      <div>
                        <h3 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                          {project.title}
                        </h3>

                        <span className="mt-2 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                          {project.status}
                        </span>
                      </div>
                    </div>

                    <p className="max-w-3xl text-pretty leading-7 text-muted-foreground">
                      {project.description}
                    </p>
                  </div>

                  {isClickable && (
                    <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border/80 bg-secondary/40 px-4 py-2 text-sm font-medium text-muted-foreground transition group-hover:border-primary/40 group-hover:text-primary">
                      Ouvrir le projet
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </span>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {project.stack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md border border-border/70 bg-secondary/50 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </>
            );

            if (isClickable) {
              return (
                <a
                  key={project.title}
                  href={project.demoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group block cursor-pointer rounded-2xl border border-border/80 bg-card/60 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm transition hover:-translate-y-1 hover:border-primary/40 hover:bg-card/80"
                >
                  {cardContent}
                </a>
              );
            }

            return (
              <article
                key={project.title}
                className="rounded-2xl border border-border/80 bg-card/60 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm transition hover:border-primary/25"
              >
                {cardContent}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}