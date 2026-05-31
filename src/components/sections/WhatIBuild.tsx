export function WhatIBuild() {
  return (
    <section id="about" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-blue-400">
          Ce que je construis
        </p>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Des produits web propres, utiles et orientés utilisateur.
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <article className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
          <h3 className="text-xl font-semibold">Applications web</h3>
          <p className="mt-4 leading-7 text-neutral-400">
            Interfaces modernes, responsives et maintenables avec React, Next.js
            et TypeScript.
          </p>
        </article>

        <article className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
          <h3 className="text-xl font-semibold">Systèmes IA</h3>
          <p className="mt-4 leading-7 text-neutral-400">
            Intégration de LLM, assistants IA, recherche sémantique,
            automatisation et workflows intelligents.
          </p>
        </article>

        <article className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
          <h3 className="text-xl font-semibold">Backend & data</h3>
          <p className="mt-4 leading-7 text-neutral-400">
            APIs, bases de données, logique métier, pipelines de données et
            déploiement cloud.
          </p>
        </article>
      </div>
    </section>
  );
}