import { projects } from "@/data/projectsData";

export function Projects() {
  return (
    <section id="projects" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-blue-400">
          Projets
        </p>

        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Des projets pensés comme des preuves de compétence.
        </h2>
      </div>

      <div className="grid gap-6">
        {projects.map((project) => {
          const isClickable = Boolean(project.demoUrl);

          const cardContent = (
            <>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-semibold">
                      {project.title}
                    </h3>

                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                      {project.status}
                    </span>
                  </div>

                  <p className="max-w-3xl leading-7 text-neutral-400">
                    {project.description}
                  </p>
                </div>

                {isClickable && (
                  <span className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition group-hover:border-blue-400/50 group-hover:text-blue-300">
                    Ouvrir le projet
                  </span>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {project.stack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300"
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
                className="group block cursor-pointer rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 transition hover:-translate-y-1 hover:border-blue-400/40 hover:bg-neutral-900"
              >
                {cardContent}
              </a>
            );
          }

          return (
            <article
              key={project.title}
              className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 transition hover:border-neutral-600"
            >
              {cardContent}
            </article>
          );
        })}
      </div>
    </section>
  );
}