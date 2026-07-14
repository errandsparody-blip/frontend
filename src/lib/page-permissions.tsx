/**
 * Page permissions — client hooks + gating wrappers.
 *
 * Introduced by migration 0039. Talks to `/v1/auth/me/page-permissions`
 * (added by the same migration). The backend returns an exhaustive
 * map; this file normalises it and hands hooks/components a stable
 * shape so no downstream code needs to worry about missing keys.
 *
 * Two consumers:
 *   * The admin sidebar — hides nav items the user can't access.
 *   * AdminGate — wraps admin page components; renders their
 *     children only when the permission is true, otherwise shows a
 *     "you don't have access" state.
 *
 * The backend is authoritative for security. Everything here is UX
 * polish — hiding an item still 403s the user if they craft the
 * URL directly.
 */

"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import {
  ADMIN_DEFAULT_PERMISSIONS,
  PAGE_KEYS,
  toFullMap,
  type PageKey,
  type PagePermissionMap,
} from "@/lib/schemas/page-permissions";

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

interface MyPagePermissionsResponse {
  permissions: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Optimistic fallback map — used while the /me query is in flight.
//
// We deliberately DON'T assume SUPER_ADMIN; if we did, a freshly-
// mounted admin page would render every sidebar item for one frame
// and then flicker down to the ADMIN's real permissions. Starting
// from ADMIN defaults means:
//   * SUPER_ADMIN → sees a shorter sidebar for one frame, then the
//     full sidebar (safe direction — never renders MORE than they
//     have).
//   * ADMIN with more grants → same behaviour, expands on hydration.
//   * ADMIN with fewer grants → contracts on hydration.
// Every case starts conservative and expands, never the reverse.
// ---------------------------------------------------------------------------

const OPTIMISTIC_MAP: PagePermissionMap = toFullMap(
  Object.fromEntries(ADMIN_DEFAULT_PERMISSIONS.map((k) => [k, true])),
);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches the current user's effective page-permission map. Cached
 * for the whole session — the map only changes when a SUPER_ADMIN
 * edits `admin_role_page_permissions`, and even then a stale map on
 * an already-loaded tab is fine (the backend guard still enforces).
 * Refetch on window focus so a fresh grant lands after the SUPER_ADMIN
 * saves.
 */
export function usePagePermissions(): {
  permissions: PagePermissionMap;
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["auth", "me", "page-permissions"],
    queryFn: () => api.get<MyPagePermissionsResponse>("/auth/me/page-permissions"),
    // 5 minutes — sidebar rebuild on every route change would be wasteful.
    staleTime: 5 * 60_000,
    // Only retry once — a permission fetch failure shouldn't loop.
    retry: 1,
  });

  const permissions = q.data ? toFullMap(q.data.permissions) : OPTIMISTIC_MAP;

  return {
    permissions,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/**
 * Convenience — check one key. Returns `false` while loading (deny
 * on the way in). The AdminGate wrapper below uses this to redirect
 * unauthorised access.
 */
export function useCanAccess(pageKey: PageKey): boolean {
  const { permissions, isLoading } = usePagePermissions();
  if (isLoading) return false;
  return permissions[pageKey] === true;
}

// ---------------------------------------------------------------------------
// AdminGate — client-side redirect + fallback wrapper.
// ---------------------------------------------------------------------------

/**
 * Wraps an admin page. If the current user doesn't have the required
 * page permission, renders nothing and redirects to `/admin` (or a
 * safe fallback). While the permission map is loading, renders a
 * neutral placeholder so we don't flash "denied" on hydration.
 *
 * The backend still enforces authoritatively — this is the client-
 * side UX polish, not the security boundary. A user who somehow
 * bypasses the redirect (dev tools, race condition) hits a 403 on
 * their first API call and the page's ErrorBanner surfaces it.
 */
export function AdminGate({
  pageKey,
  children,
  fallback,
  redirectTo = "/admin",
}: {
  pageKey: PageKey;
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}): JSX.Element | null {
  const { permissions, isLoading } = usePagePermissions();
  const router = useRouter();

  const allowed = permissions[pageKey] === true;

  // Redirect after render so React doesn't warn about setState during
  // render. Only redirects when the query has resolved (isLoading =
  // false) so we don't bounce off the page while the permission map
  // is still hydrating.
  useEffect(() => {
    if (!isLoading && !allowed) {
      router.replace(redirectTo);
    }
  }, [isLoading, allowed, router, redirectTo]);

  if (isLoading) {
    // Neutral loading state — same tone as the rest of the admin.
    return (
      <div className="p-8 font-mono text-mono-label uppercase text-text-muted">
        Loading…
      </div>
    );
  }

  if (!allowed) {
    // Rendering fallback (if provided) while the redirect fires;
    // otherwise nothing. Prevents a flash of the page's content
    // between "we know it's denied" and "the router navigated".
    return (fallback as JSX.Element | undefined) ?? null;
  }

  return <>{children}</>;
}

// Re-export the union so admin pages can `import type { PageKey } from
// "@/lib/page-permissions"` without a second import from the schemas
// module — the schemas file stays pure data.
export type { PageKey };
export { PAGE_KEYS };
