"use client";

/**
 * HeaderCTA — auth-aware "log in / get started" vs "open portal".
 *
 * The marketing layout is a server component and we want to keep it
 * that way (metadata, SSR, less JS shipped). This small client
 * component is mounted on the right side of the header — it reads
 * the AuthContext and renders the appropriate buttons:
 *
 *   Loading           → skeleton-y placeholder, no flicker
 *   Signed-out        → "Log in" link + "Get started" amber button
 *   Vendor signed-in  → "Open dashboard" amber button (→ /dashboard)
 *   Admin signed-in   → "Open admin" amber button (→ /admin)
 *
 * Role routing uses `homeForRole` from auth-context so the marketing
 * header and the post-login flow always agree on destination.
 */

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { homeForRole, useAuth } from "@/lib/auth-context";

// Slick rounded-pill CTA matching the hero button: an amber pill with a
// white circle housing the arrow. Sentence case, not mono-caps, so it
// belongs to the new editorial header. Lifts slightly on hover.
function PillCTA({ href, label, ariaLabel }: { href: string; label: string; ariaLabel?: string }): JSX.Element {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="group inline-flex items-center gap-2 rounded-full bg-amber py-1.5 pl-5 pr-1.5 text-body-sm font-medium text-ink shadow-1 transition-transform duration-300 ease-out hover:-translate-y-0.5"
    >
      {label}
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-amber transition-transform duration-300 ease-out group-hover:translate-x-0.5">
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  );
}

export function HeaderCTA(): JSX.Element {
  const { user, loading } = useAuth();

  // While the session is being resolved, render a fixed-width
  // placeholder so the header doesn't shift when the auth state
  // lands. Empty string keeps it invisible but reserves space.
  if (loading) {
    return <div className="h-10 w-[150px]" aria-hidden />;
  }

  if (user) {
    const href = homeForRole(user);
    const isAdmin = href === "/admin";
    return (
      <PillCTA
        href={href}
        label={isAdmin ? "Open admin" : "Open dashboard"}
        ariaLabel={isAdmin ? "Open admin console" : "Open vendor dashboard"}
      />
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="hidden rounded-full px-4 py-2 text-body-sm text-text-2 transition-colors hover:text-ink md:inline"
      >
        Log in
      </Link>
      <PillCTA href="/signup" label="Get started" />
    </>
  );
}
