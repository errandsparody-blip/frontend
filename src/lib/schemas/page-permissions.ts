/**
 * Page permissions — mirror of the backend registry.
 *
 * Introduced by migration 0039. Kept as a verbatim copy of:
 *   usa-errands-api/src/common/schemas/page-permissions.ts
 *
 * Both files must stay in sync — the string values are the shared
 * contract that the config row, the guard, the sidebar, and every
 * `<AdminGate pageKey="..." />` wrapper all speak. If you add or
 * remove a key here, do the same on the backend (and vice versa)
 * in the SAME commit.
 *
 * This file is intentionally type-only + a frozen data list — no
 * resolution logic. Resolving whose-permission-is-what is the
 * server's job; the client only knows which keys exist and which
 * ones the current user has.
 */

/**
 * Every page key the ADMIN role can be granted. `as const` gives us
 * the exhaustive union type used by the AdminGate wrapper — a typo
 * fails at compile time.
 */
export const PAGE_KEYS = [
  "admin.dashboard",
  "admin.vendors.read",
  "admin.orders.read",
  "admin.orders.write",
  "admin.psn.read",
  "admin.psn.write",
  "admin.inventory.read",
  "admin.returns.read",
  "admin.returns.write",
  "admin.shopper.read",
  "admin.shopper.write",
  "admin.finance.read",
  "admin.notifications.read",
  "admin.audit.read",
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

/** Type guard for filtering config values coming off the wire. */
export function isPageKey(value: unknown): value is PageKey {
  return typeof value === "string" && (PAGE_KEYS as readonly string[]).includes(value);
}

/**
 * Compile-time default set for an ADMIN with no config overrides.
 * The FRONTEND uses this as a fallback while the /me/page-permissions
 * query is in flight — otherwise the sidebar would flicker empty
 * on first render and then rehydrate. The server is authoritative;
 * this is a UX bootstrap only.
 */
export const ADMIN_DEFAULT_PERMISSIONS: readonly PageKey[] = [
  "admin.dashboard",
  "admin.vendors.read",
  "admin.shopper.read",
  "admin.shopper.write",
];

/** Frozen full-map shape used by hooks + components. */
export type PagePermissionMap = Readonly<Record<PageKey, boolean>>;

/**
 * Build a permission map from a partial record. Missing keys fall
 * back to `false` (deny-by-default). Used by the hook to normalise
 * whatever the server returns into an exhaustive shape so downstream
 * components can index by key without runtime checks.
 */
export function toFullMap(
  partial: Readonly<Record<string, boolean>>,
): PagePermissionMap {
  const out = {} as Record<PageKey, boolean>;
  for (const key of PAGE_KEYS) {
    out[key] = partial[key] === true;
  }
  return Object.freeze(out);
}
