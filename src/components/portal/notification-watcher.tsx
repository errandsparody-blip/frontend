"use client";

/**
 * NotificationWatcher — bridges the 15-second unread-count poll into
 * the toast stack. Mounted once on every authenticated layout (admin
 * portal + vendor portal); marketing pages don't need it.
 *
 * How it works:
 *   1. `useUnreadCounts()` polls /notifications/unread-counts every
 *      15 s and on window focus.
 *   2. We hold the previous total in a ref. When the new total is
 *      strictly greater than the previous, we know one or more new
 *      notifications arrived between polls.
 *   3. For each delta, we peek at the latest unread notification (via
 *      the already-cached list query) and fire a toast with its title
 *      + a "Open" action that routes to the row's href.
 *
 * Why a ref + effect instead of a stale-comparison inside the toast
 * provider:
 *   - Refs let us track "the last value we acted on" across renders
 *     without inviting a re-render loop.
 *   - Comparison runs in a useEffect, so React commits the new render
 *     before we attempt the side effect — guarantees we never fire a
 *     toast during the same render cycle that loaded the count.
 *
 * Edge cases:
 *   - First mount: we treat the initial count as the baseline (no
 *     toast). Otherwise every session would open with a flood of
 *     "you have X unread" toasts.
 *   - Tab returning from background: window focus triggers a refetch.
 *     If new notifications arrived while the tab was hidden, exactly
 *     one toast fires summarising the delta.
 *   - Rapid bursts (e.g. 5 notifications in 15 s): we coalesce by
 *     using the same `dedupeKey` on the toast — newest title wins,
 *     timer resets, no stacking.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/toast";
import { useNotifications, useUnreadCounts } from "@/lib/notifications";

export function NotificationWatcher(): null {
  const router = useRouter();
  const toast = useToast();
  const countsQ = useUnreadCounts();
  // The bell dropdown's list query — sized to 5, polled at the same
  // cadence. We reuse its cache to grab the newest unread title for
  // the toast body so we don't issue a redundant request.
  const listQ = useNotifications({ limit: 5 });

  const lastTotalRef = useRef<number | null>(null);

  useEffect(() => {
    const total = countsQ.data?.total;
    if (typeof total !== "number") return;

    // First successful poll → seed the baseline, don't toast.
    if (lastTotalRef.current === null) {
      lastTotalRef.current = total;
      return;
    }

    if (total > lastTotalRef.current) {
      const delta = total - lastTotalRef.current;
      // Pick the most recent unread notification — `useNotifications`
      // returns items DESC by createdAt, so the first row is newest.
      const newest = listQ.data?.items.find((n) => !n.readAt) ?? null;

      // Build the toast. We always provide an action — even when the
      // notification has no href, "Open notifications" lands the user
      // on the inbox, which is the right next step.
      const title =
        delta === 1
          ? "New notification"
          : `${delta} new notifications`;
      const body = newest?.title ?? "Open notifications to see what's new.";
      // Route the action button: prefer the notification's deep link,
      // fall back to the inbox.
      const href = newest?.href ?? "/notifications";

      toast.show({
        title,
        body,
        severity: "info",
        // Dedupe key keeps a burst of arrivals to a single toast that
        // updates in place rather than stacking five separate ones.
        dedupeKey: "notifications:new",
        action: {
          label: "Open",
          onClick: () => router.push(href),
        },
      });
    }

    // Whether total went up or down (user marked some read), update
    // the baseline so we don't re-fire on the next render with the
    // same delta.
    lastTotalRef.current = total;
  }, [countsQ.data, listQ.data, router, toast]);

  return null;
}
