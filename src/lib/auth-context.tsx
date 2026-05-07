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
  role: "VENDOR" | "VENDOR_SUB_USER" | "WAREHOUSE_OPERATOR" | "FINANCE_ADMIN" | "SUPER_ADMIN";
  vendorId: string | null;
  mfaEnrolled: boolean;
  emailVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider.");
  return ctx;
}
