import { profile } from "@/data/profileData";

export function Header() {
  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#" className="text-sm font-semibold tracking-wide text-white">
          Léole<span className="text-blue-400">.dev</span>
        </a>

        <div className="hidden items-center gap-8 text-sm text-neutral-300 md:flex">
          <a href="#" className="transition hover:text-white">
            Accueil
          </a>
          <a href="#projects" className="transition hover:text-white">
            Projets
          </a>
          <a href="#skills" className="transition hover:text-white">
            Compétences
          </a>
          <a href="#contact" className="transition hover:text-white">
            Contact
          </a>
        </div>

        <a
          href={profile.cv}
          className="hidden rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-white transition hover:border-neutral-400 hover:bg-neutral-900 md:inline-flex"
        >
          Télécharger CV
        </a>
      </nav>
    </header>
  );
}