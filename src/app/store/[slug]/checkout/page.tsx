"use client";

/**
 * Checkout (Migration 0059) — address, mandatory email, live Standard/Express
 * shipping (no carrier shown), optional discount, and the payment rail. Places
 * the order and hands off to the processor's hosted checkout.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { buyerAccountApi, getBuyerSession } from "@/lib/buyer-account-api";
import {
  formatUsd,
  storefrontApi,
  StorefrontApiError,
  type CheckoutQuote,
  type ShipAddressInput,
} from "@/lib/storefront-api";

import { useCart } from "../cart-context";
import { useStore } from "../store-shell";

export default function CheckoutPage() {
  const store = useStore();
  const { items, subtotalCents, count } = useCart();
  const base = `/store/${store.slug}`;

  const [addr, setAddr] = useState<ShipAddressInput>({
    recipientName: "",
    line1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });
  const [email, setEmail] = useState("");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [speed, setSpeed] = useState<"STANDARD" | "EXPRESS" | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState<{ code: string; cents: number } | null>(null);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const processors = store.availableProcessors?.length
    ? store.availableProcessors
    : (["STRIPE"] as const);
  const [processor, setProcessor] = useState<"STRIPE" | "FLUTTERWAVE">(processors[0]!);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveDetails, setSaveDetails] = useState(false);

  // Persist the half-filled checkout so a trip out to the payment page and back
  // (cancel / browser back) doesn't wipe what the buyer typed. Per-store,
  // sessionStorage (same-tab, clears when the tab closes).
  const draftKey = `sf_checkout:${store.slug}`;

  // Restore a saved draft on load, before the signed-in prefill runs (prefill
  // only fills blanks, so restored values win).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<{
        addr: ShipAddressInput;
        email: string;
        code: string;
        processor: "STRIPE" | "FLUTTERWAVE";
        speed: "STANDARD" | "EXPRESS";
      }>;
      if (d.addr?.line1) setAddr((prev) => (prev.line1 ? prev : d.addr!));
      if (d.email) setEmail((prev) => prev || d.email!);
      if (d.code) setCode((prev) => prev || d.code!);
      if (d.processor && (processors as ReadonlyArray<string>).includes(d.processor)) setProcessor(d.processor);
      if (d.speed) setSpeed(d.speed);
    } catch {
      /* ignore malformed draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the buyer is signed in, prefill their saved details.
  useEffect(() => {
    if (!getBuyerSession()) return;
    buyerAccountApi
      .me()
      .then((me) => {
        setEmail((prev) => prev || me.profile.email);
        if (me.profile.defaultShipAddress) {
          setAddr((prev) =>
            prev.line1 ? prev : { ...prev, ...me.profile.defaultShipAddress! },
          );
        }
      })
      .catch(() => undefined);
  }, []);

  // Save the draft as the buyer fills it in; drop it once the cart is empty
  // (order placed / cleared) so a stale draft can't linger.
  useEffect(() => {
    try {
      if (count === 0) {
        sessionStorage.removeItem(draftKey);
        return;
      }
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ addr, email, code, processor, speed }),
      );
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [draftKey, addr, email, code, processor, speed, count]);

  const cartLines = useMemo(
    () => items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    [items],
  );
  const addressComplete =
    addr.recipientName && addr.line1 && addr.city && /^[A-Za-z]{2}$/.test(addr.state) && addr.postalCode;

  const selectedOption = quote?.shippingOptions.find((o) => o.speed === speed) ?? null;
  const shippingCents = selectedOption?.costCents ?? 0;
  const fulfillmentCents = quote?.fulfillmentFeeCents ?? 0;
  const taxCents = quote?.taxCents ?? 0;
  const discountCents = discount?.cents ?? 0;
  const totalCents = selectedOption
    ? subtotalCents - discountCents + shippingCents + fulfillmentCents + taxCents
    : subtotalCents - discountCents;

  if (count === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-body-sm text-text-muted">Your cart is empty.</p>
        <Link href={base} className="mt-3 inline-block text-[13px] underline">
          Back to store
        </Link>
      </div>
    );
  }

  async function calcShipping() {
    setError(null);
    setQuoting(true);
    try {
      const q = await storefrontApi.quote(store.slug, cartLines, addr);
      setQuote(q);
      setSpeed(q.shippingOptions[0]?.speed ?? null);
    } catch (e) {
      setError(e instanceof StorefrontApiError ? e.message : "Couldn't calculate shipping.");
      setQuote(null);
    } finally {
      setQuoting(false);
    }
  }

  async function applyCode() {
    setCodeMsg(null);
    if (!code.trim()) return;
    try {
      const res = await storefrontApi.validateDiscount(store.slug, code.trim(), subtotalCents);
      if (res.valid && res.discountCents) {
        setDiscount({ code: res.code ?? code.trim(), cents: res.discountCents });
        setCodeMsg(`Applied − ${formatUsd(res.discountCents)}`);
      } else {
        setDiscount(null);
        setCodeMsg("That code isn't valid for this order.");
      }
    } catch {
      setCodeMsg("Couldn't check that code.");
    }
  }

  async function placeOrder() {
    if (!speed) return;
    setError(null);
    setSubmitting(true);
    try {
      // Save details for faster future checkout (best-effort, buyer's own data).
      if (saveDetails) {
        await buyerAccountApi
          .save({ email: email.trim(), name: addr.recipientName, phone: addr.phone, shipAddress: addr })
          .catch(() => undefined);
      }
      const res = await storefrontApi.checkout(store.slug, {
        items: cartLines,
        shipAddress: addr,
        buyerEmail: email.trim(),
        buyerName: addr.recipientName,
        buyerPhone: addr.phone,
        shippingSpeed: speed,
        processor,
        discountCode: discount?.code,
      });
      window.location.href = res.checkoutUrl;
    } catch (e) {
      setError(e instanceof StorefrontApiError ? e.message : "Couldn't start checkout.");
      setSubmitting(false);
    }
  }

  return (
    <div className="ue-rise-in mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_360px]">
      {/* Form */}
      <div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Checkout</h1>

        <Section title="Contact">
          <Field label="Email (for order updates)" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          </Field>
          <label className="mt-3 flex items-center gap-2 text-[13px] text-text-2">
            <input type="checkbox" checked={saveDetails} onChange={(e) => setSaveDetails(e.target.checked)} />
            Save my details for faster checkout next time
          </label>
          <p className="mt-1 text-[12px] text-text-subtle">
            Have an account?{" "}
            <Link href={`${base}/account`} className="underline">Sign in</Link> to prefill.
          </p>
        </Section>

        <Section title="Delivery address">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <input value={addr.recipientName} onChange={(e) => setAddr({ ...addr, recipientName: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Phone (optional)">
              <input value={addr.phone ?? ""} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} className={inputCls} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address" required>
                <input value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Apt, suite (optional)">
                <input value={addr.line2 ?? ""} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="City" required>
              <input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} className={inputCls} />
            </Field>
            <Field label="State" required>
              <input value={addr.state} maxLength={2} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} className={inputCls} placeholder="TX" />
            </Field>
            <Field label="ZIP" required>
              <input value={addr.postalCode} onChange={(e) => setAddr({ ...addr, postalCode: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <button
            type="button"
            disabled={!addressComplete || quoting}
            onClick={calcShipping}
            className="mt-4 rounded-full border border-line-strong bg-white px-5 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-50"
          >
            {quoting ? "Calculating…" : "Calculate shipping"}
          </button>
        </Section>

        {quote ? (
          <Section title="Delivery speed">
            <div className="grid gap-3">
              {quote.shippingOptions.map((o) => (
                <label
                  key={o.speed}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                    speed === o.speed ? "border-ink bg-white" : "border-line bg-white hover:border-line-strong"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input type="radio" name="speed" checked={speed === o.speed} onChange={() => setSpeed(o.speed)} />
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

        <Section title="Payment">
          <div className="flex flex-wrap gap-2">
            {processors.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProcessor(p)}
                className={`rounded-full px-4 py-2 text-[12px] font-medium transition-colors ${
                  processor === p ? "text-white" : "border border-line-strong bg-white text-text-muted hover:border-ink"
                }`}
                style={processor === p ? { background: "var(--store-accent)" } : undefined}
              >
                {p === "STRIPE" ? "Card" : "Flutterwave"}
              </button>
            ))}
          </div>
        </Section>
      </div>

      {/* Summary */}
      <aside className="h-fit rounded-2xl border border-line bg-white p-5 md:sticky md:top-24">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">
          Order summary
        </div>
        <div className="space-y-2 text-[13px]">
          <Row label={`Subtotal (${count})`} value={formatUsd(subtotalCents)} />
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Discount code"
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-white px-3 py-2 text-[12px] outline-none focus:border-ink"
            />
            <button type="button" onClick={applyCode} className="rounded-lg border border-line-strong px-3 py-2 text-[12px] font-medium hover:border-ink">
              Apply
            </button>
          </div>
          {codeMsg ? <div className="text-[11px] text-text-muted">{codeMsg}</div> : null}
          {discount ? <Row label={`Discount (${discount.code})`} value={`− ${formatUsd(discount.cents)}`} /> : null}
          <Row label="Shipping" value={selectedOption ? formatUsd(shippingCents) : "—"} />
          <Row label="Fulfillment" value={quote ? formatUsd(fulfillmentCents) : "—"} />
          {taxCents > 0 ? <Row label="Tax" value={formatUsd(taxCents)} /> : null}
          <div className="my-2 border-t border-line" />
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold text-ink">Total</span>
            <span className="text-lg font-semibold text-ink">{formatUsd(Math.max(0, totalCents))}</span>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border-l-4 border-error bg-error/10 px-3 py-2 text-[12px] text-error">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          disabled={!email || !addressComplete || !speed || submitting}
          onClick={placeOrder}
          className="mt-5 w-full rounded-full px-6 py-3.5 text-[14px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
          style={{ background: "var(--store-accent)" }}
        >
          {submitting ? "Starting checkout…" : "Pay now"}
        </button>
        <p className="mt-3 text-center text-[11px] text-text-subtle">
          You&apos;ll complete payment on a secure page.
        </p>
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-text-2">
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
