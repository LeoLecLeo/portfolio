"use client";

import { useState } from "react";
import { Menu, Sparkles, X } from "lucide-react";

import { profile } from "@/data/profileData";

const navLinks = [
  { label: "À propos", href: "#about" },
  { label: "Compétences", href: "#skills" },
  { label: "Projets", href: "#projects" },
  { label: "Contact", href: "#contact" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href="#" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>

            <span className="text-sm font-semibold tracking-tight text-foreground">
              {profile.name}
              <span className="text-muted-foreground">
                {" "}
                / Ingénieur informatique
              </span>
            </span>
          </a>

          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </div>

          <a
            href={`mailto:${profile.email}`}
            className="hidden rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 md:inline-flex"
          >
            Me contacter
          </a>

          <button
            type="button"
            onClick={() => setOpen((currentValue) => !currentValue)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border/80 bg-card/60 text-foreground md:hidden"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {open ? (
              <X className="size-4" aria-hidden="true" />
            ) : (
              <Menu className="size-4" aria-hidden="true" />
            )}
          </button>
        </nav>

        {open && (
          <div className="border-t border-border/60 bg-background/95 px-6 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}

              <a
                href={`mailto:${profile.email}`}
                onClick={() => setOpen(false)}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Me contacter
              </a>
            </div>
          </div>
        )}
      </header>

      <div className="h-16" aria-hidden="true" />
    </>
  );
}