import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PillProps = {
  children: ReactNode;
  className?: string;
};

export function Pill({ children, className }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm",
        className
      )}
    >
      {children}
    </span>
  );
}