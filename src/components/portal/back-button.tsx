"use client";

/**
 * BackButton — smart "go back" affordance used across detail pages.
 *
 * The naïve approach (`router.push("/orders")`) loses the user's
 * actual previous location. If they came from a search filter, a
 * deep-linked Slack URL, or another detail page, hardcoding the back
 * destination drops them at the top of the list and forces them to
 * re-navigate.
 *
 * This component decides at click time:
 *
 *   1. If the immediate `document.referrer` is on our origin AND the
 *      browser has at least one prior history entry, use `router.back()`
 *      so the system back-button behaviour is preserved.
 *   2. Otherwise — direct URL landing, external link, fresh tab — push
 *      the supplied `fallback` so the user lands somewhere sensible
 *      instead of the empty new-tab page.
 *
 * The check runs on click rather than on mount so SSR + hydration
 * don't disagree on what's rendered.
 *
 * Default visual is the same "← Back" mono-eyebrow link used across
 * the existing detail pages, so a global swap keeps the UI consistent.
 */

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

interface BackButtonProps {
  /**
   * Where to navigate if the browser has no usable history (direct
   * URL landing, external referrer, fresh tab). Required so we never
   * leave the user stranded.
   */
  fallback: string;
  /** Override the default "← Back" label. */
  label?: ReactNode;
  /** Override the default mono-eyebrow class. */
  className?: string;
}

export function BackButton({
  fallback,
  label = "← Back",
  className,
}: BackButtonProps): JSX.Element {
  const router = useRouter();

  function onClick(): void {
    // Guard for SSR — onClick only fires client-side, but TypeScript
    // doesn't know that.
    if (typeof window === "undefined") {
      router.push(fallback);
      return;
    }

    // Same-origin referrer means the user navigated to this page from
    // somewhere inside our app, so there's a history entry worth
    // popping. `document.referrer` is empty (a) on direct URL load,
    // (b) when the source page sent `Referrer-Policy: no-referrer`,
    // (c) for many cross-origin transitions.
    let canPop = false;
    try {
      if (document.referrer) {
        const ref = new URL(document.referrer);
        if (ref.origin === window.location.origin) canPop = true;
      }
    } catch {
      // URL parse failures = treat as no usable referrer.
    }

    // Belt-and-braces: history.length is unreliable across browsers
    // (Chrome caps it, Safari sometimes lies) but a value > 1 alongside
    // a same-origin referrer is a strong signal we can pop safely.
    if (canPop && window.history.length > 1) {
      router.back();
      return;
    }

    // No useful history → land somewhere sensible instead of a 404 or
    // a blank tab.
    router.push(fallback);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
      }
    >
      {label}
    </button>
  );
}
