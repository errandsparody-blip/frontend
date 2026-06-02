"use client";

/**
 * /admin/config/shopper — friendly editor for the Personal Shopper config.
 *
 * Three config rows live behind this page, each with its own card so the
 * admin can save independently:
 *
 *   shopper_commission_bps     — single integer (basis points)
 *   shopper_warehouse_state    — single 2-letter ISO state code
 *   shopper_tax_rates          — JSON map of state → bps
 *
 * Each section has its own form + save mutation so an admin can tweak the
 * commission without re-saving the entire tax map. PATCHes to
 * /v1/admin/config/<key> are audit-logged with the full before/after JSON.
 *
 * Money math is in BASIS POINTS on the wire (1% = 100 bps) — the inputs
 * accept percent values and convert at submit time. Same single-conversion-
 * boundary pattern as the fees editor.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

interface ConfigRow<T> {
  key: string;
  description: string | null;
  value: T;
  updatedAt: string;
  updatedBy: string | null;
}

// All 50 + DC, in alphabetical order. Used by the warehouse-state dropdown
// AND by the tax-rates table so we render rows in a stable order even if
// the operator's saved JSON has them shuffled.
const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },        { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },        { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },     { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },    { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },        { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },         { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },       { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },           { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },       { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },          { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },      { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },       { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },       { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },     { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },           { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },         { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },   { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },   { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },          { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },        { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },     { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },      { code: "WY", name: "Wyoming" },
];

export default function AdminShopperConfigPage(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="  Configuration / Shopper"
        title="Personal Shopper settings"
        description="Commission rate, payment methods, warehouse state, and per-state estimated sales tax. Each section saves independently. Every change is captured in the audit log with the full before/after JSON."
      />
      <CommissionCard />
      <PaymentMethodsSection />
      <WireThresholdCard />
      <WarehouseStateCard />
      <TaxRatesCard />
      <FreightRatesCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payment methods (May 2026)
//
// All shopper payments are manual. Admin configures up to four channels
// (Wire / ACH / Zelle / Cash App), toggles each one active or inactive,
// and the buyer thread surfaces only the active ones with their details.
// Each method is its own configuration row so they can be audited
// independently:
//
//   shopper_payment_method_wire
//   shopper_payment_method_ach
//   shopper_payment_method_zelle
//   shopper_payment_method_cashapp
//
// All four share the same JSON shape: `{ active: boolean, details: {...} }`.
// The `details` object's exact fields vary per method but the buyer
// thread renders them generically as label-value pairs in the order
// they appear here.
// ---------------------------------------------------------------------------

interface PaymentMethodValue {
  active: boolean;
  details: Record<string, string>;
}

interface PaymentMethodSpec {
  /** Lowercase identifier used in the config key suffix. */
  code: "wire" | "ach" | "zelle" | "cashapp";
  /** Display name shown on the card header and in the buyer picker. */
  label: string;
  /** One-line operator hint shown under the card title. */
  hint: string;
  /** Ordered field definitions for the details object. */
  fields: ReadonlyArray<{
    key: string;
    label: string;
    placeholder?: string;
    /** Single line vs multi-line input (e.g. memo/instructions). */
    multiline?: boolean;
  }>;
}

