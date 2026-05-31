import { skills } from "@/data/skillsData";


export function Skills() {
  return (
    <section id="skills" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-blue-400">
          Compétences
        </p>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Une stack moderne pour construire des projets concrets.
        </h2>
      </div>

      <div className="flex flex-wrap gap-3">
        {skills.map((skill) => (
          <span
            key={skill}
            className="rounded-full border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm text-neutral-300"
          >
            {skill}
          </span>
        ))}
      </div>
    </section>
  );
}