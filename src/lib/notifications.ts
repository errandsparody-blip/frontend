/**
 * Notifications — shared types + hooks used by the bell, the page, and the
 * sidebar badges. Polls the API every 30 s so a freshly-emitted notification
 * lands on screen without a manual refresh.
 */

"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR";

export interface AppNotification {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface UnreadCountsResponse {
  total: number;
  byCategory: Record<string, number>;
}

/**
 * Sidebar nav categories that map to backend `type` prefixes. The backend
 * normalises `psn.submitted` → `psn`, `order.shipped` → `order`, etc. via
 * NotificationService.categoryFromType — we keep that mapping in lockstep.
 */
export type NotificationCategory =
  | "psn"
  | "order"
  | "return"
  | "wallet"
  | "shopper"
  | "kyc"
  | "verification"
  | "vendor"
  | "other";

const LIST_KEY = ["notifications", "list"] as const;
const COUNTS_KEY = ["notifications", "unread-counts"] as const;

/** Hook: list the recipient's notifications. Polls every 15s. */
export function useNotifications(opts?: { unreadOnly?: boolean; limit?: number }): ReturnType<
  typeof useQuery<NotificationListResponse>
> {
  const params = new URLSearchParams();
  if (opts?.unreadOnly) params.set("unreadOnly", "true");
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return useQuery<NotificationListResponse>({
    queryKey: [...LIST_KEY, { unreadOnly: !!opts?.unreadOnly, limit: opts?.limit ?? 50 }],
    queryFn: () =>
      api.get<NotificationListResponse>(`/notifications${qs ? `?${qs}` : ""}`),
    // 15 s poll keeps the bell + page list feeling live. React Query
    // automatically pauses the interval when the tab isn't focused;
    // the global `refetchOnWindowFocus` snaps back to current state
    // the moment the user returns.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

/**
 * Hook: per-category unread counts. The sidebar uses this to paint a
 * badge next to each nav item. 15 s poll mirrors the notification list
 * so the bell badge + sidebar badges + the page itself never drift
 * apart by more than half a tick.
 */
export function useUnreadCounts(): ReturnType<typeof useQuery<UnreadCountsResponse>> {
  return useQuery<UnreadCountsResponse>({
    queryKey: COUNTS_KEY,
    queryFn: () => api.get<UnreadCountsResponse>("/notifications/unread-counts"),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    // The sidebar should never blow up because counts failed. An error
    // hides the badge — the user can still navigate freely.
    retry: false,
  });
}

/** Mark a single notification read. Invalidates list + counts on success. */
export function useMarkNotificationRead(): ReturnType<
  typeof useMutation<void, unknown, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<void>(`/notifications/${id}/read`),
    onSuccess: () => invalidateNotifications(qc),
  });
}

/** Mark every unread notification for the recipient as read. */
export function useMarkAllRead(): ReturnType<
  typeof useMutation<{ updated: number }, unknown, void>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ updated: number }>("/notifications/read-all"),
    onSuccess: () => invalidateNotifications(qc),
  });
}

/**
 * Mark every unread notification in a single category as read. Drives
 * the sidebar's "click the tab → badge goes to 0" behaviour. Categories
 * mirror `NotificationCategory` (psn, order, return, wallet, shopper,
 * kyc, verification, vendor).
 */
export function useMarkCategoryRead(): ReturnType<
  typeof useMutation<{ updated: number }, unknown, NotificationCategory>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (category: NotificationCategory) =>
      api.post<{ updated: number }>("/notifications/read-category", { category }),
    onSuccess: () => invalidateNotifications(qc),
  });
}

function invalidateNotifications(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: [...LIST_KEY] });
  void qc.invalidateQueries({ queryKey: [...COUNTS_KEY] });
}

/**
 * Bucket a backend `type` (e.g. `psn.submitted`) to a sidebar category.
 * Mirrors NotificationService.categoryFromType — keep in sync. Used when
 * the frontend needs to derive the badge bucket without round-tripping
 * to the counts endpoint (e.g. optimistic updates).
 */
export function categoryFromType(type: string): NotificationCategory {
  const first = type.split(".")[0]?.trim().toLowerCase();
  if (!first) return "other";
  const known: Record<string, NotificationCategory> = {
    psn: "psn",
    order: "order",
    return: "return",
    wallet: "wallet",
    shopper: "shopper",
    kyc: "kyc",
    verification: "verification",
    vendor: "vendor",
  };
  return known[first] ?? "other";
}

/**
 * Human label + tone for a severity. Used by the bell dropdown and the
 * notifications page so they render consistently.
 */
export function severityTone(s: NotificationSeverity): {
  label: string;
  ring: string;
  dot: string;
} {
  switch (s) {
    case "SUCCESS":
      return { label: "Success", ring: "border-success/40", dot: "bg-success" };
    case "WARNING":
      return { label: "Warning", ring: "border-amber/40", dot: "bg-amber" };
    case "ERROR":
      return { label: "Error", ring: "border-error/40", dot: "bg-error" };
    case "INFO":
    default:
      return { label: "Info", ring: "border-line-strong", dot: "bg-ink" };
  }
}

/**
 * Compact relative time formatter ("3m ago", "2h ago", "Mar 4"). Avoids
 * pulling in date-fns just for this — the bell dropdown is one of the
 * places it's used, and bundle size matters there.
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
