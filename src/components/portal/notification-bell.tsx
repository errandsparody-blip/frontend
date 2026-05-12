"use client";

/**
 * NotificationBell — top-bar dropdown.
 *
 * Renders the bell icon + an unread badge (count, capped at "9+"). Clicking
 * the bell opens a small panel that lists the 5 most recent notifications;
 * clicking the row marks it read and navigates to the row's href if any.
 * "See all" routes to the full notifications page for whichever portal
 * this bell is mounted in (admin vs vendor).
 *
 * Polling is delegated to the underlying useUnreadCounts/useNotifications
 * hooks (30 s while the tab is visible) so the badge stays current
 * without any manual refresh.
 */

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCounts,
  severityTone,
  relativeTime,
  type AppNotification,
} from "@/lib/notifications";

interface NotificationBellProps {
  /** Where "See all" links to. Differs between admin (`/admin/notifications`) and vendor (`/notifications`). */
  seeAllHref: string;
}

export function NotificationBell({ seeAllHref }: NotificationBellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const countsQ = useUnreadCounts();
  // Pull the latest 5 — the dropdown is a glance, not a full archive.
  // The page-level view fetches a full page; this stays cheap.
  const listQ = useNotifications({ limit: 5 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  const total = countsQ.data?.total ?? 0;
  const badge = total === 0 ? null : total > 9 ? "9+" : String(total);

  // Close on outside click. We listen on mousedown so the click handler
  // for an inside element still fires before the outside detect runs.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on Escape — keyboard parity with the outside-click handler.
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  /**
   * Pull the most useful single-line diagnostic out of whatever shape
   * the api-client surfaced. Mirrors the helper on the admin
   * transactions page — admins can copy-paste this into Sentry / a bug
   * report and we don't have to guess what went wrong.
   */
  function describeError(err: unknown): string {
    if (!err) return "Unknown error.";
    if (typeof err === "string") return err;
    if (err instanceof Error) {
      const e = err as Error & { status?: number; code?: string };
      const parts: string[] = [];
      if (e.status) parts.push(`HTTP ${e.status}`);
      if (e.code) parts.push(`[${e.code}]`);
      if (e.message) parts.push(e.message);
      return parts.length > 0 ? parts.join(" · ") : "Request failed.";
    }
    if (typeof err === "object") {
      const o = err as { status?: number; code?: string; message?: string };
      return (
        [
          o.status ? `HTTP ${o.status}` : null,
          o.code ? `[${o.code}]` : null,
          o.message ?? null,
        ]
          .filter(Boolean)
          .join(" · ") || "Request failed."
      );
    }
    return "Unknown error.";
  }

  function handleRowClick(n: AppNotification): void {
    // Mark read first so the badge updates immediately. If navigation
    // happens, the panel unmounts; no harm — the mutation has already
    // optimistically invalidated the list query.
    if (!n.readAt) markRead.mutate(n.id);
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          badge ? `Notifications (${total} unread)` : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-sm border border-line-strong bg-white text-text hover:border-ink"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {badge ? (
          <span
            className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 font-mono text-[10px] font-semibold leading-none text-text-inv"
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Recent notifications"
          className="absolute right-0 top-[44px] z-40 w-[360px] overflow-hidden rounded-md border border-line bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
              Notifications
            </div>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={total === 0 || markAll.isPending}
              className="font-mono text-[10px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi disabled:cursor-not-allowed disabled:text-text-subtle"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {listQ.isLoading ? (
              <div className="px-4 py-6 text-center text-body-sm text-text-muted">
                Loading…
              </div>
            ) : listQ.error ? (
              <div className="px-4 py-6 text-body-sm text-error">
                <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-error">
                  Couldn&apos;t load notifications
                </div>
                {/* Surface the real error message — admins can paste it
                    into the bug report, and during dev it gives the
                    operator a chance to spot a 403 / 500 / network
                    issue at a glance. */}
                <p className="mt-1 text-text">
                  {describeError(listQ.error)}
                </p>
              </div>
            ) : !listQ.data || listQ.data.items.length === 0 ? (
              <div className="px-4 py-6 text-center text-body-sm text-text-muted">
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {listQ.data.items.map((n) => {
                  const tone = severityTone(n.severity);
                  const unread = n.readAt == null;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleRowClick(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-cream-soft ${
                          unread ? "bg-amber/5" : "bg-white"
                        }`}
                      >
                        <span
                          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${tone.dot}`}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="truncate text-body-sm font-medium text-ink">
                              {n.title}
                            </div>
                            <div className="shrink-0 font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
                              {relativeTime(n.createdAt)}
                            </div>
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-body-sm text-text-muted">
                            {n.body}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-line bg-cream-soft px-4 py-3">
            <Link
              href={seeAllHref}
              onClick={() => setOpen(false)}
              className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
            >
              See all →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
