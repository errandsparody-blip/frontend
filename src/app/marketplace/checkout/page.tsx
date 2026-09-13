"use client";

/**
 * Cross-vendor checkout (Phase 2). One address + email, and ONE delivery for the
 * whole cart: everything ships from the USA Errands warehouse to the buyer as a
 * single shipment, so the buyer picks one delivery speed and pays shipping once.
 * Each store still keeps its own payment rail — on "Place orders" we create a
 * sub-order per store (product money auto-splits to each vendor) while shipping +
 * fulfillment are charged a single time across the cart.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  formatUsd,
  marketplaceApi,
  storefrontApi,
  StorefrontApiError,
  type ShipAddressInput,
  type ShippingOption,
} from "@/lib/storefront-api";

import { useMarketplaceCart } from "../cart-context";

interface StorePay {
  processors: Array<"STRIPE" | "FLUTTERWAVE">;
  processor: "STRIPE" | "FLUTTERWAVE" | null;
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
  // One consolidated shipping quote for the whole cart.
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [speed, setSpeed] = useState<"STANDARD" | "EXPRESS" | null>(null);
  const [fulfillmentFeeCents, setFulfillmentFeeCents] = useState(0);
  const [taxCents, setTaxCents] = useState(0);
  // Payment rail per store.
  const [pay, setPay] = useState<Record<string, StorePay>>({});
  const [quoted, setQuoted] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<null | {
    results: Array<{ slug: string; reference: string; checkoutUrl: string }>;
    errors: Array<{ slug: string; message: string }>;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-store discount code: what's typed, what's applied, and any message.
  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [discounts, setDiscounts] = useState<Record<string, { code: string; cents: number } | null>>({});
  const [codeMsg, setCodeMsg] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});

  // Persist the buyer's address + email so a trip out to pay and back doesn't
  // wipe what they typed. sessionStorage (same-tab; clears when the tab closes).
  const DRAFT_KEY = "mp_checkout";
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<{ addr: ShipAddressInput; email: string }>;
      if (d.addr?.line1) setAddr((prev) => (prev.line1 ? prev : d.addr!));
      if (d.email) setEmail((prev) => prev || d.email!);
    } catch {
      /* ignore malformed draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (count === 0) {
        sessionStorage.removeItem(DRAFT_KEY);
        return;
      }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ addr, email }));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [addr, email, count]);

  const addressComplete =
    addr.recipientName && addr.line1 && addr.city && /^[A-Za-z]{2}$/.test(addr.state) && addr.postalCode;
  const allRailsReady = groups.length > 0 && groups.every((g) => pay[g.vendorSlug]?.processor);
  const allReady = quoted && !!speed && allRailsReady;

  const storeName = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.vendorSlug, g.storeName])),
    [groups],
  );

  const shippingCents = useMemo(
    () => options.find((o) => o.speed === speed)?.costCents ?? 0,
    [options, speed],
  );
  const discountTotalCents = useMemo(
    () => Object.values(discounts).reduce((s, d) => s + (d?.cents ?? 0), 0),
    [discounts],
  );
  const totalCents = Math.max(
    0,
    subtotalCents - discountTotalCents + shippingCents + fulfillmentFeeCents + taxCents,
  );

  // Validate a vendor discount code against that store's subtotal. A vendor code
  // only ever discounts that vendor's goods (enforced server-side).
  async function applyCode(slug: string, groupSubtotalCents: number) {
    const code = (codeInput[slug] ?? "").trim();
    if (!code) return;
    setChecking((p) => ({ ...p, [slug]: true }));
    try {
      const r = await storefrontApi.validateDiscount(slug, code, groupSubtotalCents);
      if (r.valid) {
        setDiscounts((p) => ({ ...p, [slug]: { code: r.code ?? code, cents: r.discountCents ?? 0 } }));
        setCodeMsg((p) => ({ ...p, [slug]: `−${formatUsd(r.discountCents ?? 0)} applied` }));
      } else {
        setDiscounts((p) => ({ ...p, [slug]: null }));
        setCodeMsg((p) => ({ ...p, [slug]: r.reason ?? "That code isn't valid for this store." }));
      }
    } catch (e) {
      setDiscounts((p) => ({ ...p, [slug]: null }));
      setCodeMsg((p) => ({ ...p, [slug]: e instanceof StorefrontApiError ? e.message : "Couldn't check that code." }));
    } finally {
      setChecking((p) => ({ ...p, [slug]: false }));
    }
  }

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
      // One shipping quote for the whole cart, plus each store's payment rails.
      const quotePromise = marketplaceApi.quote(
        groups.map((g) => ({
          slug: g.vendorSlug,
          items: g.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        })),
        addr,
      );
      const storesPromise = Promise.all(
        groups.map(async (g) => [g.vendorSlug, await storefrontApi.getStore(g.vendorSlug)] as const),
      );
      const [quote, stores] = await Promise.all([quotePromise, storesPromise]);

      setOptions(quote.shippingOptions);
      setSpeed(quote.shippingOptions[0]?.speed ?? null);
      setFulfillmentFeeCents(quote.fulfillmentFeeCents);
      setTaxCents(quote.taxCents);

      const nextPay: Record<string, StorePay> = {};
      for (const [slug, store] of stores) {
        const processors = store.availableProcessors?.length ? store.availableProcessors : (["STRIPE"] as const);
        nextPay[slug] = { processors: [...processors], processor: processors[0] ?? null };
      }
      setPay(nextPay);
      setQuoted(true);
    } catch (e) {
      setError(e instanceof StorefrontApiError ? e.message : "Couldn't calculate shipping for this address.");
    } finally {
      setQuoting(false);
    }
  }

  async function place() {
    if (!speed) return;
    setError(null);
    setPlacing(true);
    try {
      const res = await marketplaceApi.checkout({
        shipAddress: addr,
        buyerEmail: email.trim(),
        buyerName: addr.recipientName,
        buyerPhone: addr.phone,
        shippingSpeed: speed,
        groups: groups.map((g) => ({
          slug: g.vendorSlug,
          items: g.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          processor: pay[g.vendorSlug]!.processor!,
          discountCode: discounts[g.vendorSlug]?.code,
        })),
      });
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
          Your delivery is charged once for the whole order. Each store is paid separately so the
          product money goes straight to the right vendor — complete each payment below.
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

        {quoted && options.length > 0 ? (
          <Section title="Delivery (one shipment for your whole order)">
            <div className="grid gap-2">
              {options.map((o) => (
                <label key={o.speed} className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 ${speed === o.speed ? "border-ink bg-white" : "border-line bg-white hover:border-line-strong"}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="cart-speed" checked={speed === o.speed} onChange={() => setSpeed(o.speed)} />
                    <span>
                      <span className="block text-[14px] font-medium text-ink">{o.label}</span>
                      <span className="block text-[12px] text-text-muted">{o.deliveryWindow}</span>
                    </span>
                  </span>
                  <span className="text-[14px] font-semibold text-ink">{formatUsd(o.costCents)}</span>
                </label>
              ))}
            </div>
          </Section>
        ) : null}

        {groups.map((g) => {
          const s = pay[g.vendorSlug];
          const applied = discounts[g.vendorSlug];
          return (
            <Section key={g.vendorSlug} title={`Store · ${g.storeName}`}>
              {/* Vendor discount code — applies only to this store's items. */}
              <div className="flex gap-2">
                <input
                  value={codeInput[g.vendorSlug] ?? ""}
                  onChange={(e) => setCodeInput((p) => ({ ...p, [g.vendorSlug]: e.target.value.toUpperCase() }))}
                  placeholder="Discount code"
                  className={inputCls}
                />
                <button
                  type="button"
                  disabled={!!checking[g.vendorSlug] || !(codeInput[g.vendorSlug] ?? "").trim()}
                  onClick={() => applyCode(g.vendorSlug, g.subtotalCents)}
                  className="whitespace-nowrap rounded-full border border-line-strong bg-white px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-50"
                >
                  {checking[g.vendorSlug] ? "Checking…" : applied ? "Update" : "Apply"}
                </button>
              </div>
              {codeMsg[g.vendorSlug] ? (
                <p className={`mt-1 text-[12px] ${applied ? "text-ink" : "text-error"}`}>{codeMsg[g.vendorSlug]}</p>
              ) : null}

              {/* Payment rail — only when this store supports more than one. */}
              {s && s.processors.length > 1 ? (
                <div className="mt-3 flex gap-2">
                  {s.processors.map((p) => (
                    <button key={p} type="button"
                      onClick={() => setPay((prev) => ({ ...prev, [g.vendorSlug]: { ...prev[g.vendorSlug]!, processor: p } }))}
                      className={`rounded-full px-4 py-2 text-[12px] font-medium ${s.processor === p ? "bg-ink text-cream-soft" : "border border-line-strong bg-white text-text-muted hover:border-ink"}`}>
                      {p === "STRIPE" ? "Card" : "Flutterwave"}
                    </button>
                  ))}
                </div>
              ) : null}
            </Section>
          );
        })}
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-white p-5 md:sticky md:top-24">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">Order summary</div>

        {/* Itemised, grouped by store — so the buyer sees exactly what they're paying for. */}
        <div className="mb-3 max-h-64 space-y-3 overflow-auto">
          {groups.map((g) => (
            <div key={g.vendorSlug}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">{g.storeName}</div>
              {g.items.map((it) => (
                <div key={it.productId} className="mt-1 flex items-start justify-between gap-3 text-[12px]">
                  <span className="text-text-2">
                    {it.name}
                    <span className="text-text-subtle"> × {it.quantity}</span>
                  </span>
                  <span className="whitespace-nowrap text-ink">{formatUsd(it.unitRetailCents * it.quantity)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="my-3 border-t border-line" />

        <Row label={`Items (${count})`} value={formatUsd(subtotalCents)} />
        {discountTotalCents > 0 ? (
          <Row label="Discounts" value={`−${formatUsd(discountTotalCents)}`} muted />
        ) : null}
        {quoted ? (
          <>
            <Row label="Shipping" value={shippingCents ? formatUsd(shippingCents) : "—"} muted />
            <Row
              label={groups.length > 1 ? `Fulfillment (${groups.length} stores)` : "Fulfillment"}
              value={formatUsd(fulfillmentFeeCents)}
              muted
            />
            {taxCents > 0 ? <Row label="Tax" value={formatUsd(taxCents)} muted /> : null}
            <div className="my-3 border-t border-line" />
            <Row label="Total" value={formatUsd(totalCents)} bold />
            <p className="mt-2 text-[12px] text-text-subtle">
              One delivery for your whole order. Product payment goes to each store separately at the
              next step.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[12px] text-text-subtle">Enter your address and calculate shipping to see the total.</p>
        )}
        {error ? <div className="mt-4 rounded-lg border-l-4 border-error bg-error/10 px-3 py-2 text-[12px] text-error">{error}</div> : null}
        <button
          type="button"
          disabled={!email || !addressComplete || !allReady || placing}
          onClick={place}
          className="mt-5 w-full rounded-full bg-ink px-6 py-3.5 text-[14px] font-semibold text-cream-soft transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {placing ? "Placing orders…" : "Place order"}
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

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-[13px] ${muted ? "mt-2" : ""}`}>
      <span className={muted ? "text-text-muted" : "text-text-2"}>{label}</span>
      <span className={bold ? "text-[15px] font-semibold text-ink" : "font-medium text-ink"}>{value}</span>
    </div>
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
