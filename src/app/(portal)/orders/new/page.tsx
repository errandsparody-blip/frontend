"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import {
  recipientAddressSchema,
  type CreateOrderInput,
  type PublicOrder,
  type QuoteRateOption,
  type QuoteResult,
  type RecipientAddress,
} from "@/lib/schemas/orders";
import { US_STATES } from "@/lib/us-states";

type Step = "lines" | "address" | "rates" | "review";

interface SkuOption {
  id: string;
  productCode: string;
  productName: string;
  variant: string;
  quantityAvailable: number;
}

interface InventoryRow {
  id: string;
  productId: string;
  variant: string;
  quantityAvailable: number;
  quantityReserved: number;
  status: string;
}

interface ProductRow {
  id: string;
  code: string;
  name: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const EMPTY_ADDRESS: RecipientAddress = {
  recipientName: "",
  recipientPhone: undefined,
  recipientEmail: undefined,
  shipAddressLine1: "",
  shipAddressLine2: undefined,
  shipCity: "",
  shipState: "",
  shipPostalCode: "",
  shipCountry: "US",
};

export default function NewOrderPage() {
  const router = useRouter();

  // ---- step 1: lines
  const inventoryQ = useQuery({
    queryKey: ["inventory", "active"],
    queryFn: () =>
      api.get<{ items: InventoryRow[] }>("/skus?status=ACTIVE&limit=100"),
  });
  const productsQ = useQuery({
    queryKey: ["products", "for-order-builder"],
    queryFn: () =>
      // 100 is the API cap on this list endpoint; over-asking returns 400
      // and silently ends up looking like an empty product catalog.
      api.get<{ items: ProductRow[] }>("/products?limit=100"),
  });

  const skuOptions: SkuOption[] = useMemo(() => {
    const products = new Map((productsQ.data?.items ?? []).map((p) => [p.id, p]));
    return (inventoryQ.data?.items ?? [])
      .filter((s) => s.status === "ACTIVE" && s.quantityAvailable > 0)
      .map((s) => {
        const p = products.get(s.productId);
        return {
          id: s.id,
          productCode: p?.code ?? s.id,
          productName: p?.name ?? "—",
          variant: s.variant,
          quantityAvailable: s.quantityAvailable,
        };
      });
  }, [inventoryQ.data, productsQ.data]);

  const [lines, setLines] = useState<Array<{ skuId: string; quantity: number }>>([]);

  // ---- step 2: address
  const [address, setAddress] = useState<RecipientAddress>(EMPTY_ADDRESS);
  const [externalReference, setExternalReference] = useState("");

  // ---- step 3: rates
  const [insuranceRequested, setInsuranceRequested] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [chosen, setChosen] = useState<QuoteRateOption | null>(null);
  // Local validation messages (not API errors — those go through the banner).
  // Two flavours: a top-level message ("Add at least one line.") and a
  // per-field map for the address step so we can light up individual inputs.
  const [validationError, setValidationError] = useState<string | null>(null);
  const [addressErrors, setAddressErrors] = useState<Record<string, string>>({});

  const { bannerError, handle, clear } = useApiErrorHandler();

  const [step, setStep] = useState<Step>("lines");
  const [submitted, setSubmitted] = useState<PublicOrder | null>(null);

  // ---- mutations
  const quoteMut = useMutation({
    mutationFn: async () => {
      const parsed = recipientAddressSchema.safeParse(address);
      if (!parsed.success) {
        const first = parsed.error.errors[0];
        throw new Error(first ? `${first.path.join(".")}: ${first.message}` : "Invalid address.");
      }
      return api.post<QuoteResult>("/orders/quote", {
        recipient: parsed.data,
        lines,
        insuranceRequested,
      });
    },
    onMutate: () => {
      clear();
      setValidationError(null);
    },
    onSuccess: (data) => {
      setQuote(data);
      // Preserve the user's previous selection across re-quotes (e.g.
      // toggling insurance) when the same carrier+service is still on
      // offer. Falling back to cheapest is correct for the FIRST quote
      // but destroys an explicit user choice on subsequent re-quotes.
      setChosen((prev) => {
        if (prev) {
          const stillOffered = data.rates.find(
            (r) => r.carrier === prev.carrier && r.service === prev.service,
          );
          if (stillOffered) return stillOffered;
        }
        const cheapest = [...data.rates].sort(
          (a, b) => a.fees.totalChargedCents - b.fees.totalChargedCents,
        )[0];
        return cheapest ?? null;
      });
      setStep("rates");
    },
    onError: (err) => handle(err),
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!chosen) throw new Error("Pick a carrier service first.");
      const parsed = recipientAddressSchema.safeParse(address);
      if (!parsed.success) throw new Error("Address is invalid.");
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload: CreateOrderInput = {
        externalReference: externalReference.trim() || undefined,
        recipient: parsed.data,
        lines,
        carrierService: `${chosen.carrier} ${chosen.service}`,
        insuranceRequested,
        // Cap at 5% above the quoted total so a stale quote can't surprise the vendor.
        maxAcceptableTotalCents: Math.ceil(chosen.fees.totalChargedCents * 1.05),
      };
      return api.post<PublicOrder>("/orders", payload, { idempotencyKey });
    },
    onMutate: () => {
      clear();
      setValidationError(null);
    },
    onSuccess: (o) => {
      setSubmitted(o);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "retry") {
      if (step === "rates" || step === "address") void quoteMut.mutate();
      else if (step === "review") void submitMut.mutate();
    } else if (handler === "support") {
      window.location.href = "mailto:support@myusaerrands.com";
    } else if (handler === "topUp") {
      // `insufficient_funds` from order submit — route the user to the
      // funding page so the "Add funds" button does what it says.
      router.push("/wallet/fund");
    }
  }

