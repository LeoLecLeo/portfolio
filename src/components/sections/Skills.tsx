import { Brain, Code2, Database, Server } from "lucide-react";

import { Pill } from "@/components/Pill";

const skillGroups = [
  {
    icon: Code2,
    title: "Frontend",
    skills: ["Next.js", "React", "TypeScript", "Tailwind CSS"],
  },
  {
    icon: Server,
    title: "Backend",
    skills: ["FastAPI", "Python", "REST API", "Architecture API"],
  },
  {
    icon: Brain,
    title: "IA & RAG",
    skills: ["OpenAI", "LLM", "Embeddings", "Recherche sémantique"],
  },
  {
    icon: Database,
    title: "Données & outils",
    skills: ["ChromaDB", "Git", "Vector store", "Pipelines"],
  },
];

export function Skills() {
  return (
    <section id="skills" className="scroll-mt-20 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 max-w-2xl">
          <Pill className="mb-5">Compétences</Pill>

          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Une stack moderne pour construire des projets concrets.
          </h2>

          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Les technologies que j’utilise pour créer des applications web
            solides, des interfaces propres et des fonctionnalités IA utiles.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {skillGroups.map((group) => (
            <article
              key={group.title}
              className="rounded-2xl border border-border/80 bg-card/60 p-5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm transition-colors hover:border-primary/30"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <group.icon className="size-5" aria-hidden="true" />
              </span>

              <h3 className="mt-4 text-sm font-semibold text-foreground">
                {group.title}
              </h3>

              <ul className="mt-3 flex flex-wrap gap-2">
                {group.skills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-md border border-border/70 bg-secondary/50 px-2 py-1 text-xs text-muted-foreground"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}