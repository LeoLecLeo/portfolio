import { profile } from "@/data/profileData";

export function Contact() {
  return (
    <section id="contact" className="mx-auto max-w-6xl px-6 py-24">
      <div className="rounded-3xl border border-neutral-800 bg-white p-8 text-neutral-950 md:p-12">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-blue-600">
          Contact
        </p>

        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Discutons d’un poste, d’un projet ou d’une opportunité.
        </h2>

        <p className="mt-5 max-w-2xl leading-7 text-neutral-600">
          Je suis à la recherche d’opportunités en développement web, full-stack
          ou IA appliquée. Vous pouvez me contacter par email, LinkedIn ou
          GitHub.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <a
            href={`mailto:${profile.email}`}
            className="rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Me contacter
          </a>

          <a
            href={profile.github}
            className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold transition hover:bg-neutral-100"
          >
            GitHub
          </a>

          <a
            href={profile.linkedin}
            className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold transition hover:bg-neutral-100"
          >
            LinkedIn
          </a>
        </div>
      </div>
    </section>
  );
}