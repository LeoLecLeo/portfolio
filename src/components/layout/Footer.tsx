import { profile } from "@/data/profileData";

export function Footer() {
  return (
    <footer className="border-t border-border/60 px-6 py-8">
      <div className="mx-auto flex max-w-6xl justify-center text-center text-sm text-muted-foreground">
        <p>© 2026 {profile.name} · Ingénieur informatique</p>
      </div>
    </footer>
  );
}