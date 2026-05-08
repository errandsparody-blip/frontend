/**
 * ErrorPage — full-page error surface.
 *
 * Used for layout-level failures: 404 not-found, 403 forbidden, 500
 * server crash, session-expired auth-page redirects. Branded so the user
 * always knows they're still on USA Errands rather than landing on a
 * generic Next.js or browser error page.
 *
 * Layout: centred column, mono eyebrow + display-size title + body
 * paragraph + action button. Same rhythm as the auth shell so the design
 * is recognisably part of the same product.
 */

"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  /** Mono-eyebrow code (e.g., "404", "500", "[ERROR]"). */
  code: string;
  title: string;
  body: string;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href: string };
  /** Correlation id for support tickets. Surfaces a small reference line. */
  correlationId?: string;
}

export function ErrorPage({
  code,
  title,
  body,
  primaryAction,
  secondaryAction,
  correlationId,
}: ErrorPageProps): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="font-mono text-mono-eyebrow uppercase tracking-[1.6px] text-amber">
          {code}
        </div>
        <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
          {title}
        </h1>
        <p className="mt-4 text-body text-text-muted">{body}</p>

        {correlationId ? (
          <div className="mt-4 font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
            Reference: {correlationId.slice(0, 16)}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {primaryAction ? (
            primaryAction.href ? (
              <Link href={primaryAction.href}>
                <Button variant="primary" size="lg" withArrow>
                  {primaryAction.label}
                </Button>
              </Link>
            ) : (
              <Button
                variant="primary"
                size="lg"
                withArrow
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </Button>
            )
          ) : null}
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
            >
              {secondaryAction.label} →
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
