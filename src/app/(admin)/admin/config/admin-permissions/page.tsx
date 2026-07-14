/**
 * /admin/config/admin-permissions — SUPER_ADMIN-only matrix editor
 * for the ADMIN role's page permissions.
 *
 * Introduced by migration 0039. Talks to:
 *   GET   /v1/admin/role-permissions     current overrides + defaults + registry
 *   PATCH /v1/admin/role-permissions     replace overrides
 *
 * UX shape:
 *   * One row per PageKey (canonical list from the server, so a new
 *     backend key shows up here without a frontend edit).
 *   * A tri-state indicator per row: "enabled" / "disabled" /
 *     "default (matches the compiled-in fallback)". Rows at the
 *     default show the fallback badge so the SUPER_ADMIN can tell
 *     "this is on because the code says so" apart from "this is on
 *     because I explicitly enabled it".
 *   * One Save button. Everything is applied atomically —
 *     PagePermissionService.writeAdminOverrides upserts the whole
 *     JSON blob in a single row write.
 *
 * Auth: the page itself is a client component wrapped in `AdminGate`
 * with no pageKey — the compiled-in check is "SUPER_ADMIN only" and
 * we rely on the backend to 403 anyone else, so the AdminGate here
 * would be a no-op. Instead we check the user's role directly and
 * redirect non-SUPER_ADMIN users to /admin.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";
import type { PageKey } from "@/lib/schemas/page-permissions";

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

interface RolePermissionsResponse {
  overrides: Partial<Record<PageKey, boolean>>;
  defaults: PageKey[];
  knownKeys: PageKey[];
}

interface PatchResponse {
  overrides: Partial<Record<PageKey, boolean>>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPermissionsPage(): JSX.Element | null {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Client-side redirect for non-SUPER_ADMIN users. The backend is
  // authoritative — the API call below would 403 either way — so
  // this is UX polish to avoid a broken-looking "loading forever"
  // state for admins who somehow land here.
  useEffect(() => {
    if (!authLoading && user && user.role !== "SUPER_ADMIN") {
      router.replace("/admin");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="p-8 font-mono text-mono-label uppercase text-text-muted">
        Loading…
      </div>
    );
  }
  if (user.role !== "SUPER_ADMIN") return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Configuration / Admin access"
        title="Admin role page access"
        description="Grant or revoke individual admin pages for the ADMIN role. SUPER_ADMIN always has full access; this only affects users with role = ADMIN. Changes are audit-logged."
      />
      <PermissionsMatrix />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

/**
 * Local editor state — one entry per known page key, tracking the
 * CURRENT toggle (what the SUPER_ADMIN sees on screen right now) vs.
 * the SAVED baseline. Dirty detection compares the two so we can
 * disable Save when nothing's changed and confirm before nav-away.
 */
interface RowState {
  key: PageKey;
  /** Live toggle — starts equal to the saved value on load. */
  enabled: boolean;
  /** Server-side saved value for THIS key (from `overrides`). */
  saved: boolean;
  /** Whether the saved value came from an explicit override or the default. */
  isExplicit: boolean;
  /** The compile-in default for this key (from `defaults`). */
  defaultOn: boolean;
}

