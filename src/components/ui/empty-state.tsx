import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-cream-soft px-8 py-16 text-center",
        className,
      )}
    >
      <div className="font-mono text-mono-eyebrow uppercase text-text-subtle">[empty]</div>
      <h3 className="mt-3 text-h2 font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-body-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
