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
        eyebrow="[07] Configuration / Shopper"
        title="Personal Shopper settings"
        description="Commission rate, warehouse state, and per-state estimated sales tax. Each section saves independently. Every change is captured in the audit log with the full before/after JSON."
      />
      <CommissionCard />
      <WarehouseStateCard />
      <TaxRatesCard />
      <FreightRatesCard />
    </div>
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
