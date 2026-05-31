import { profile } from "@/data/profileData";

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 text-sm text-neutral-400 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium text-white">
            {profile.name}<span className="text-blue-400">.dev</span>
          </p>
          <p className="mt-2">
            {profile.role}.
          </p>
        </div>

        <div className="flex flex-wrap gap-5">
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

        <p>© 2026 {profile.name}. Tous droits réservés.</p>
      </div>
    </footer>
  );
}