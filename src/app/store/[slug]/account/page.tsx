"use client";

/**
 * Buyer account (Migration 0060) — optional, passwordless. Request a magic
 * link, then view order history + saved details. Reached from a store, so it
 * keeps the store chrome.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  buyerAccountApi,
  getBuyerSession,
  setBuyerSession,
  type BuyerOrder,
  type BuyerProfile,
} from "@/lib/buyer-account-api";
import { formatUsd } from "@/lib/storefront-api";

import { useStore } from "../store-shell";

function AccountInner() {
  const store = useStore();
  const router = useRouter();
  const search = useSearchParams();
  const [state, setState] = useState<"init" | "signedout" | "signedin">("init");
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnBusy, setReturnBusy] = useState<string | null>(null);
  const [returnMsg, setReturnMsg] = useState<Record<string, string>>({});

  // Exchange a magic-link token (if present) or resume an existing session.
  useEffect(() => {
    const token = search.get("token");
    async function boot() {
      if (token) {
        try {
          const res = await buyerAccountApi.verify(token);
          setBuyerSession(res.sessionToken);
          router.replace(`/store/${store.slug}/account`);
        } catch {
          setError("That sign-in link is invalid or expired.");
        }
      }
      if (getBuyerSession()) {
        try {
          const me = await buyerAccountApi.me();
          setProfile(me.profile);
          setOrders(me.orders);
          setState("signedin");
          return;
        } catch {
          setBuyerSession(null);
        }
      }
      setState("signedout");
    }
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendLink() {
    setError(null);
    try {
      await buyerAccountApi.requestLink(email.trim(), `/store/${store.slug}/account`);
      setSent(true);
    } catch {
      setError("Couldn't send the link. Try again.");
    }
  }

  async function requestReturn(reference: string) {
    const reason = window.prompt("What's the reason for your return?");
    if (!reason || !reason.trim()) return;
    setReturnBusy(reference);
    try {
      await buyerAccountApi.requestReturn(reference, reason.trim());
      setReturnMsg((m) => ({ ...m, [reference]: "Return requested ✓" }));
    } catch (e) {
      setReturnMsg((m) => ({ ...m, [reference]: e instanceof Error ? e.message : "Failed" }));
    } finally {
      setReturnBusy(null);
    }
  }

  function signOut() {
    setBuyerSession(null);
    setProfile(null);
    setOrders([]);
    setState("signedout");
  }

  if (state === "init") {
    return <div className="py-20 text-center font-mono text-mono-label text-text-subtle">Loading…</div>;
  }

  if (state === "signedout") {
    return (
      <div className="ue-rise-in mx-auto max-w-md py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your account</h1>
        <p className="mt-2 text-body-sm text-text-muted">
          Sign in with your email to see your orders and check out faster. No password needed.
        </p>
        {sent ? (
          <div className="mt-6 rounded-xl border border-line bg-white p-6 text-center">
            <div className="text-[15px] font-medium text-ink">Check your email</div>
            <p className="mt-1 text-body-sm text-text-muted">We sent a sign-in link to {email}.</p>
          </div>
        ) : (
          <div className="mt-6 flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-white px-3 py-2.5 text-[14px] outline-none focus:border-ink"
            />
            <button
              type="button"
              disabled={!email}
              onClick={sendLink}
              className="rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--store-accent)" }}
            >
              Send link
            </button>
          </div>
        )}
        {error ? <p className="mt-3 text-[12px] text-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="ue-rise-in mx-auto max-w-2xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Your account</h1>
          <p className="text-body-sm text-text-muted">{profile?.email}</p>
        </div>
        <button type="button" onClick={signOut} className="text-[12px] text-text-muted hover:text-ink">
          Sign out
        </button>
      </div>

      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">Orders</h2>
      {orders.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-6 py-12 text-center text-body-sm text-text-muted">
          No orders yet.
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {orders.map((o) => (
            <div key={o.reference} className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="font-mono text-[13px] font-medium text-ink">{o.reference}</div>
                <div className="text-[12px] text-text-muted">
                  {o.status.replace(/_/g, " ").toLowerCase()}
                  {o.tracking_number ? ` · ${o.tracking_number}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {o.status === "SHIPPED" || o.status === "DELIVERED" ? (
                  <button
                    type="button"
                    disabled={returnBusy === o.reference}
                    onClick={() => requestReturn(o.reference)}
                    className="text-[12px] text-text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                  >
                    {returnMsg[o.reference] ?? (returnBusy === o.reference ? "Sending…" : "Request return")}
                  </button>
                ) : null}
                <div className="text-[14px] font-semibold text-ink">{formatUsd(o.total_cents)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}
