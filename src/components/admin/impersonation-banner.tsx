"use client";

/**
 * ImpersonationBanner — a persistent warning shown whenever the current session
 * is a super-admin impersonating another user ("view as vendor"). Rendered
 * app-wide (mounted in the root layout) so it's visible on every page while
 * impersonating. "Exit" restores the admin session via /auth/refresh — the
 * admin's own refresh cookie was never replaced by impersonation, so a refresh
 * cleanly brings the operator back.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/lib/auth-context";

export function ImpersonationBanner(): JSX.Element | null {
  const { user, stopImpersonation } = useAuth();
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  if (!user?.impersonatedBy) return null;

  async function exit(): Promise<void> {
    setExiting(true);
    try {
      await stopImpersonation(); // clears the stashed token, refreshes back to admin
    } finally {
      router.push("/admin/users");
    }
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-3 border-b border-ink/20 bg-amber px-4 py-2 text-ink shadow-1">
      <span className="font-mono text-[11px] uppercase tracking-[1.2px]">
        Viewing as <strong>{user.email}</strong> — anything you do affects this account
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        className="rounded-sm border border-ink/40 bg-white/70 px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[1.2px] text-ink hover:bg-white disabled:opacity-50"
      >
        {exiting ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
