"use client";

/**
 * NotificationsPage — full list view used by both the vendor portal
 * (mounted at `/notifications`) and the admin portal (mounted at
 * `/admin/notifications`). Identical UI, the route just decides where
 * to mount.
 *
 * Filters: All / Unread. Each row shows severity dot, title, body,
 * timestamp, and a "Mark read" button when unread. Clicking the body
 * navigates to the row's href (typed deep link into the relevant
 * thread/order/etc.). "Mark all read" sits in the page header.
 */

import { Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  severityTone,
  relativeTime,
} from "@/lib/notifications";

interface NotificationsPageProps {
  /** Eyebrow text on the page header — distinguishes admin/vendor. */
  eyebrow: string;
}

export function NotificationsPage({ eyebrow }: NotificationsPageProps): JSX.Element {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const listQ = useNotifications({
    unreadOnly: filter === "unread",
    limit: 50,
  });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  const items = listQ.data?.items ?? [];
  const unreadCount = listQ.data?.unreadCount ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={eyebrow}
        title="Notifications"
        description="Every alert, status change, and update for your account in one place. New notifications appear here automatically as soon as the system raises them."
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            {markAll.isPending ? "Marking…" : `Mark all read${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          </Button>
        }
      />

      <div className="flex items-center gap-2 font-mono text-mono-label uppercase">
        <span className="text-text-muted">Filter</span>
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterButton>
        <FilterButton active={filter === "unread"} onClick={() => setFilter("unread")}>
          Unread {unreadCount > 0 ? `· ${unreadCount}` : ""}
        </FilterButton>
      </div>

      {listQ.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : listQ.error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          Couldn&apos;t load notifications. Try refreshing in a moment.
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === "unread" ? "Nothing unread" : "No notifications yet"}
          description={
            filter === "unread"
              ? "Everything's been read. Switch to All to see your history."
              : "We'll show updates here as soon as something happens on your account."
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-white">
          {items.map((n) => {
            const tone = severityTone(n.severity);
            const unread = n.readAt == null;
            return (
              <li key={n.id} className={`px-5 py-4 ${unread ? "bg-amber/5" : ""}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-body font-semibold text-ink">{n.title}</h3>
                      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                        {relativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-body-sm text-text">
                      {n.body}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      {n.href ? (
                        <Link
                          href={n.href}
                          onClick={() => {
                            // Mark read in passing — clicking through is
                            // an implicit ack.
                            if (unread) markRead.mutate(n.id);
                          }}
                          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                        >
                          <LinkIcon className="h-3 w-3" aria-hidden />
                          Open
                        </Link>
                      ) : null}
                      {unread ? (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(n.id)}
                          disabled={markRead.isPending}
                          className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink disabled:cursor-not-allowed"
                        >
                          Mark read
                        </button>
                      ) : null}
                      <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-subtle">
                        {n.type}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-sm bg-ink px-3 py-1 text-text-inv"
          : "rounded-sm border border-line-strong px-3 py-1 text-text hover:border-ink"
      }
    >
      {children}
    </button>
  );
}
