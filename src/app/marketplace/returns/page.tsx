"use client";

/**
 * Self-service returns (Migration 0072). Two steps:
 *   1. Look up an order by number + email → shows every store's items in that
 *      cart, with whether each can be returned right now.
 *   2. Pick the items to send back, give a reason + the tracking number of the
 *      parcel shipped to USA Errands, and submit. Each affected vendor is
 *      notified; the warehouse receives the parcel, then an admin refunds.
 */
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BackLink } from "@/components/ui/back-link";
import {
  marketplaceApi,
  type ReturnLookup,
  type ReturnRequestResult,
} from "@/lib/storefront-api";

export default function MarketplaceReturnsPage() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState<ReturnLookup | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnRequestResult | null>(null);

  const doLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await marketplaceApi.returnsLookup(reference.trim(), email.trim());
      setLookup(res);
      // Pre-select everything currently returnable.
      setSelected(new Set(res.subOrders.filter((s) => s.returnable).map((s) => s.reference)));
    } catch {
      setError("We couldn't find an order with that number and email. Double-check both and try again.");
      setLookup(null);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (ref: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) { setError("Select at least one item to return."); return; }
    if (reason.trim().length < 3) { setError("Tell us why you're returning it."); return; }
    if (tracking.trim().length < 3) { setError("Enter the tracking number of the parcel you've sent back."); return; }
    setBusy(true);
    try {
      const res = await marketplaceApi.returnsRequest({
        email: email.trim(),
        references: [...selected],
        reason: reason.trim(),
        trackingNumber: tracking.trim(),
      });
      setResult(res);
    } catch (err) {
      setError((err as Error)?.message ?? "We couldn't open your return. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "h-11 w-full rounded-full border border-line-strong bg-white px-4 text-body-sm text-ink outline-none focus:border-ink";

  // ---- Success ----
  if (result) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <BackLink href="/marketplace" label="Back to marketplace" />
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Return started</h1>
          {result.created.length > 0 ? (
            <p className="mt-3 text-body-sm text-text-muted">
              We&apos;ve opened {result.created.length} return{result.created.length === 1 ? "" : "s"}:{" "}
              <span className="font-medium text-ink">
                {result.created.map((c) => c.returnReference).join(", ")}
              </span>
              . Once your parcel reaches USA Errands, we&apos;ll review and refund you. You&apos;ll get an
              email at each step.
            </p>
          ) : null}
          {result.skipped.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-left text-[13px] text-text-muted">
              Some items couldn&apos;t be returned:
              <ul className="mt-1 list-disc pl-5">
                {result.skipped.map((s) => (
                  <li key={s.orderReference}>
                    <span className="font-mono text-ink">{s.orderReference}</span> — {s.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link href="/marketplace" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-[13px] font-semibold text-cream-soft">
            Back to shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-8">
      <BackLink href="/marketplace" label="Back to marketplace" />
      <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Start a return</h1>
      <p className="mt-2 text-body-sm text-text-muted">
        Enter your order number and email to see what you can send back. Returns follow each store&apos;s
        policy; shipping the parcel back is on you.
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-[13px] text-error">
          {error}
        </div>
      ) : null}

      {/* Step 1 — lookup */}
      <form onSubmit={doLookup} className="mt-6 flex flex-col gap-3">
        <div>
          <span className="mb-1 block text-[12px] font-medium text-text-muted">Order number</span>
          <input aria-label="Order number" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. SF-000123" className={inputCls} />
        </div>
        <div>
          <span className="mb-1 block text-[12px] font-medium text-text-muted">Email on the order</span>
          <input type="email" aria-label="Email on the order" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
        </div>
        <div>
          <button
            type="submit"
            disabled={busy || !reference.trim() || !email.trim()}
            className="rounded-full bg-ink px-6 py-3 text-[13px] font-semibold text-cream-soft transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {busy && !lookup ? "Looking up…" : "Find my order"}
          </button>
        </div>
      </form>

      {/* Step 2 — pick items + tracking */}
      {lookup ? (
        <form onSubmit={submit} className="mt-8 border-t border-line pt-6">
          <h2 className="text-[15px] font-semibold text-ink">Choose what to return</h2>
          <div className="mt-3 flex flex-col gap-3">
            {lookup.subOrders.map((s) => {
              const on = selected.has(s.reference);
              return (
                <label
                  key={s.reference}
                  className={`flex items-start gap-3 rounded-xl border p-4 ${
                    s.returnable ? "border-line bg-white cursor-pointer" : "border-line bg-cream-soft/60 opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!s.returnable}
                    checked={on}
                    onChange={() => toggle(s.reference)}
                    className="mt-0.5 h-4 w-4 rounded border-line text-ink focus:ring-ink"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-body-sm font-medium text-ink">{s.storeName}</span>
                      <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">{s.reference}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-text-muted">
                      {s.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                    </span>
                    {!s.returnable && s.reason ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-text-subtle">
                        <X className="h-3.5 w-3.5" aria-hidden /> {s.reason}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-5">
            <span className="mb-1 block text-[12px] font-medium text-text-muted">Reason for return</span>
            <textarea
              aria-label="Reason for return"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Wrong size, changed my mind, arrived damaged…"
              className="w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-body-sm text-ink outline-none focus:border-ink"
            />
          </div>

          <div className="mt-4">
            <span className="mb-1 block text-[12px] font-medium text-text-muted">Return tracking number</span>
            <input
              aria-label="Return tracking number"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="The tracking # of the parcel you've shipped back"
              className={inputCls}
            />
            <p className="mt-1 text-[12px] text-text-subtle">
              Ship your items back to USA Errands, then enter the carrier tracking number here so we can
              match your parcel on arrival.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-full bg-ink px-6 py-3 text-[13px] font-semibold text-cream-soft transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {busy ? "Submitting…" : `Start return${selected.size > 1 ? `s (${selected.size})` : ""}`}
          </button>
        </form>
      ) : null}
    </div>
  );
}
