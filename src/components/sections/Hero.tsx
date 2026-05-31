import { profile } from "@/data/profileData";

export function Hero() {
  return (
    <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-24">
      <div className="max-w-4xl">
        <p className="mb-6 text-sm font-medium uppercase tracking-[0.35em] text-blue-400">
          Portfolio développeur IA
        </p>

        <h1 className="text-5xl font-bold tracking-tight text-white md:text-7xl">
          {profile.role}
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-300">
          Je conçois des applications web modernes, rapides et maintenables,
          avec une attention particulière pour les systèmes IA utiles : LLM, RAG,
          APIs, automatisation et interfaces produit.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <a
            href="#projects"
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200"
          >
            Voir mes projets
          </a>

          <a
            href={profile.cv}
            className="rounded-full border border-neutral-700 px-6 py-3 text-sm font-semibold text-white transition hover:border-neutral-400 hover:bg-neutral-900"
          >
            Télécharger mon CV
          </a>
        </div>
      </div>
    </section>
  );
}