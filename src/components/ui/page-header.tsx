import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps): JSX.Element {
  return (
    <header className="flex flex-col gap-3 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <div className="font-mono text-mono-eyebrow uppercase text-amber">{eyebrow}</div>
        ) : null}
        <h1 className="mt-2 text-h1 font-semibold tracking-[-0.4px] text-ink">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-body-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