function PermissionsMatrix(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();
  const [rows, setRows] = useState<RowState[]>([]);

  const dataQ = useQuery({
    queryKey: ["admin", "role-permissions"],
    queryFn: () => api.get<RolePermissionsResponse>("/admin/role-permissions"),
  });

  // Materialise the rows from the server response once, then let the
  // toggle handler mutate the local state. Re-runs on refetch so a
  // SUPER_ADMIN who saved on one tab sees fresh state on another.
  useEffect(() => {
    if (!dataQ.data) return;
    const { overrides, defaults, knownKeys } = dataQ.data;
    const defaultSet = new Set(defaults);
    setRows(
      knownKeys.map((key) => {
        const explicit = overrides[key];
        const defaultOn = defaultSet.has(key);
        const saved = typeof explicit === "boolean" ? explicit : defaultOn;
        return {
          key,
          enabled: saved,
          saved,
          isExplicit: typeof explicit === "boolean",
          defaultOn,
        };
      }),
    );
  }, [dataQ.data]);

  const dirty = useMemo(() => rows.some((r) => r.enabled !== r.saved), [rows]);

  const saveMut = useMutation({
    mutationFn: () => {
      // Send the FULL current map. The backend replaces the JSON
      // blob wholesale, so any key not present here would revert to
      // its default. Sending every known key with its explicit value
      // is the cleanest contract.
      const payload: Record<string, boolean> = {};
      for (const r of rows) payload[r.key] = r.enabled;
      return api.patch<PatchResponse>("/admin/role-permissions", { permissions: payload });
    },
    onMutate: clear,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "role-permissions"] });
      // Also refresh the current user's own permission map — a
      // SUPER_ADMIN editing their own overrides shouldn't need a
      // page reload to see the effect (though SUPER_ADMIN always
      // gets all-true regardless).
      void qc.invalidateQueries({ queryKey: ["auth", "me", "page-permissions"] });
    },
    onError: (err) => handle(err),
  });

  if (dataQ.isLoading) {
    return (
      <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
    );
  }
  if (dataQ.isError) {
    return (
      <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
        Failed to load admin permissions. Refresh to retry.
      </div>
    );
  }

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-mono-label uppercase text-text-muted">
            Page access matrix
          </h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Each row corresponds to an admin page or capability. Toggle it on to
            grant every user with the ADMIN role access to that page. Rows
            marked <strong>default on</strong> are enabled in code — turning
            them off here explicitly revokes access even for the default set.
          </p>
        </div>
        <Button
          type="button"
          variant="amber"
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending}
          loading={saveMut.isPending}
        >
          {saveMut.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
      </div>

      <ErrorBanner error={bannerError} onAction={() => undefined} />

      <ul className="mt-4 flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-body-sm font-semibold text-ink">
                  {row.key}
                </span>
                {row.defaultOn ? (
                  <span
                    className="rounded-sm bg-cream-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted"
                    title="This key is enabled by default in code — untoggling requires an explicit override."
                  >
                    default on
                  </span>
                ) : null}
                {row.isExplicit ? (
                  <span
                    className="rounded-sm bg-amber/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-amber"
                    title="This key currently has an explicit override in the config row."
                  >
                    override set
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 text-caption text-text-muted">
                {describePageKey(row.key)}
              </div>
            </div>
            <label
              className="inline-flex cursor-pointer items-center gap-2"
              title={row.enabled ? "Click to revoke" : "Click to grant"}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={row.enabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setRows((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, enabled: next } : r)),
                  );
                }}
              />
              <span className="font-mono text-mono-label uppercase text-text-muted">
                {row.enabled ? "granted" : "revoked"}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <p className="mt-6 rounded-sm bg-cream-soft px-4 py-3 text-body-sm text-text-muted">
        SUPER_ADMIN, FINANCE_ADMIN, and WAREHOUSE_OPERATOR are unaffected by
        this matrix — they retain their compiled-in access. Changes apply within
        30 seconds of Save (the API caches the permissions map process-wide).
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small copy helper — human-readable description per key.
//
// Kept in the frontend so we can iterate on the copy without a
// backend redeploy. Keys added to the backend registry that don't
// have a description here fall back to a generic sentence.
// ---------------------------------------------------------------------------

function describePageKey(key: PageKey): string {
  switch (key) {
    case "admin.dashboard":
      return "View the admin dashboard overview.";
    case "admin.vendors.read":
      return "See the vendor list, vendor detail, overview, recurring storage.";
    case "admin.orders.read":
      return "See the admin orders queue + individual order detail.";
    case "admin.orders.write":
      return "Advance orders through pick / pack / ship / hand-off transitions.";
    case "admin.psn.read":
      return "See the receiving queue and individual PSN detail.";
    case "admin.psn.write":
      return "Receive stock, place holds, reject, resolve discrepancies.";
    case "admin.inventory.read":
      return "See cross-vendor inventory + SKU detail + movement history.";
    case "admin.returns.read":
      return "See the returns operator queue.";
    case "admin.returns.write":
      return "Mark returns received and record inspection outcomes.";
    case "admin.shopper.read":
      return "See the 'shop for me' queue and individual request detail.";
    case "admin.shopper.write":
      return "Approve IDs, confirm wires, set shipping, send followups, cancel.";
    case "admin.finance.read":
      return "See the reconciliation report + transactions ledger.";
    case "admin.notifications.read":
      return "See the admin notifications inbox.";
    case "admin.audit.read":
      return "Search the audit log across the platform.";
  }
}
