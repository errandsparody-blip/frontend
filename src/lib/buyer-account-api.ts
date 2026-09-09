/**
 * Optional buyer-account client (Migration 0060). Passwordless: a magic link
 * yields a session token, kept in localStorage and sent as `x-buyer-session`.
 */
import type { ShipAddressInput } from "./storefront-api";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1";
const SESSION_KEY = "ue_buyer_session";

export interface BuyerProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  defaultShipAddress: ShipAddressInput | null;
}
export interface BuyerOrder {
  reference: string;
  status: string;
  total_cents: number;
  shipping_speed: string;
  tracking_number: string | null;
  created_at: string;
}

export function getBuyerSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
export function setBuyerSession(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getBuyerSession();
  const res = await fetch(`${BASE}/public/account${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "x-buyer-session": session } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const b = body as { message?: string } | null;
    throw new Error(b?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const buyerAccountApi = {
  save: (payload: { email: string; name?: string; phone?: string; shipAddress?: ShipAddressInput }) =>
    req<{ saved: true }>("/save", { method: "POST", body: JSON.stringify(payload) }),
  requestLink: (email: string, redirectPath: string) =>
    req<{ sent: true }>("/request-link", {
      method: "POST",
      body: JSON.stringify({ email, redirectPath }),
    }),
  verify: (token: string) =>
    req<{ sessionToken: string; profile: BuyerProfile }>("/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  me: () => req<{ profile: BuyerProfile; orders: BuyerOrder[] }>("/me"),
  updateProfile: (payload: {
    name?: string | null;
    phone?: string | null;
    defaultShipAddress?: ShipAddressInput | null;
  }) => req<BuyerProfile>("/profile", { method: "PUT", body: JSON.stringify(payload) }),
  requestReturn: (reference: string, reason: string) =>
    req<{ reference: string; status: string }>(
      `/orders/${encodeURIComponent(reference)}/return-request`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
};
