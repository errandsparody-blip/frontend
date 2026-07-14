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
  // Migration 0039 — ADMIN is a general-purpose admin whose page-
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
  if (
    user.role === "SUPER_ADMIN" ||
    user.role === "FINANCE_ADMIN" ||
    user.role === "WAREHOUSE_OPERATOR" ||
    // Migration 0039 — new ADMIN role lands on the admin dashboard
    // the same as the other admin flavours. Their sidebar is
    // filtered by page permissions, but the landing route is the
    // same.
    user.role === "ADMIN"
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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface RefreshResponse {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async (): Promise<void> => {
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
      await api.post("/auth/logout", undefined, { noRefresh: true });
    } catch {
      /* swallow — we're logging out anyway */
    }
    setAccessToken(null);
    setUser(null);
    Sentry.setUser(null);
    router.push("/login");
  }, [router]);

  const setSession = useCallback(
    (input: { accessToken: string; user: AuthUser }): void => {
      setAccessToken(input.accessToken);
      setUser(input.user);
      // We just received an authenticated payload — bypass the loading state
      // even if the initial /auth/refresh hasn't returned yet.
      setLoading(false);
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
    <AuthContext.Provider value={{ user, loading, refresh, logout, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider.");
  return ctx;
}