  // ---- helpers ------------------------------------------------------------

  function addLine(skuId: string): void {
    if (lines.find((l) => l.skuId === skuId)) return;
    const sku = skuOptions.find((s) => s.id === skuId);
    if (!sku) return;
    setLines((prev) => [...prev, { skuId, quantity: 1 }]);
  }

  function setLineQty(skuId: string, q: number): void {
    setLines((prev) => prev.map((l) => (l.skuId === skuId ? { ...l, quantity: q } : l)));
  }

  function removeLine(skuId: string): void {
    setLines((prev) => prev.filter((l) => l.skuId !== skuId));
  }

  // ---- render -------------------------------------------------------------

  if (submitted) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="[05] Orders / New"
          title="Order submitted"
          description="Stock is reserved and your wallet has been debited. We'll notify you when the label is purchased and the package ships."
        />
        <div className="rounded-md border-l-4 border-success bg-success/10 px-5 py-4">
          <div className="font-mono text-mono-label uppercase text-success">Allocated</div>
          <div className="mt-1 text-h2 font-semibold text-ink">
            #{submitted.orderNumber}
          </div>
          {submitted.externalReference ? (
            <p className="mt-1 font-mono text-caption text-text-muted">
              Your reference: {submitted.externalReference}
            </p>
          ) : null}
          <p className="mt-1 text-body-sm text-text-muted">
            {formatCents(submitted.totalChargedCents)} charged · {submitted.carrierService}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/orders/${submitted.id}`}>
            <Button variant="primary" withArrow>
              View order
            </Button>
          </Link>
          <Link href="/orders">
            <Button variant="outline">Back to orders</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[05] Orders / New"
        title="Create a fulfillment order"
        description="Pick the items, the recipient, and the carrier. Stock + funds are reserved at submit; both can be released by cancelling before pickup."
        actions={
          <button
            type="button"
            onClick={() => router.push("/orders")}
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back
          </button>
        }
      />

      <Stepper step={step} />

      <ErrorBanner error={bannerError} onAction={onAction} />

      {validationError ? (
        <div
          role="alert"
          className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error"
        >
          {validationError}
        </div>
      ) : null}

      {step === "lines" ? (
        <LineBuilder
          skus={skuOptions}
          lines={lines}
          loading={inventoryQ.isLoading || productsQ.isLoading}
          onAdd={addLine}
          onSetQty={setLineQty}
          onRemove={removeLine}
          onNext={() => {
            if (lines.length === 0) {
              setValidationError("Add at least one line.");
              return;
            }
            for (const l of lines) {
              const o = skuOptions.find((s) => s.id === l.skuId);
              if (!o) continue;
              if (l.quantity < 1) {
                setValidationError(`Quantity must be at least 1 on ${o.productCode}.`);
                return;
              }
              if (l.quantity > o.quantityAvailable) {
                setValidationError(
                  `Quantity for ${o.productCode} exceeds available stock (${o.quantityAvailable}).`,
                );
                return;
              }
            }
            setValidationError(null);
            setStep("address");
          }}
        />
      ) : null}

      {step === "address" ? (
        <AddressForm
          address={address}
          externalReference={externalReference}
          fieldErrors={addressErrors}
          onChangeAddress={(next) => {
            // Clear the field-level error as the user corrects it — keeps the
            // form from showing stale red borders after a typo is fixed.
            setAddress(next);
            if (Object.keys(addressErrors).length > 0) {
              setAddressErrors({});
              setValidationError(null);
            }
          }}
          onChangeReference={setExternalReference}
          onBack={() => setStep("lines")}
          onNext={() => {
            const parsed = recipientAddressSchema.safeParse(address);
            if (!parsed.success) {
              // Collect every issue so the user sees ALL missing fields at
              // once, not just the first one.
              const fieldMap: Record<string, string> = {};
              for (const issue of parsed.error.errors) {
                const key = issue.path.join(".");
                if (key && !fieldMap[key]) fieldMap[key] = issue.message;
              }
              setAddressErrors(fieldMap);
              setValidationError(
                parsed.error.errors.length === 1
                  ? "Fix the highlighted field to get rates."
                  : `Fix ${parsed.error.errors.length} highlighted fields to get rates.`,
              );
              return;
            }
            setValidationError(null);
            setAddressErrors({});
            quoteMut.mutate();
          }}
          quoting={quoteMut.isPending}
        />
      ) : null}

      {step === "rates" && quote ? (
        <RateSelector
          quote={quote}
          insuranceRequested={insuranceRequested}
          onToggleInsurance={(b) => {
            setInsuranceRequested(b);
            quoteMut.mutate();
          }}
          chosen={chosen}
          onChoose={setChosen}
          onBack={() => setStep("address")}
          onNext={() => {
            if (!chosen) {
              setValidationError("Pick a service.");
              return;
            }
            setValidationError(null);
            setStep("review");
          }}
        />
      ) : null}

      {step === "review" && chosen ? (
        <ReviewPanel
          chosen={chosen}
          address={address}
          lineCount={lines.length}
          totalUnits={quote?.totalUnits ?? 0}
          externalReference={externalReference}
          submitting={submitMut.isPending}
          onBack={() => setStep("rates")}
          onSubmit={() => submitMut.mutate()}
        />
      ) : null}
    </div>
  );
}

// ===========================================================================

function Stepper({ step }: { step: Step }): JSX.Element {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "lines", label: "Lines" },
    { key: "address", label: "Recipient" },
    { key: "rates", label: "Carrier" },
    { key: "review", label: "Review" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2 font-mono text-mono-label uppercase">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={
              i <= idx
                ? "rounded-sm bg-ink px-2 py-1 text-text-inv"
                : "rounded-sm border border-line px-2 py-1 text-text-subtle"
            }
          >
            {String(i + 1).padStart(2, "0")} · {s.label}
          </span>
          {i < steps.length - 1 ? <span className="text-text-subtle">→</span> : null}
        </li>
      ))}
    </ol>
  );
}

// ===========================================================================

function LineBuilder({
  skus,
  lines,
  loading,
  onAdd,
  onSetQty,
  onRemove,
  onNext,
}: {
  skus: SkuOption[];
  lines: Array<{ skuId: string; quantity: number }>;
  loading: boolean;
  onAdd: (skuId: string) => void;
  onSetQty: (skuId: string, q: number) => void;
  onRemove: (skuId: string) => void;
  onNext: () => void;
}): JSX.Element {
  const [picker, setPicker] = useState("");

  const linesEnriched = lines
    .map((l) => {
      const sku = skus.find((s) => s.id === l.skuId);
      return sku ? { ...l, sku } : null;
    })
    .filter((x): x is { skuId: string; quantity: number; sku: SkuOption } => x !== null);

  return (
    <section className="flex flex-col gap-5 rounded-md border border-line bg-white p-8">
      <h2 className="text-h2 font-semibold text-ink">Lines</h2>
      <Field label="Add SKU">
        <select
          value={picker}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onAdd(v);
            setPicker("");
          }}
          disabled={loading}
          className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
        >
          <option value="">{loading ? "Loading inventory…" : "Pick a product"}</option>
          {skus
            .filter((s) => !lines.find((l) => l.skuId === s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.productCode} · {s.productName} ({s.variant}) — {s.quantityAvailable} avail
              </option>
            ))}
        </select>
      </Field>

      {linesEnriched.length === 0 ? (
        <p className="font-mono text-mono-label uppercase text-text-subtle">No lines yet.</p>
      ) : (
        <DataTable>
          <THead>
            <Th>SKU</Th>
            <Th>Product</Th>
            <Th align="right">Available</Th>
            <Th align="right">Qty</Th>
            <Th align="right">Remove</Th>
          </THead>
          <TBody>
            {linesEnriched.map((l) => (
              <TR key={l.skuId}>
                <Td mono>{l.sku.id}</Td>
                <Td>
                  {l.sku.productName} <span className="text-text-muted">({l.sku.variant})</span>
                </Td>
                <Td num>{l.sku.quantityAvailable}</Td>
                <Td align="right">
                  <input
                    type="number"
                    min={1}
                    max={l.sku.quantityAvailable}
                    value={l.quantity}
                    onChange={(e) => onSetQty(l.skuId, parseInt(e.target.value || "1", 10))}
                    className="h-9 w-20 rounded-sm border border-line-strong bg-white px-2 text-right font-mono text-body-sm text-text outline-none focus:border-ink"
                  />
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    onClick={() => onRemove(l.skuId)}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-error hover:text-ink"
                  >
                    remove
                  </button>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="amber" size="lg" withArrow onClick={onNext}>
          Continue
        </Button>
      </div>
    </section>
  );
}

// ===========================================================================

function AddressForm({
  address,
  externalReference,
  fieldErrors,
  onChangeAddress,
  onChangeReference,
  onBack,
  onNext,
  quoting,
}: {
  address: RecipientAddress;
  externalReference: string;
  /**
   * Per-field error map keyed by `recipientAddressSchema` path (e.g.
   * "recipientName", "shipState"). Empty when the form is clean.
   */
  fieldErrors: Record<string, string>;
  onChangeAddress: (a: RecipientAddress) => void;
  onChangeReference: (s: string) => void;
  onBack: () => void;
  onNext: () => void;
  quoting: boolean;
}): JSX.Element {
  function patch<K extends keyof RecipientAddress>(key: K, value: RecipientAddress[K]): void {
    onChangeAddress({ ...address, [key]: value });
  }
  const errCount = Object.keys(fieldErrors).length;
  return (
    <section className="flex flex-col gap-5 rounded-md border border-line bg-white p-8">
      <h2 className="text-h2 font-semibold text-ink">Recipient</h2>

      {errCount > 0 ? (
        <div
          role="alert"
          className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error"
        >
          {errCount === 1
            ? "1 field needs your attention before we can quote rates."
            : `${errCount} fields need your attention before we can quote rates.`}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Recipient name" error={fieldErrors.recipientName}>
          <Input
            type="text"
            value={address.recipientName}
            invalid={!!fieldErrors.recipientName}
            onChange={(e) => patch("recipientName", e.target.value)}
          />
        </Field>
        <Field label="External reference (optional)" hint="Your order number — Shopify, WooCommerce, etc.">
          <Input
            type="text"
            value={externalReference}
            onChange={(e) => onChangeReference(e.target.value)}
            placeholder="#1042"
          />
        </Field>
        <Field label="Phone" error={fieldErrors.recipientPhone}>
          <Input
            type="tel"
            value={address.recipientPhone ?? ""}
            invalid={!!fieldErrors.recipientPhone}
            onChange={(e) => patch("recipientPhone", e.target.value || undefined)}
          />
        </Field>
        <Field label="Email (optional)" error={fieldErrors.recipientEmail}>
          <Input
            type="email"
            value={address.recipientEmail ?? ""}
            invalid={!!fieldErrors.recipientEmail}
            onChange={(e) => patch("recipientEmail", e.target.value || undefined)}
          />
        </Field>
      </div>

      <Field label="Address line 1" error={fieldErrors.shipAddressLine1}>
        <Input
          type="text"
          value={address.shipAddressLine1}
          invalid={!!fieldErrors.shipAddressLine1}
          onChange={(e) => patch("shipAddressLine1", e.target.value)}
        />
      </Field>
      <Field label="Address line 2 (optional)" error={fieldErrors.shipAddressLine2}>
        <Input
          type="text"
          value={address.shipAddressLine2 ?? ""}
          invalid={!!fieldErrors.shipAddressLine2}
          onChange={(e) => patch("shipAddressLine2", e.target.value || undefined)}
        />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="City" error={fieldErrors.shipCity}>
          <Input
            type="text"
            value={address.shipCity}
            invalid={!!fieldErrors.shipCity}
            onChange={(e) => patch("shipCity", e.target.value)}
          />
        </Field>
        <Field label="State" error={fieldErrors.shipState}>
          {/* US-only in v1 — see PRD §6.6 and the backend regex
              `^[A-Z]{2}$` in order.schema.ts. A native <select> keeps
              keyboard navigation + native mobile pickers without
              pulling in a combobox library. Sorted alphabetically by
              the constant; an empty first option forces an explicit
              choice (no silent default to "AL"). */}
          <select
            aria-label="State"
            value={address.shipState}
            onChange={(e) => patch("shipState", e.target.value)}
            className={`h-11 w-full rounded-sm border bg-cream-soft px-3 text-body text-text outline-none transition-colors duration-fast ease-out focus:ring-2 focus:ring-ink/10 ${
              fieldErrors.shipState ? "border-error" : "border-line-strong hover:border-text/40 focus:border-ink"
            }`}
          >
            <option value="">Select a state…</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="ZIP" error={fieldErrors.shipPostalCode}>
          <Input
            type="text"
            value={address.shipPostalCode}
            invalid={!!fieldErrors.shipPostalCode}
            onChange={(e) => patch("shipPostalCode", e.target.value)}
            placeholder="33101"
          />
        </Field>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button type="button" variant="amber" size="lg" withArrow onClick={onNext} loading={quoting}>
          {quoting ? "Quoting…" : "Get rates"}
        </Button>
      </div>
    </section>
  );
}

// ===========================================================================

function RateSelector({
  quote,
  chosen,
  insuranceRequested,
  onToggleInsurance,
  onChoose,
  onBack,
  onNext,
}: {
  quote: QuoteResult;
  chosen: QuoteRateOption | null;
  insuranceRequested: boolean;
  onToggleInsurance: (b: boolean) => void;
  onChoose: (r: QuoteRateOption) => void;
  onBack: () => void;
  onNext: () => void;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-5 rounded-md border border-line bg-white p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-ink">Carrier service</h2>
        <StatusPill
          tone={
            quote.addressValidation.outcome === "ACCEPTED"
              ? "success"
              : quote.addressValidation.outcome === "NEEDS_VERIFICATION"
                ? "warning"
                : "error"
          }
        >
          Address {quote.addressValidation.outcome.replace(/_/g, " ")}
        </StatusPill>
      </div>

      <label className="flex items-center gap-3 font-mono text-mono-label uppercase">
        <input
          type="checkbox"
          checked={insuranceRequested}
          onChange={(e) => onToggleInsurance(e.target.checked)}
          className="h-4 w-4"
        />
        Insure for {formatCents(quote.declaredValueCents)} (1.5% premium)
      </label>

      <DataTable>
        <THead>
          <Th>Carrier · service</Th>
          <Th align="right">Est. days</Th>
          <Th align="right">Shipping</Th>
          <Th align="right">Fulfillment</Th>
          <Th align="right">Insurance</Th>
          <Th align="right">Total</Th>
          <Th align="right">Pick</Th>
        </THead>
        <TBody>
          {quote.rates.map((r) => {
            const id = `${r.carrier}/${r.service}`;
            const active = chosen ? `${chosen.carrier}/${chosen.service}` === id : false;
            return (
              <TR key={id}>
                <Td strong>
                  {r.carrier} <span className="text-text-muted">{r.service}</span>
                </Td>
                <Td num>{r.estimatedDeliveryDays}</Td>
                <Td num>{formatCents(r.fees.shippingFeeCents)}</Td>
                <Td num>{formatCents(r.fees.fulfillmentFeeCents)}</Td>
                <Td num>{formatCents(r.fees.insuranceFeeCents)}</Td>
                <Td num strong>
                  {formatCents(r.fees.totalChargedCents)}
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    onClick={() => onChoose(r)}
                    className={
                      active
                        ? "rounded-sm bg-ink px-3 py-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-inv"
                        : "rounded-sm border border-line-strong px-3 py-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text hover:border-ink"
                    }
                  >
                    {active ? "Selected" : "Select"}
                  </button>
                </Td>
              </TR>
            );
          })}
        </TBody>
      </DataTable>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button type="button" variant="amber" size="lg" withArrow onClick={onNext}>
          Continue
        </Button>
      </div>
    </section>
  );
}

// ===========================================================================

function ReviewPanel({
  chosen,
  address,
  lineCount,
  totalUnits,
  externalReference,
  submitting,
  onBack,
  onSubmit,
}: {
  chosen: QuoteRateOption;
  address: RecipientAddress;
  lineCount: number;
  totalUnits: number;
  externalReference: string;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-5 rounded-md border border-line bg-white p-8">
      <h2 className="text-h2 font-semibold text-ink">Review</h2>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">Recipient</div>
          <div className="mt-1 text-body text-text">{address.recipientName}</div>
          <div className="font-mono text-body-sm text-text-muted">
            {address.shipAddressLine1}
            {address.shipAddressLine2 ? ` · ${address.shipAddressLine2}` : ""}
            <br />
            {address.shipCity}, {address.shipState} {address.shipPostalCode} · {address.shipCountry}
          </div>
        </div>
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">Service</div>
          <div className="mt-1 text-body text-text">
            {chosen.carrier} {chosen.service}
          </div>
          <div className="font-mono text-body-sm text-text-muted">
            {chosen.estimatedDeliveryDays} day(s) estimated
          </div>
        </div>
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">Lines</div>
          <div className="mt-1 text-body text-text">
            {lineCount} SKU(s), {totalUnits} unit(s)
          </div>
        </div>
        {externalReference ? (
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Reference</div>
            <div className="mt-1 font-mono text-body text-text">{externalReference}</div>
          </div>
        ) : null}
      </div>

      <hr className="border-line" />

      <dl className="grid grid-cols-2 gap-y-1 font-mono text-body-sm">
        <dt className="text-text-muted">Shipping</dt>
        <dd className="text-right text-text">{formatCents(chosen.fees.shippingFeeCents)}</dd>
        <dt className="text-text-muted">Fulfillment</dt>
        <dd className="text-right text-text">{formatCents(chosen.fees.fulfillmentFeeCents)}</dd>
        <dt className="text-text-muted">Insurance</dt>
        <dd className="text-right text-text">{formatCents(chosen.fees.insuranceFeeCents)}</dd>
        <dt className="text-h3 font-semibold text-ink">Total to debit</dt>
        <dd className="text-right text-h3 font-semibold text-ink">
          {formatCents(chosen.fees.totalChargedCents)}
        </dd>
      </dl>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button type="button" variant="amber" size="lg" withArrow onClick={onSubmit} loading={submitting}>
          {submitting ? "Submitting…" : "Submit order"}
        </Button>
      </div>
    </section>
  );
}