const PAYMENT_METHODS: ReadonlyArray<PaymentMethodSpec> = [
  {
    code: "wire",
    label: "Wire transfer",
    hint: "Domestic + international bank wires. Use SWIFT for outside-US.",
    fields: [
      { key: "bankName", label: "Bank name", placeholder: "Chase Bank, N.A." },
      { key: "accountName", label: "Account holder name", placeholder: "USA Errands Inc." },
      { key: "accountNumber", label: "Account number", placeholder: "0123456789" },
      { key: "routingNumber", label: "Routing / ABA", placeholder: "021000021" },
      { key: "swift", label: "SWIFT / BIC (international)", placeholder: "CHASUS33" },
      { key: "bankAddress", label: "Bank address", placeholder: "270 Park Ave, New York, NY" },
      {
        key: "memo",
        label: "Required memo / reference",
        placeholder: "Include your order reference in the memo line",
        multiline: true,
      },
    ],
  },
  {
    code: "ach",
    label: "ACH transfer",
    hint: "US-only bank-to-bank transfer. Slower than wire (1–3 business days) and cheaper.",
    fields: [
      { key: "bankName", label: "Bank name", placeholder: "Chase Bank, N.A." },
      { key: "accountName", label: "Account holder name", placeholder: "USA Errands Inc." },
      { key: "accountNumber", label: "Account number", placeholder: "0123456789" },
      { key: "routingNumber", label: "ACH routing number", placeholder: "021000021" },
      {
        key: "memo",
        label: "Required memo / reference",
        placeholder: "Include your order reference in the memo line",
        multiline: true,
      },
    ],
  },
  {
    code: "zelle",
    label: "Zelle",
    hint: "Instant US bank transfer via phone number or email. No fees.",
    fields: [
      { key: "handle", label: "Zelle handle (phone or email)", placeholder: "payments@myusaerrands.com" },
      { key: "recipientName", label: "Recipient name shown in Zelle", placeholder: "USA Errands" },
      {
        key: "memo",
        label: "Required memo / reference",
        placeholder: "Include your order reference in the Zelle memo",
        multiline: true,
      },
    ],
  },
  {
    code: "cashapp",
    label: "Cash App",
    hint: "Send to a $cashtag from the buyer's Cash App account.",
    fields: [
      { key: "cashtag", label: "Cashtag", placeholder: "$myusaerrands" },
      { key: "recipientName", label: "Recipient name shown in Cash App", placeholder: "USA Errands" },
      {
        key: "memo",
        label: "Required memo / reference",
        placeholder: "Include your order reference in the Cash App note",
        multiline: true,
      },
    ],
  },
];

function PaymentMethodsSection(): JSX.Element {
  return (
    <section className="rounded-md border border-line bg-white p-8">
      <header className="mb-6">
        <h2 className="text-h2 font-semibold text-ink">Buyer payment methods</h2>
        <p className="mt-1 max-w-prose text-body-sm text-text-muted">
          Configure the channels buyers can pay you through. Only methods marked
          <em> active</em> are shown on the buyer&apos;s order page — they pick whichever
          they prefer. Inactive methods stay saved (so you can re-enable without
          re-typing) but are hidden from buyers. Buyers always see your order
          reference in their payment instructions so you can match payments back.
        </p>
      </header>
      <div className="flex flex-col gap-6">
        {PAYMENT_METHODS.map((spec) => (
          <PaymentMethodCard key={spec.code} spec={spec} />
        ))}
      </div>
    </section>
  );
}

