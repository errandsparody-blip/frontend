"use client";

/**
 * Cross-vendor checkout (Phase 2). One address + email; each store keeps its own
 * shipping speed + payment rail. On "Place orders" we create a sub-order per
 * store, then guide the buyer to pay each (money auto-splits to each vendor).
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  formatUsd,
  marketplaceApi,
  storefrontApi,
  StorefrontApiError,
  type ShipAddressInput,
  type ShippingOption,
} from "@/lib/storefront-api";

import { useMarketplaceCart } from "../cart-context";

interface GroupState {
  options: ShippingOption[];
  speed: "STANDARD" | "EXPRESS" | null;
  processors: Array<"STRIPE" | "FLUTTERWAVE">;
  processor: "STRIPE" | "FLUTTERWAVE" | null;
  fulfillmentFeeCents: number;
  error?: string;
}

export default function MarketplaceCheckoutPage() {
  const { groups, subtotalCents, count, clear } = useMarketplaceCart();
  const [addr, setAddr] = useState<ShipAddressInput>({
    recipientName: "",
    line1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });
  const [email, setEmail] = useState("");
  const [byStore, setByStore] = useState<Record<string, GroupState>>({});
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<null | {
    results: Array<{ slug: string; reference: string; checkoutUrl: string }>;
    errors: Array<{ slug: string; message: string }>;
  }>(null);
  const [error, setError] = useState<string | null>(null);

  const addressComplete =
    addr.recipientName && addr.line1 && addr.city && /^[A-Za-z]{2}$/.test(addr.state) && addr.postalCode;
  const allReady =
    groups.length > 0 &&
    groups.every((g) => {
      const s = byStore[g.vendorSlug];
      return s && s.speed && s.processor;
    });

  const storeName = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.vendorSlug, g.storeName])),
    [groups],
  );

  if (count === 0 && !placed) {
    return (
      <div className="py-20 text-center">
        <p className="text-body-sm text-text-muted">Your cart is empty.</p>
        <Link href="/marketplace" className="mt-3 inline-block text-[13px] underline">Back to marketplace</Link>
      </div>
    );
  }

  async function calcAll() {
    setError(null);
    setQuoting(true);
    try {
      const next: Record<string, GroupState> = {};
      await Promise.all(
        groups.map(async (g) => {
          const items = g.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
          try {
            const [quote, store] = await Promise.all([
              storefrontApi.quote(g.vendorSlug, items, addr),
              storefrontApi.getStore(g.vendorSlug),
            ]);
            const processors = store.availableProcessors?.length ? store.availableProcessors : (["STRIPE"] as const);
            next[g.vendorSlug] = {
              options: quote.shippingOptions,
              speed: quote.shippingOptions[0]?.speed ?? null,
              processors: [...processors],
              processor: processors[0] ?? null,
              fulfillmentFeeCents: quote.fulfillmentFeeCents,
            };
          } catch (e) {
            next[g.vendorSlug] = {
              options: [],
              speed: null,
              processors: [],
              processor: null,
              fulfillmentFeeCents: 0,
              error: e instanceof StorefrontApiError ? e.message : "Couldn't quote this store.",
            };
          }
        }),
      );
      setByStore(next);
    } finally {
      setQuoting(false);
    }
  }

  async function place() {
    setError(null);
    setPlacing(true);
    try {
      const payload = {
        shipAddress: addr,
        buyerEmail: email.trim(),
        buyerName: addr.recipientName,
        buyerPhone: addr.phone,
        groups: groups.map((g) => {
          const s = byStore[g.vendorSlug]!;
          return {
            slug: g.vendorSlug,
            items: g.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
            shippingSpeed: s.speed!,
            processor: s.processor!,
          };
        }),
      };
      const res = await marketplaceApi.checkout(payload);
      setPlaced(res);
      if (res.errors.length === 0) clear();
    } catch (e) {
      setError(e instanceof StorefrontApiError ? e.message : "Couldn't place your orders.");
    } finally {
      setPlacing(false);
    }
  }

  // Guided payment step after orders are created.
  if (placed) {
    return (
      <div className="ue-rise-in mx-auto max-w-xl py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Almost there</h1>
        <p className="mt-2 text-body-sm text-text-muted">
          Each store is paid separately so your money goes straight to the right vendor. Complete each
          payment below.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {placed.results.map((r) => (
            <a
              key={r.slug}
              href={r.checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 transition-colors hover:border-ink"
            >
              <span>
                <span className="block text-[14px] font-medium text-ink">{storeName[r.slug] ?? r.slug}</span>
                <span className="block font-mono text-[12px] text-text-muted">{r.reference}</span>
              </span>
              <span className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-cream-soft">Pay →</span>
            </a>
          ))}
        </div>
        {placed.errors.length > 0 ? (
          <div className="mt-4 rounded-lg border-l-4 border-error bg-error/10 px-3 py-2 text-[12px] text-error">
            Some stores couldn&apos;t be checked out:{" "}
            {placed.errors.map((e) => `${storeName[e.slug] ?? e.slug} (${e.message})`).join("; ")}
          </div>
        ) : null}
        <Link href="/marketplace" className="mt-6 inline-block text-[13px] underline">
          Back to marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="ue-rise-in mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_360px]">
      <div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Checkout</h1>

        <Section title="Contact">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-text-2">Email (for order updates) *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
          </label>
        </Section>

        <Section title="Delivery address">
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label="Full name" value={addr.recipientName} onChange={(v) => setAddr({ ...addr, recipientName: v })} />
            <Text label="Phone (optional)" value={addr.phone ?? ""} onChange={(v) => setAddr({ ...addr, phone: v })} />
            <div className="sm:col-span-2"><Text label="Address" value={addr.line1} onChange={(v) => setAddr({ ...addr, line1: v })} /></div>
            <div className="sm:col-span-2"><Text label="Apt, suite (optional)" value={addr.line2 ?? ""} onChange={(v) => setAddr({ ...addr, line2: v })} /></div>
            <Text label="City" value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} />
            <Text label="State" value={addr.state} onChange={(v) => setAddr({ ...addr, state: v.toUpperCase() })} />
            <Text label="ZIP" value={addr.postalCode} onChange={(v) => setAddr({ ...addr, postalCode: v })} />
          </div>
          <button
            type="button"
            disabled={!addressComplete || quoting}
            onClick={calcAll}
            className="mt-4 rounded-full border border-line-strong bg-white px-5 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-50"
          >
            {quoting ? "Calculating…" : "Calculate shipping"}
          </button>
        </Section>

        {groups.map((g) => {
          const s = byStore[g.vendorSlug];
          if (!s) return null;
          return (
            <Section key={g.vendorSlug} title={g.storeName}>
              {s.error ? (
                <div className="rounded-lg border-l-4 border-error bg-error/10 px-3 py-2 text-[12px] text-error">{s.error}</div>
              ) : (
                <>
                  <div className="grid gap-2">
                    {s.options.map((o) => (
                      <label key={o.speed} className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 ${s.speed === o.speed ? "border-ink bg-white" : "border-line bg-white hover:border-line-strong"}`}>
                        <span className="flex items-center gap-3">
                          <input type="radio" name={`speed-${g.vendorSlug}`} checked={s.speed === o.speed}
                            onChange={() => setByStore((prev) => ({ ...prev, [g.vendorSlug]: { ...prev[g.vendorSlug]!, speed: o.speed } }))} />
                          <span>
                            <span className="block text-[14px] font-medium text-ink">{o.label}</span>
                            <span className="block text-[12px] text-text-muted">{o.deliveryWindow}</span>
                          </span>
                        </span>
                        <span className="text-[14px] font-semibold text-ink">{formatUsd(o.costCents)}</span>
                      </label>
                    ))}
                  </div>
                  {s.processors.length > 1 ? (
                    <div className="mt-3 flex gap-2">
                      {s.processors.map((p) => (
                        <button key={p} type="button"
                          onClick={() => setByStore((prev) => ({ ...prev, [g.vendorSlug]: { ...prev[g.vendorSlug]!, processor: p } }))}
                          className={`rounded-full px-4 py-2 text-[12px] font-medium ${s.processor === p ? "bg-ink text-cream-soft" : "border border-line-strong bg-white text-text-muted hover:border-ink"}`}>
                          {p === "STRIPE" ? "Card" : "Flutterwave"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </Section>
          );
        })}
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-white p-5 md:sticky md:top-24">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">Order summary</div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-text-muted">Items ({count})</span>
          <span className="font-medium text-ink">{formatUsd(subtotalCents)}</span>
        </div>
        <p className="mt-2 text-[12px] text-text-subtle">Shipping + fees shown per store above. You&apos;ll pay each store separately.</p>
        {error ? <div className="mt-4 rounded-lg border-l-4 border-error bg-error/10 px-3 py-2 text-[12px] text-error">{error}</div> : null}
        <button
          type="button"
          disabled={!email || !addressComplete || !allReady || placing}
          onClick={place}
          className="mt-5 w-full rounded-full bg-ink px-6 py-3.5 text-[14px] font-semibold text-cream-soft transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {placing ? "Placing orders…" : "Place orders"}
        </button>
      </aside>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-line-strong bg-white px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-ink";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-text-2">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}
