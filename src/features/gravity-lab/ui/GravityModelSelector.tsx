"use client";

import { memo } from "react";

import type { GravityModelId } from "../physics/gravityModel";
import { ContextualHelp } from "./ContextualHelp";

export type GravityModelSelectorProps = Readonly<{
  modelId: GravityModelId;
  onChange: (modelId: GravityModelId) => void;
}>;

const OPTIONS = Object.freeze([
  Object.freeze({
    id: "newtonian" as const,
    label: "Newtonien",
    integrator: "Velocity Verlet",
  }),
  Object.freeze({
    id: "first-post-newtonian" as const,
    label: "Relativité 1PN",
    integrator: "RK4 fixe",
  }),
]);

export const GravityModelSelector = memo(function GravityModelSelector({
  modelId,
  onChange,
}: GravityModelSelectorProps) {
  return (
    <fieldset className="min-w-0 border-b border-border/55 pb-3">
      <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Modèle gravitationnel
      </legend>
      <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = option.id === modelId;

          return (
            <label
              key={option.id}
              className={
                selected
                  ? "flex min-w-0 cursor-pointer items-start gap-2 rounded-md border border-primary/55 bg-primary/10 px-2.5 py-2 text-primary focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
                  : "flex min-w-0 cursor-pointer items-start gap-2 rounded-md border border-border/55 bg-secondary/25 px-2.5 py-2 text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 motion-reduce:transition-none"
              }
            >
              <input
                type="radio"
                name="gravity-model"
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                className="mt-0.5 shrink-0 accent-current"
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[0.6875rem] leading-tight opacity-80">
                  {option.integrator}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <ContextualHelp
        summary="À propos du modèle 1PN"
        description="Le modèle EIH 1PN est la première approximation post-newtonienne N-corps de la relativité générale. Intégré ici avec RK4, il s’applique en champ faible et à des vitesses non relativistes ; ce n’est pas la relativité générale complète."
      />
    </fieldset>
  );
});
