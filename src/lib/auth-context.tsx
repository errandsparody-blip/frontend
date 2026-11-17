"use client";

import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api, setAccessToken } from "@/lib/api-client";

export interface AuthUser {
  id: string;
  email: string;
  // ADMIN is a general-purpose admin whose page-
  // level access is configurable by SUPER_ADMIN via
  // /admin/config/admin-permissions. Home route below routes them
  // to /admin the same as the other admin flavours.
  role:
    | "VENDOR"
    | "VENDOR_SUB_USER"
    | "WAREHOUSE_OPERATOR"
    | "FINANCE_ADMIN"
    | "ADMIN"
    | "SUPER_ADMIN";
  vendorId: string | null;
  mfaEnrolled: boolean;
  emailVerified: boolean;
  /**
   * Set when a super-admin is impersonating this user (the operator's id).
   * Drives the "viewing as" banner and the Exit action. Absent on normal
   * sessions.
   */
  impersonatedBy?: string | null;
}

/**
 * Where a user belongs after a successful sign-in. Centralized so login,
 * MFA verify, and the layout role-guards all agree on the destination.
 *
 *   VENDOR / VENDOR_SUB_USER       → /dashboard
 *   SUPER_ADMIN / FINANCE_ADMIN /
 *   WAREHOUSE_OPERATOR             → /admin
 *   anything unrecognized          → /login (fail closed)
 */
export function homeForRole(user: { role: AuthUser["role"] }): string {
  if (user.role === "VENDOR" || user.role === "VENDOR_SUB_USER") return "/dashboard";
  // The general-purpose ADMIN role is a fulfillment operator and, by default,
  // does NOT have the cross-vendor dashboard (admin.dashboard). Landing it on
  // /admin would render a page whose data call 403s. Send it to Receiving —
  // the first of its granted functions — instead. (A SUPER_ADMIN who grants
  // this ADMIN the dashboard key can still reach /admin from the sidebar.)
  if (user.role === "ADMIN") return "/admin/psn";
  if (
    user.role === "SUPER_ADMIN" ||
    user.role === "FINANCE_ADMIN" ||
    user.role === "WAREHOUSE_OPERATOR"
  ) {
    return "/admin";
  }
  return "/login";
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Plant a session into the context after a successful sign-in flow that
   * already received both the access token and the user shape (login,
   * MFA verify, recovery-code verify). Avoids the immediate-after-login
   * round trip to /auth/refresh and, more importantly, keeps the
   * authenticated AuthProvider state in sync — without this, navigating
   * to a portal layout after MFA verify trips the "user === null" check
   * and bounces back to /login.
   */
  setSession: (input: { accessToken: string; user: AuthUser }) => void;
  /** Exit an impersonation session and return to the admin. */
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface RefreshResponse {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

// Impersonation is stashed per-tab so it survives a hard reload (the token
// lives only in memory otherwise, so refreshing would bounce back to admin).
// sessionStorage (not localStorage) keeps it to the one tab and clears when the
// tab closes.
const IMPERSONATION_KEY = "ue_impersonation";

/** Read the `exp` (epoch seconds) out of a JWT without verifying it. */
function jwtExpSeconds(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

/** The stored impersonation session for this tab, if still valid. */
function readStoredImpersonation(): { accessToken: string; user: AuthUser } | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(IMPERSONATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken: string; user: AuthUser };
    const exp = jwtExpSeconds(parsed.accessToken);
    // Drop it once expired (with a few seconds of skew) so a stale token can't
    // keep the operator stuck in a dead impersonation.
    if (exp !== null && exp * 1000 <= Date.now() + 5_000) {
      window.sessionStorage.removeItem(IMPERSONATION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async (): Promise<void> => {
    // Impersonation survives reload: if this tab has a still-valid impersonation
    // token, restore that session instead of refreshing back to the admin.
    const imp = readStoredImpersonation();
    if (imp) {
      setAccessToken(imp.accessToken);
      setUser(imp.user);
      setLoading(false);
      Sentry.setUser({
        id: imp.user.id,
        email: imp.user.email,
        role: imp.user.role,
      } as Record<string, unknown>);
      return;
    }
    try {
      const r = await api.post<RefreshResponse>("/auth/refresh", undefined, { noRefresh: true });
      setAccessToken(r.accessToken);
      setUser(r.user);
      // Attach the user to Sentry so future errors are attributable. The
      // beforeSend scrubber masks the email; only id + role survives.
      Sentry.setUser({ id: r.user.id, email: r.user.email, role: r.user.role } as Record<string, unknown>);
    } catch {
      setAccessToken(null);
      setUser(null);
      Sentry.setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(IMPERSONATION_KEY);
    } catch {
      /* ignore */
    }
    try {
      await api.post("/auth/logout", undefined, { noRefresh: true });
    } catch {
      /* swallow — we're logging out anyway */
    }
    setAccessToken(null);
    setUser(null);
    Sentry.setUser(null);
    router.push("/login");
  }, [router]);

  // End an impersonation session and return to the admin. Clears the stashed
  // token first so refresh() doesn't just restore it, then refreshes from the
  // admin's own (untouched) cookie.
  const stopImpersonation = useCallback(async (): Promise<void> => {
    try {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(IMPERSONATION_KEY);
    } catch {
      /* ignore */
    }
    await refresh();
  }, [refresh]);

  const setSession = useCallback(
    (input: { accessToken: string; user: AuthUser }): void => {
      setAccessToken(input.accessToken);
      setUser(input.user);
      // We just received an authenticated payload — bypass the loading state
      // even if the initial /auth/refresh hasn't returned yet.
      setLoading(false);
      // Persist an impersonation session so it survives a reload; a normal
      // sign-in clears any stale impersonation from this tab.
      try {
        if (typeof window !== "undefined") {
          if (input.user.impersonatedBy) {
            window.sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(input));
          } else {
            window.sessionStorage.removeItem(IMPERSONATION_KEY);
          }
        }
      } catch {
        /* ignore storage errors */
      }
      Sentry.setUser({
        id: input.user.id,
        email: input.user.email,
        role: input.user.role,
      } as Record<string, unknown>);
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{ user, loading, refresh, logout, setSession, stopImpersonation }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider.");
  return ctx;
}
