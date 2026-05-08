/**
 * ErrorBanner — form-level error display.
 *
 * Style: amber accent for warnings (rate limit, in-progress), error red
 * for blocking failures (5xx, transport, validation). Border-left + tinted
 * background, mirrors the existing form-error pattern in use across the
 * portal so this slots in without visual mismatch.
 *
 * Accessibility: `role="alert"` so screen readers announce on appearance.
 * Heading is the catalog title; body is the catalog body. The optional
 * action button is rendered as a link (when href) or a button (when handler);
 * the calling page resolves handler keys to callbacks via onAction.
 */

"use client";

import Link from "next/link";

import type { NormalizedError } from "@/lib/errors";

interface ErrorBannerProps {
  error: NormalizedError | null;
  /**
   * Resolves handler keys (retry / signin / support / verifyEmail / topUp)
   * into actual callbacks. Pages opt in to handlers they support — for
   * example, the login page might map `verifyEmail` to a resend call.
   * Unmapped handlers render as inert text (no button at all).
   */
  onAction?: (handler: NonNullable<NormalizedError["entry"]["action"]>["handler"]) => void;
  className?: string;
}

const TONE: Record<"warning" | "error", { border: string; bg: string; text: string }> = {
  warning: { border: "border-amber", bg: "bg-amber/10", text: "text-amber" },
  error: { border: "border-error", bg: "bg-error/10", text: "text-error" },
};

function toneFor(error: NormalizedError): "warning" | "error" {
  if (error.code === "rate_limited") return "warning";
  if (error.status && error.status >= 500) return "error";
  if (error.code === "network_5xx" || error.code === "network_cors_or_blocked") return "error";
  if (error.code === "network_offline" || error.code === "network_timeout") return "warning";
  // Default: most 4xx errors are user-correctable, render in error red so
  // they're hard to miss.
  return "error";
}

export function ErrorBanner({ error, onAction, className }: ErrorBannerProps): JSX.Element | null {
  if (!error) return null;

  const tone = TONE[toneFor(error)];
  const action = error.entry.action;

  return (
    <div
      role="alert"
      className={`rounded-md border-l-4 ${tone.border} ${tone.bg} px-4 py-3 ${className ?? ""}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className={`font-mono text-mono-label uppercase ${tone.text}`}>
            {error.entry.title}
          </div>
          <p className="mt-1 text-body-sm text-text">{error.entry.body}</p>
          {error.correlationId ? (
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[1px] text-text-subtle">
              Reference: {error.correlationId.slice(0, 12)}
            </div>
          ) : null}
        </div>

        {action ? (
          action.href ? (
            <Link
              href={action.href}
              className={`shrink-0 self-start whitespace-nowrap font-mono text-[11px] uppercase tracking-[1.2px] ${tone.text} hover:underline underline-offset-4`}
            >
              {action.label} →
            </Link>
          ) : action.handler && onAction ? (
            <button
              type="button"
              onClick={() => onAction(action.handler!)}
              className={`shrink-0 self-start whitespace-nowrap font-mono text-[11px] uppercase tracking-[1.2px] ${tone.text} hover:underline underline-offset-4`}
            >
              {action.label} →
            </button>
          ) : null
        ) : null}
      </div>
    </div>
  );
}
