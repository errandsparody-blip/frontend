"use client";

/**
 * The single marketplace checkout — the ONLY checkout in the app (vendor
 * storefronts share this cart + checkout; there is no separate per-store
 * checkout). One address + email, and ONE delivery for the whole cart:
 * everything ships from the USA Errands warehouse as a single shipment, so the
 * buyer picks one delivery speed and pays delivery once.
 *
 * Customer-facing by design: the buyer sees only what they pay for — items,
 * delivery, tax, total. Internal mechanics (fulfillment, per-vendor payout,
 * payment rails) are never surfaced here.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  formatUsd,
  marketplaceApi,
  storefrontApi,
  StorefrontApiError,
  type ShipAddressInput,
  type ShippingOption,
} from "@/lib/storefront-api";

import { BackLink } from "@/components/ui/back-link";

import { useMarketplaceCart } from "../cart-context";

interface StorePay {
  processors: Array<"STRIPE" | "FLUTTERWAVE">;
  processor: "STRIPE" | "FLUTTERWAVE" | null;
  error?: string;
}

// Snapshot captured at "Place order" so a receipt can be rendered on return from
// the hosted payment (when the cart + live quote are no longer in memory).
interface ReceiptData {
  email: string;
  paidAt: string;
  stores: Array<{ storeName: string; items: Array<{ name: string; quantity: number; totalCents: number }> }>;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}

export default function MarketplaceCheckoutPage() {
  const router = useRouter();
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
  // Note: fulfillment is NOT a buyer charge — it's billed to the vendor at
  // fulfillment. The buyer pays product + delivery (+ tax) only.
  const [taxCents, setTaxCents] = useState(0);
  // Payment rail per store.
  const [pay, setPay] = useState<Record<string, StorePay>>({});
  const [quoted, setQuoted] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<null | {
    results: Array<{ slug: string; reference: string; checkoutUrl: string }>;
    errors: Array<{ slug: string; message: string }>;
    storeName: Record<string, string>;
    receipt?: ReceiptData;
  }>(null);
  // Set after the buyer returns from a successful hosted payment (?status=successful).
  const [confirmed, setConfirmed] = useState<null | {
    references: string[];
    receipt?: ReceiptData;
  }>(null);
  // Whether we're showing the payment step ("pay") or the checkout form ("form").
  // Kept separate from `placed` so the buyer can step BACK to the form while the
  // placed order (and its payment links) is still remembered and resumable.
  const [view, setView] = useState<"form" | "pay">("form");
  const [error, setError] = useState<string | null>(null);
  // Per-store discount code: what's typed, what's applied, and any message.
  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [discounts, setDiscounts] = useState<Record<string, { code: string; cents: number } | null>>({});
  const [codeMsg, setCodeMsg] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});

  // Persist the buyer's address + email so a trip out to pay and back doesn't
  // wipe what they typed. sessionStorage (same-tab; clears when the tab closes).
  const DRAFT_KEY = "mp_checkout";
  // Persist the PLACED order (payment links) too. Once orders are created they
  // reserve stock and wait for payment — if the buyer navigates away we must be
  // able to bring them back to the exact "pay each store" step, not strand them.
  const PLACED_KEY = "mp_placed";
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<{ addr: ShipAddressInput; email: string }>;
        if (d.addr?.line1) setAddr((prev) => (prev.line1 ? prev : d.addr!));
        if (d.email) setEmail((prev) => prev || d.email!);
      }
    } catch {
      /* ignore malformed draft */
    }
    try {
      const rawPlaced = sessionStorage.getItem(PLACED_KEY);
      if (rawPlaced) {
        const p = JSON.parse(rawPlaced);
        if (p?.results?.length) {
          setPlaced({ results: p.results, errors: p.errors ?? [], storeName: p.storeName ?? {}, receipt: p.receipt });
          setView("pay");
        }
      }
    } catch {
      /* ignore malformed placed */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Return from a successful hosted payment: the processor redirects to
  // ?status=successful (or ?paid=1). Show a confirmation + receipt, then clear
  // the cart and the remembered order so a refresh doesn't reopen the pay step.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const ok = q.get("status") === "successful" || q.get("paid") === "1";
      if (!ok) return;
      let references: string[] = [];
      let receipt: ReceiptData | undefined;
      try {
        const rawPlaced = sessionStorage.getItem(PLACED_KEY);
        if (rawPlaced) {
          const p = JSON.parse(rawPlaced);
          references = (p?.results ?? []).map((r: { reference: string }) => r.reference);
          receipt = p?.receipt;
        }
      } catch {
        /* ignore */
      }
      // Fall back to the tx_ref (CART-<group>-<suffix> → CART-<group>).
      if (references.length === 0) {
        const txRef = q.get("tx_ref");
        if (txRef) references = [txRef.replace(/-[a-z0-9]+$/i, "")];
      }
      setConfirmed({ references, receipt });
      setPlaced(null);
      setView("form");
      try {
        clear();
      } catch {
        /* non-fatal */
      }
      // Strip the query so a refresh doesn't re-trigger the confirmation.
      window.history.replaceState({}, "", "/marketplace/checkout");
    } catch {
      /* non-fatal */
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
  useEffect(() => {
    try {
      if (placed) sessionStorage.setItem(PLACED_KEY, JSON.stringify(placed));
      else sessionStorage.removeItem(PLACED_KEY);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [placed]);

  // Browser Back from the payment step returns to the checkout form instead of
  // leaving the site — we push a history entry when entering "pay" and step the
  // view back on popstate. The placed order stays remembered so it's resumable.
  useEffect(() => {
    const onPop = () => setView("form");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Fully finish this order: forget the placed links and empty the cart.
  function finishOrder() {
    setPlaced(null);
    setView("form");
    clear();
    router.push("/marketplace");
  }
  // Leave the payment step to review/adjust the cart, keeping the order resumable.
  function backToForm() {
    setView("form");
  }
  function resumePayment() {
    setView("pay");
    try {
      window.history.pushState({ ueStep: "pay" }, "");
    } catch {
      /* history unavailable — non-fatal */
    }
  }

  const isCA = (addr.country ?? "US") === "CA";
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
    subtotalCents - discountTotalCents + shippingCents + taxCents,
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

  // Payment confirmed — highest priority (cart is cleared, so this must win over
  // the empty-cart guard below).
  if (confirmed) {
    const r = confirmed.receipt;
    return (
      <div className="ue-rise-in mx-auto max-w-xl py-8" id="ue-receipt">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-cream-soft">✓</div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Payment received</h1>
        <p className="mt-2 text-body-sm text-text-muted">
          Your order is confirmed{r?.email ? <> — a receipt has been emailed to <strong>{r.email}</strong></> : null}.
          We&apos;ll email you tracking as soon as it ships.
        </p>

        {confirmed.references.length > 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-white px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">Order reference</div>
            {confirmed.references.map((ref) => (
              <div key={ref} className="font-mono text-[13px] text-ink">{ref}</div>
            ))}
          </div>
        ) : null}

        {r ? (
          <div className="mt-4 rounded-xl border border-line bg-white p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">Receipt</div>
            {r.stores.map((s, i) => (
              <div key={i} className="mb-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">{s.storeName}</div>
                {s.items.map((it, j) => (
                  <div key={j} className="mt-1 flex items-start justify-between gap-3 text-[12px]">
                    <span className="text-text-2">{it.name}<span className="text-text-subtle"> × {it.quantity}</span></span>
                    <span className="whitespace-nowrap text-ink">{formatUsd(it.totalCents)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="my-3 border-t border-line" />
            <Row label="Items" value={formatUsd(r.subtotalCents)} />
            {r.discountCents > 0 ? <Row label="Discounts" value={`−${formatUsd(r.discountCents)}`} muted /> : null}
            <Row label="Delivery" value={r.shippingCents ? formatUsd(r.shippingCents) : "—"} muted />
            {r.taxCents > 0 ? <Row label="Tax" value={formatUsd(r.taxCents)} muted /> : null}
            <div className="my-3 border-t border-line" />
            <Row label="Total paid" value={formatUsd(r.totalCents)} bold />
          </div>
        ) : (
          <p className="mt-4 text-[12px] text-text-subtle">Your full itemised receipt has been emailed to you.</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream-soft"
          >
            Download receipt (PDF)
          </button>
          <Link href="/marketplace" className="text-[13px] underline">Continue shopping</Link>
        </div>
      </div>
    );
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
      // Snapshot store labels + a receipt so the pay step and the post-payment
      // confirmation still render after the cart + live quote leave memory.
      const receipt: ReceiptData = {
        email: email.trim(),
        paidAt: new Date().toISOString(),
        stores: groups.map((g) => ({
          storeName: g.storeName,
          items: g.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            totalCents: i.unitRetailCents * i.quantity,
          })),
        })),
        subtotalCents,
        discountCents: discountTotalCents,
        shippingCents,
        taxCents,
        totalCents,
      };
      setPlaced({ ...res, storeName: { ...storeName }, receipt });
      setView("pay");
      // Add a history entry so the browser Back button returns here to the form
      // (handled by the popstate listener) rather than leaving the site.
      try {
        window.history.pushState({ ueStep: "pay" }, "");
      } catch {
        /* history unavailable — non-fatal */
      }
      // Note: we intentionally do NOT clear the cart here. The order is placed
      // but unpaid; keeping the cart lets the buyer step back to review, and the
      // resume banner keeps them from double-ordering. The cart is emptied only
      // when they explicitly finish (finishOrder).
    } catch (e) {
      setError(e instanceof StorefrontApiError ? e.message : "Couldn't place your orders.");
    } finally {
      setPlacing(false);
    }
  }

  // Guided payment step after orders are created.
  if (placed && view === "pay") {
    const label = (slug: string) =>
      placed.storeName[slug] ?? storeName[slug] ?? (slug === "cart" ? "Your order" : slug);
    return (
      <div className="ue-rise-in mx-auto max-w-xl py-8">
        <button
          type="button"
          onClick={backToForm}
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-ink"
        >
          ← Back to checkout
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Almost there</h1>
        <p className="mt-2 text-body-sm text-text-muted">
          You&apos;re one step away — complete your secure payment below to place your order.
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
                <span className="block text-[14px] font-medium text-ink">{label(r.slug)}</span>
                <span className="block font-mono text-[12px] text-text-muted">{r.reference}</span>
              </span>
              <span className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-cream-soft">Pay →</span>
            </a>
          ))}
        </div>
        {placed.errors.length > 0 ? (
          <div className="mt-4 rounded-lg border-l-4 border-error bg-error/10 px-3 py-2 text-[12px] text-error">
            Some stores couldn&apos;t be checked out:{" "}
            {placed.errors.map((e) => `${label(e.slug)} (${e.message})`).join("; ")}
          </div>
        ) : null}
        <p className="mt-6 text-[12px] text-text-subtle">
          Payment opens in a new tab, so this page stays here — come back to pay any store you haven&apos;t
          yet. Your order is held for a short while; if it isn&apos;t paid it&apos;s released automatically.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="button" onClick={backToForm} className="text-[13px] underline">
            Review my cart
          </button>
          <button type="button" onClick={finishOrder} className="text-[13px] text-text-muted underline hover:text-ink">
            I&apos;ve finished — clear my cart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ue-rise-in mx-auto max-w-5xl pt-8 md:pt-10">
      <BackLink onClick={() => router.back()} />
      {placed ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink bg-ink/5 px-4 py-3">
          <span className="text-body-sm text-ink">
            You&apos;ve placed this order — it&apos;s waiting for payment.
          </span>
          <button
            type="button"
            onClick={resumePayment}
            className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-cream-soft"
          >
            Resume payment →
          </button>
        </div>
      ) : null}
      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
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
            <div className="sm:col-span-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-text-2">Country</span>
                <select
                  value={addr.country ?? "US"}
                  onChange={(e) =>
                    // Switching country clears the region + postal so a US ZIP
                    // can't linger on a Canadian address (or vice versa).
                    setAddr({ ...addr, country: e.target.value, state: "", postalCode: "" })
                  }
                  className={inputCls}
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </label>
            </div>
            <Text label="Full name" value={addr.recipientName} onChange={(v) => setAddr({ ...addr, recipientName: v })} />
            <Text label="Phone (optional)" value={addr.phone ?? ""} onChange={(v) => setAddr({ ...addr, phone: v })} />
            <div className="sm:col-span-2"><Text label="Address" value={addr.line1} onChange={(v) => setAddr({ ...addr, line1: v })} /></div>
            <div className="sm:col-span-2"><Text label="Apt, suite (optional)" value={addr.line2 ?? ""} onChange={(v) => setAddr({ ...addr, line2: v })} /></div>
            <Text label="City" value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} />
            <Text
              label={isCA ? "Province" : "State"}
              value={addr.state}
              onChange={(v) => setAddr({ ...addr, state: v.toUpperCase() })}
            />
            <Text
              label={isCA ? "Postal code" : "ZIP"}
              value={addr.postalCode}
              onChange={(v) => setAddr({ ...addr, postalCode: isCA ? v.toUpperCase() : v })}
            />
          </div>
          {isCA ? (
            <p className="mt-2 text-[12px] text-text-subtle">
              Use the 2-letter province (e.g. ON, BC, QC). Duties and taxes may apply on delivery.
            </p>
          ) : null}
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

        {/* Discount codes — one entry per store, so a store's promo applies to its
            own items. No vendor/payment internals are shown; the customer just
            enters a code. */}
        {groups.map((g) => {
          const applied = discounts[g.vendorSlug];
          return (
            <Section key={g.vendorSlug} title={groups.length > 1 ? `Discount · ${g.storeName}` : "Discount code"}>
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
            <Row label="Delivery" value={shippingCents ? formatUsd(shippingCents) : "—"} muted />
            {taxCents > 0 ? <Row label="Tax" value={formatUsd(taxCents)} muted /> : null}
            <div className="my-3 border-t border-line" />
            <Row label="Total" value={formatUsd(totalCents)} bold />
            <p className="mt-2 text-[12px] text-text-subtle">
              One delivery for your whole order.
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