function PaymentMethodCard({ spec }: { spec: PaymentMethodSpec }): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();
  const configKey = `shopper_payment_method_${spec.code}`;

  const q = useQuery({
    queryKey: ["admin", "config", configKey],
    queryFn: () => api.get<ConfigRow<PaymentMethodValue>>(`/admin/config/${configKey}`),
    // Row may not exist yet on this environment — surface as a one-click
    // "create it" banner instead of treating the missing row as a fatal
    // page error.
    retry: false,
  });

  const [active, setActive] = useState(false);
  const [details, setDetails] = useState<Record<string, string>>({});

  useEffect(() => {
    if (q.data) {
      setActive(Boolean(q.data.value.active));
      // Seed every spec field so unsaved values don't carry over from
      // another method's edit state and the form renders cleanly even
      // when the saved JSON omits a key entirely.
      const seeded: Record<string, string> = {};
      for (const f of spec.fields) {
        const v = q.data.value.details?.[f.key];
        seeded[f.key] = typeof v === "string" ? v : "";
      }
      setDetails(seeded);
    } else if (q.isError) {
      const blank: Record<string, string> = {};
      for (const f of spec.fields) blank[f.key] = "";
      setDetails(blank);
    }
  }, [q.data, q.isError, spec.fields]);

  const save = useMutation({
    mutationFn: (next: PaymentMethodValue) =>
      api.patch<ConfigRow<PaymentMethodValue>>(`/admin/config/${configKey}`, {
        value: next,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "config", configKey] });
    },
    onError: (err) => handle(err),
  });

  function onSave(): void {
    clear();
    // Strip empty strings on save so the persisted JSON stays clean —
    // the buyer thread treats absent keys as "not provided".
    const trimmed: Record<string, string> = {};
    for (const f of spec.fields) {
      const raw = (details[f.key] ?? "").trim();
      if (raw.length > 0) trimmed[f.key] = raw;
    }
    save.mutate({ active, details: trimmed });
  }

  const rowMissing =
    q.isError && (q.error as { code?: string } | null)?.code === "config_unknown";
  const isActive = q.data ? Boolean(q.data.value.active) : false;

  return (
    <div className="rounded-md border border-line bg-cream-soft p-6">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-h3 font-semibold text-ink">{spec.label}</h3>
          <p className="mt-1 text-body-sm text-text-muted">{spec.hint}</p>
        </div>
        <StatusPill tone={isActive ? "success" : "neutral"}>
          {isActive ? "Active — shown to buyers" : "Inactive — hidden"}
        </StatusPill>
      </header>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      {rowMissing ? (
        <div
          role="alert"
          className="mb-4 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4 text-body-sm"
        >
          The <code className="font-mono">{configKey}</code> configuration row
          doesn&apos;t exist yet. Run this SQL once on the Railway Postgres
          Data tab to seed it, then reload this page:
          <pre className="mt-2 overflow-x-auto rounded-sm bg-ink/5 p-3 font-mono text-[11px] text-text">
{`INSERT INTO configuration (key, value, description)
VALUES ('${configKey}', '{"active": false, "details": {}}'::jsonb,
        '${spec.label} payment method for shopper requests.')
ON CONFLICT (key) DO NOTHING;`}
          </pre>
        </div>
      ) : null}

      {q.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : q.data ? (
        <>
          <label className="mb-5 flex items-center gap-3 text-body-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-amber"
            />
            <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text">
              Show this method to buyers on their order page
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            {spec.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.multiline ? (
                  <textarea
                    rows={2}
                    value={details[f.key] ?? ""}
                    onChange={(e) =>
                      setDetails((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    className="min-h-[64px] w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
                  />
                ) : (
                  <Input
                    type="text"
                    value={details[f.key] ?? ""}
                    onChange={(e) =>
                      setDetails((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              onClick={onSave}
              variant="amber"
              size="md"
              loading={save.isPending}
              disabled={save.isPending || !q.data}
            >
              Save {spec.label}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wire-transfer threshold (migration 0023)
//
// Items-subtotal above which a buyer is routed onto the wire-transfer +
// ID-verification track instead of paying by card. Backend reads
// `shopper_wire_threshold_cents` on every intake request; this card lets
// an operator change it without redeploying. Stored in cents; the input
// accepts dollars and converts at submit time. The backend enforces a
// hard cap at $100,000 (anything higher falls back to the $1,000
// default), so we mirror that cap here.
// ---------------------------------------------------------------------------

// Mirrors WIRE_THRESHOLD_MAX_CENTS in shopper.controller.ts so the UI
// rejects values the backend would silently revert.
const WIRE_THRESHOLD_MAX_DOLLARS = 100_000;

function WireThresholdCard(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const q = useQuery({
    queryKey: ["admin", "config", "shopper_wire_threshold_cents"],
    queryFn: () =>
      api.get<ConfigRow<number>>("/admin/config/shopper_wire_threshold_cents"),
    // The row doesn't exist on a fresh DB — surface that as an
    // actionable banner rather than a hard error, since the backend
    // falls back to $1,000 in that case.
    retry: false,
  });

  // Dollar string so the field can be empty mid-typing; re-seeded
  // whenever the loaded value changes.
  const [dollars, setDollars] = useState<string>("");
  useEffect(() => {
    if (q.data) setDollars((q.data.value / 100).toString());
  }, [q.data]);

  const save = useMutation({
    mutationFn: (cents: number) =>
      api.patch<ConfigRow<number>>("/admin/config/shopper_wire_threshold_cents", {
        value: cents,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["admin", "config", "shopper_wire_threshold_cents"],
      });
    },
    onError: (err) => handle(err),
  });

  function onSave(): void {
    clear();
    const value = Number(dollars);
    if (!Number.isFinite(value) || value < 0 || value > WIRE_THRESHOLD_MAX_DOLLARS) return;
    // Round to integer cents — fractional cents would be silently
    // truncated by the backend's Math.floor and we'd rather not have
    // the rendered value drift away from what the operator typed.
    const cents = Math.round(value * 100);
    save.mutate(cents);
  }

  // Row missing on this environment — show a one-click "create it"
  // message rather than failing the page. The backend's GET returns
  // 400 with code config_unknown when the row hasn't been seeded.
  const rowMissing =
    q.isError &&
    (q.error as { code?: string } | null)?.code === "config_unknown";

  return (
    <section className="rounded-md border border-line bg-white p-8">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-h2 font-semibold text-ink">Wire-transfer threshold</h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Items-subtotal above which a buyer must pay by wire transfer and verify their identity
            instead of paying with a card at checkout. Lower this when you want to route more
            traffic through the manual review flow; raise it to keep more orders on the self-serve
            card path. Hard cap is ${WIRE_THRESHOLD_MAX_DOLLARS.toLocaleString()} — anything higher
            is rejected and the backend falls back to the $1,000 default.
          </p>
        </div>
        {q.data ? (
          <StatusPill tone="info">
            Saved · ${(q.data.value / 100).toLocaleString()} ·{" "}
            {new Date(q.data.updatedAt).toLocaleString()}
          </StatusPill>
        ) : null}
      </header>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      {rowMissing ? (
        <div
          role="alert"
          className="mb-4 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4 text-body-sm"
        >
          The <code className="font-mono">shopper_wire_threshold_cents</code> configuration row
          doesn&apos;t exist yet on this environment, so the backend is falling back to the
          $1,000 default. Run this SQL once on the Railway Postgres Data tab to seed it, then
          reload this page:
          <pre className="mt-2 overflow-x-auto rounded-sm bg-ink/5 p-3 font-mono text-[11px] text-text">
{`INSERT INTO configuration (key, value, description)
VALUES ('shopper_wire_threshold_cents', '100000'::jsonb,
        'Items subtotal in cents above which buyers are routed to wire transfer.')
ON CONFLICT (key) DO NOTHING;`}
          </pre>
        </div>
      ) : null}

      {q.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : q.data ? (
        <div className="grid gap-5 md:grid-cols-[1fr_auto_auto]">
          <Field
            label="Threshold (USD)"
            hint="Whole-dollar amount works fine. Stored as cents."
          >
            <div className="flex items-center gap-1">
              <span className="font-mono text-mono-label uppercase text-text-muted">$</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={WIRE_THRESHOLD_MAX_DOLLARS}
                step={1}
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
                placeholder="1000"
              />
            </div>
          </Field>
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">
              Will store as
            </div>
            <div className="mt-2 font-mono text-h3 tabular-nums text-ink">
              {(() => {
                const n = Number(dollars);
                if (!Number.isFinite(n) || n < 0) return "—";
                return `${Math.round(n * 100).toLocaleString()} cents`;
              })()}
            </div>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={onSave}
              variant="amber"
              size="lg"
              loading={save.isPending}
              disabled={
                save.isPending ||
                !q.data ||
                dollars === String(q.data.value / 100) ||
                !Number.isFinite(Number(dollars)) ||
                Number(dollars) < 0 ||
                Number(dollars) > WIRE_THRESHOLD_MAX_DOLLARS
              }
            >
              Save threshold
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Freight rates per shipping method (migration 0017)
//
// Each method has a single per-lb rate in cents. The admin shipping form
// reads these to live-calculate cost as the operator enters total weight,
// and the service uses them at save time to snapshot rate × weight onto
// the request row.
// ---------------------------------------------------------------------------

const SHIPPING_METHODS: ReadonlyArray<{ code: string; name: string; hint: string }> = [
  {
    code: "PLATFORM_FREIGHT",
    name: "Platform freight",
    hint: "We arrange and pay the carrier; buyer pays the rate × weight on the receipt.",
  },
  {
    code: "BUYER_FORWARDER",
    name: "Buyer forwarder",
    hint: "Buyer's own freight forwarder picks up at our warehouse. Usually cheaper.",
  },
  {
    code: "PICKUP",
    name: "Warehouse pickup",
    hint: "In-person pickup. Should be $0 unless you charge handling.",
  },
];

function FreightRatesCard(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const q = useQuery({
    queryKey: ["admin", "config", "shopper_freight_rates"],
    queryFn: () =>
      api.get<ConfigRow<Record<string, number>>>("/admin/config/shopper_freight_rates"),
  });

  // Editable copy keyed by method code; dollar-string values so the
  // input can be empty mid-typing. Re-seeded whenever the loaded value
  // changes (e.g. after a save).
  const [rates, setRates] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) {
      const seeded: Record<string, string> = {};
      for (const m of SHIPPING_METHODS) {
        const cents = q.data.value[m.code];
        seeded[m.code] = cents != null ? (cents / 100).toFixed(2) : "";
      }
      setRates(seeded);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: (next: Record<string, number>) =>
      api.patch<ConfigRow<Record<string, number>>>("/admin/config/shopper_freight_rates", {
        value: next,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "config", "shopper_freight_rates"] });
    },
    onError: (err) => handle(err),
  });

  function onSave(): void {
    clear();
    const out: Record<string, number> = {};
    for (const m of SHIPPING_METHODS) {
      const raw = (rates[m.code] ?? "").trim();
      if (raw.length === 0) {
        // Empty = treat as $0/lb. Cleaner than omitting the key, since
        // the backend's `out[method] ?? 0` semantics rely on PICKUP
        // explicitly sitting at zero.
        out[m.code] = 0;
        continue;
      }
      const dollars = Number(raw);
      // 0 to $1,000/lb. Anything outside is almost certainly a typo.
      if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1000) continue;
      out[m.code] = Math.round(dollars * 100);
    }
    save.mutate(out);
  }

  return (
    <section className="rounded-md border border-line bg-white p-8">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-h2 font-semibold text-ink">Freight rates per pound</h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Per-method rate the system uses to calculate shipping cost from total parcel weight.
            Operators can still override the calculated number on individual orders — the receipt
            shows both so buyers see exactly how the cost was reached.
          </p>
        </div>
        {q.data ? (
          <StatusPill tone="info">
            Saved · {Object.keys(q.data.value).length} methods ·{" "}
            {new Date(q.data.updatedAt).toLocaleString()}
          </StatusPill>
        ) : null}
      </header>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      {q.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {SHIPPING_METHODS.map((m) => {
              const rateStr = rates[m.code] ?? "";
              const rateCents = (() => {
                const n = Number(rateStr);
                return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
              })();
              // Live preview against a 2-lb parcel, the typical mid-
              // range single-package weight.
              const previewCents = Math.round((32 / 16) * rateCents);
              return (
                <div
                  key={m.code}
                  className="grid gap-4 border-b border-line pb-4 md:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <div className="font-mono text-mono-label uppercase text-text">{m.code}</div>
                    <div className="mt-1 text-body-sm text-ink">{m.name}</div>
                    <div className="mt-1 max-w-prose text-body-sm text-text-muted">{m.hint}</div>
                  </div>
                  <Field label="Rate $/lb">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-mono-label uppercase text-text-muted">$</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={1000}
                        step={0.01}
                        value={rateStr}
                        onChange={(e) =>
                          setRates((prev) => ({ ...prev, [m.code]: e.target.value }))
                        }
                        placeholder="0.00"
                        className="h-9 w-28 text-right"
                      />
                      <span className="font-mono text-mono-label uppercase text-text-muted">/ lb</span>
                    </div>
                  </Field>
                  <div>
                    <div className="font-mono text-mono-label uppercase text-text-muted">
                      2 lb parcel
                    </div>
                    <div className="mt-1 font-mono text-h3 tabular-nums text-ink">
                      ${(previewCents / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              onClick={onSave}
              variant="amber"
              size="lg"
              loading={save.isPending}
              disabled={save.isPending || !q.data}
            >
              Save freight rates
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Commission rate — the headline editor
// ---------------------------------------------------------------------------

function CommissionCard(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const q = useQuery({
    queryKey: ["admin", "config", "shopper_commission_bps"],
    queryFn: () => api.get<ConfigRow<number>>("/admin/config/shopper_commission_bps"),
  });

  // Local input state (percent), seeded from the loaded value. Re-syncs
  // whenever the server value changes (e.g. after a successful save).
  const [percent, setPercent] = useState<string>("");
  useEffect(() => {
    if (q.data) setPercent((q.data.value / 100).toString());
  }, [q.data]);

  const save = useMutation({
    mutationFn: (bps: number) =>
      api.patch<ConfigRow<number>>("/admin/config/shopper_commission_bps", { value: bps }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "config", "shopper_commission_bps"] });
    },
    onError: (err) => handle(err),
  });

  function onSave(): void {
    clear();
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return;
    // 1% = 100 bps. Round to an integer so the wire shape matches what
    // the Zod validator on the backend expects.
    const bps = Math.round(pct * 100);
    save.mutate(bps);
  }

  // Live preview: $100 in items @ X% commission.
  const previewBps = Math.round(Number(percent || "0") * 100);
  const previewCommission =
    Number.isFinite(previewBps) && previewBps >= 0 ? Math.floor((10000 * previewBps) / 10000) : 0;

  return (
    <section className="rounded-md border border-line bg-white p-8">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-h2 font-semibold text-ink">Commission rate</h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Platform service fee charged at intake on top of the items subtotal. We compute it as
            a percentage of items, NOT of the total — sales tax and shipping aren&apos;t marked up.
          </p>
        </div>
        {q.data ? (
          <StatusPill tone="info">
            Saved · {(q.data.value / 100).toFixed(2)}% · {new Date(q.data.updatedAt).toLocaleString()}
          </StatusPill>
        ) : null}
      </header>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      {q.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_auto_auto]">
          <Field
            label="Commission percent"
            hint="e.g. 18 = 18%. Range 0–100. Stored as basis points (18 = 1800 bps)."
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="18"
            />
          </Field>
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">
              On $100 of items
            </div>
            <div className="mt-2 font-mono text-h2 tabular-nums text-ink">
              ${(previewCommission / 100).toFixed(2)}
            </div>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={onSave}
              variant="amber"
              size="lg"
              loading={save.isPending}
              disabled={save.isPending || !q.data || percent === String(q.data.value / 100)}
            >
              Save commission
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Warehouse state
// ---------------------------------------------------------------------------

function WarehouseStateCard(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const q = useQuery({
    queryKey: ["admin", "config", "shopper_warehouse_state"],
    queryFn: () => api.get<ConfigRow<string>>("/admin/config/shopper_warehouse_state"),
  });

  const [state, setState] = useState<string>("");
  useEffect(() => {
    if (q.data) setState(q.data.value);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (next: string) =>
      api.patch<ConfigRow<string>>("/admin/config/shopper_warehouse_state", { value: next }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "config", "shopper_warehouse_state"] });
    },
    onError: (err) => handle(err),
  });

  function onSave(): void {
    clear();
    if (!/^[A-Z]{2}$/.test(state)) return;
    save.mutate(state);
  }

  return (
    <section className="rounded-md border border-line bg-white p-8">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-h2 font-semibold text-ink">Warehouse state</h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            We use this state&apos;s rate when estimating sales tax at intake. U.S. retailers
            charge tax based on where they ship to — that&apos;s our warehouse. Update this if you
            move warehouses.
          </p>
        </div>
        {q.data ? (
          <StatusPill tone="info">Saved · {q.data.value}</StatusPill>
        ) : null}
      </header>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      {q.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_auto]">
          <Field label="State">
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 font-sans text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
            >
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={onSave}
              variant="amber"
              size="lg"
              loading={save.isPending}
              disabled={save.isPending || !q.data || state === q.data.value}
            >
              Save warehouse state
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Per-state tax rates (the full map)
// ---------------------------------------------------------------------------

function TaxRatesCard(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const q = useQuery({
    queryKey: ["admin", "config", "shopper_tax_rates"],
    queryFn: () =>
      api.get<ConfigRow<Record<string, number>>>("/admin/config/shopper_tax_rates"),
  });

  // Editable copy — keyed by state code, percent strings (so empty is
  // valid while the user types). Re-seeded whenever the loaded value
  // changes.
  const [rates, setRates] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) {
      const seeded: Record<string, string> = {};
      for (const s of US_STATES) {
        const bps = q.data.value[s.code];
        seeded[s.code] = bps != null ? (bps / 100).toString() : "";
      }
      setRates(seeded);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: (next: Record<string, number>) =>
      api.patch<ConfigRow<Record<string, number>>>("/admin/config/shopper_tax_rates", {
        value: next,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "config", "shopper_tax_rates"] });
    },
    onError: (err) => handle(err),
  });

  function onSave(): void {
    clear();
    const out: Record<string, number> = {};
    for (const s of US_STATES) {
      const raw = (rates[s.code] ?? "").trim();
      if (raw.length === 0) continue;
      const pct = Number(raw);
      // Skip invalid entries silently so a typo in one row doesn't block
      // the rest. Out-of-range gets surfaced through the backend Zod
      // validator on the next attempt.
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) continue;
      out[s.code] = Math.round(pct * 100);
    }
    save.mutate(out);
  }

  return (
    <section className="rounded-md border border-line bg-white p-8">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-h2 font-semibold text-ink">Estimated sales tax by state</h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Combined-average state + local sales tax used to estimate the buyer&apos;s prepayment
            at intake. Reconciled against the actual tax we paid during procurement, so values
            here only need to be roughly right.
          </p>
        </div>
        {q.data ? (
          <StatusPill tone="info">
            Saved · {Object.keys(q.data.value).length} states ·{" "}
            {new Date(q.data.updatedAt).toLocaleString()}
          </StatusPill>
        ) : null}
      </header>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      {q.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : (
        <>
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-3">
            {US_STATES.map((s) => (
              <label
                key={s.code}
                className="flex items-center justify-between gap-3 border-b border-line py-2"
              >
                <span className="font-mono text-body-sm text-text">
                  {s.code}
                  <span className="ml-2 text-text-muted">{s.name}</span>
                </span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.01}
                    value={rates[s.code] ?? ""}
                    onChange={(e) =>
                      setRates((prev) => ({ ...prev, [s.code]: e.target.value }))
                    }
                    placeholder="0"
                    className="h-9 w-24 text-right"
                  />
                  <span className="font-mono text-mono-label uppercase text-text-muted">%</span>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              onClick={onSave}
              variant="amber"
              size="lg"
              loading={save.isPending}
              disabled={save.isPending || !q.data}
            >
              Save tax rates
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
