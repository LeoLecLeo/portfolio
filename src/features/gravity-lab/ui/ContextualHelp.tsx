import { memo } from "react";

import type { GravityLabHelpItem } from "./gravityLabHelp";

export type ContextualHelpProps = Readonly<{
  summary: string;
  description?: string;
  items?: readonly GravityLabHelpItem[];
}>;

export const ContextualHelp = memo(function ContextualHelp({
  summary,
  description,
  items = [],
}: ContextualHelpProps) {
  return (
    <details className="group mt-3 min-w-0 overflow-hidden rounded-md border border-border/45 bg-background/20 text-xs">
      <summary className="cursor-pointer list-none rounded-md px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-words">{summary}</span>
          <span
            aria-hidden="true"
            className="text-base transition-transform group-open:rotate-45 motion-reduce:transition-none"
          >
            +
          </span>
        </span>
      </summary>
      <div className="border-t border-border/45 px-3 py-3 text-muted-foreground">
        {description === undefined ? null : (
          <p className="break-words leading-relaxed">{description}</p>
        )}
        {items.length === 0 ? null : (
          <dl className="space-y-3">
            {items.map((item) => (
              <div key={item.term}>
                <dt className="font-semibold text-foreground">
                  {item.term}
                </dt>
                <dd className="mt-0.5 break-words leading-relaxed">
                  {item.description}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  );
});
