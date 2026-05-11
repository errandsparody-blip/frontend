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

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { homeForRole, useAuth } from "@/lib/auth-context";

export function HeaderCTA(): JSX.Element {
  const { user, loading } = useAuth();

  // While the session is being resolved, render a fixed-width
  // placeholder so the header doesn't shift when the auth state
  // lands. Empty string keeps it invisible but reserves space.
  if (loading) {
    return <div className="h-9 w-[140px]" aria-hidden />;
  }

  if (user) {
    const href = homeForRole(user);
    const isAdmin = href === "/admin";
    return (
      <Link href={href} aria-label={isAdmin ? "Open admin console" : "Open vendor dashboard"}>
        <Button variant="amber" size="md" withArrow>
          {isAdmin ? "Open admin" : "Open dashboard"}
        </Button>
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="hidden font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-text hover:text-amber md:inline"
      >
        Log in
      </Link>
      <Link href="/signup">
        <Button variant="amber" size="md" withArrow>
          Get started
        </Button>
      </Link>
    </>
  );
}
