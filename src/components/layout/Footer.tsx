import { profile } from "@/data/profileData";

export function Footer() {
  return (
    <footer className="border-t border-border/60 px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          © 2026 {profile.name} — Développeur IA & Web.
        </p>

        <p>Conçu avec Next.js & Tailwind CSS.</p>
      </div>
    </footer>
  );
}