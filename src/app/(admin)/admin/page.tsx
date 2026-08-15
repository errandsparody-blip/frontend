"use client";

/**
 * Admin console overview.
 *
 * Cross-vendor operational dashboard. Numbers come from
 * `GET /v1/admin/dashboard` which now returns a per-status vendor
 * breakdown, the actionable-KYC bucket, every receiving-queue state
 * (including HOLD), and both the per-box and per-SKU inventory views.
 *
 * The pre-2026-05 version of this page silently under-reported on
 * almost every tile: "Active vendors" hid everyone in onboarding /
 * suspended / closed; "Active SKUs" used the wrong inventory unit
 * post-migration-0035; the receiving queue ignored HOLD; "Units on
 * hand" excluded RESERVED stock that's physically in the warehouse.
 * The redesign here corrects each of those.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";

interface AdminOverview {
  vendors: {
    /** Every vendor on the platform, regardless of status. */
    total: number;
    /** Status: ACTIVE — KYC-approved and trading. */
    active: number;
    /** Status: PENDING_KYC — onboarding, not yet trading. */
    onboarding: number;
    /** Status: SUSPENDED — temporarily paused. */
    suspended: number;
    /** Status: CLOSED — offboarded. */
    closed: number;
    /** Back-compat alias for `onboarding` (older response shape). */
    pendingKyc: number;
  };
  kyc: {
    /**
     * Vendors whose kycStatus is in {PENDING, IN_PROGRESS,
     * REQUIRES_RESUBMISSION, EXPIRED}. More accurate than
     * `vendor.status = PENDING_KYC` because REQUIRES_RESUBMISSION and
     * EXPIRED can live on an otherwise-ACTIVE vendor.
     */
    actionable: number;
  };
  receiving: {
    awaiting: number;
    partial: number;
    discrepancy: number;
    hold: number;
  };
  inventory: {
    /** Migration 0035 — physical boxes in the warehouse right now. */
    activeBoxes: number;
    /** Legacy SKU count, kept for back-compat. */
    skuCount: number;
    /** Sum of `quantityAvailable` across ACTIVE + RESERVED SKUs. */
    unitsOnHand: number;
    /** Sum of `quantityReserved` across ACTIVE + RESERVED SKUs. */
    unitsReserved: number;
  };
}

interface InventoryValue {
  /** Total insurable value (cents) of all goods physically in our care. */
  totalValueCents: number;
  totalUnits: number;
  skuCount: number;
  byVendor: Array<{ vendorId: string; businessName: string; valueCents: number; units: number }>;
  byTier: Array<{ tier: string; valueCents: number; units: number }>;
  asOf: string;
}

/** Cents → "$12,345.67". */
function fmtUSD(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const TIER_LABEL: Record<string, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  X_LARGE: "Extra-large",
  PALLET: "Pallet",
};

export default function AdminDashboardPage(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => api.get<AdminOverview>("/admin/dashboard"),
  });

  // Insurable inventory value — polled so the headline climbs on its own
  // as new stock is received (the operator sizes insurance off this). We
  // refetch every 30s and on window focus/reconnect; react-query keeps
  // the last value on screen during refetch so the number never blanks.
  const value = useQuery({
    queryKey: ["admin", "inventory-value"],
    queryFn: () => api.get<InventoryValue>("/admin/dashboard/inventory-value"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Operations"
        title="Console overview"
        description="Cross-vendor view of vendor onboarding, inbound receiving queue, and inventory under management."
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load dashboard."}
        </div>
      ) : data ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Tile
              label="Total vendors"
              value={data.vendors.total.toLocaleString()}
              footnote={
                // Per-status breakdown surfaced underneath the headline
                // so operators see both the platform size AND the
                // mix at a glance. Falls back to "—" if a bucket is 0.
                `${data.vendors.active} active · ${data.vendors.onboarding} onboarding${
                  data.vendors.suspended > 0
                    ? ` · ${data.vendors.suspended} suspended`
                    : ""
                }${data.vendors.closed > 0 ? ` · ${data.vendors.closed} closed` : ""}`
              }
            />
            <Tile
              label="KYC actionable"
              value={data.kyc.actionable.toLocaleString()}
              amber={data.kyc.actionable > 0}
              footnote="pending · in review · resubmit · expired"
            />
            <Tile
              label="Active boxes"
              value={data.inventory.activeBoxes.toLocaleString()}
              footnote={`${data.inventory.skuCount.toLocaleString()} active SKUs`}
            />
          </section>

          {/* Insurable inventory value — headline for insurance sizing.
              Auto-refreshes; value = Σ(declared value × on-hand units)
              across every vendor. Rendered even while `value` is still
              loading so the section doesn't pop in late. */}
          <section className="rounded-md border border-line bg-white p-6">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <div className="font-mono text-mono-label uppercase text-text-muted">
                Insurable inventory value
              </div>
              {value.data ? (
                <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                  as of{" "}
                  {new Date(value.data.asOf).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                  {value.isFetching ? " · refreshing…" : ""}
                </div>
              ) : null}
            </div>
            <p className="mb-4 max-w-prose text-body-sm text-text-muted">
              Live total value of every item physically in our care —
              declared value × units on hand, across all vendors. Use this
              to size your insurance coverage. Updates automatically as new
              stock is received.
            </p>

            {value.error ? (
              <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
                {(value.error as { message?: string }).message ?? "Failed to load inventory value."}
              </div>
            ) : (
              <>
                <div className="text-display-lg font-medium tabular-nums text-ink">
                  {value.data ? fmtUSD(value.data.totalValueCents) : "—"}
                </div>
                <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                  {value.data
                    ? `${value.data.totalUnits.toLocaleString()} units · ${value.data.skuCount.toLocaleString()} SKUs`
                    : "loading…"}
                </div>

                {value.data && value.data.byTier.length > 0 ? (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {value.data.byTier
                      .slice()
                      .sort((a, b) => b.valueCents - a.valueCents)
                      .map((t) => (
                        <div key={t.tier} className="rounded-md border border-line bg-cream-soft p-4">
                          <div className="font-mono text-mono-label uppercase text-text-muted">
                            {TIER_LABEL[t.tier] ?? t.tier}
                          </div>
                          <div className="mt-2 text-h2 font-medium tabular-nums text-ink">
                            {fmtUSD(t.valueCents)}
                          </div>
                          <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                            {t.units.toLocaleString()} units
                          </div>
                        </div>
                      ))}
                  </div>
                ) : null}

                {value.data && value.data.byVendor.length > 0 ? (
                  <div className="mt-6">
                    <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                      By vendor
                    </div>
                    <div className="overflow-hidden rounded-md border border-line">
                      <table className="w-full text-body-sm">
                        <thead className="bg-cream-soft">
                          <tr className="text-left font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                            <th className="px-4 py-2">Vendor</th>
                            <th className="px-4 py-2 text-right">Units</th>
                            <th className="px-4 py-2 text-right">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {value.data.byVendor.map((v) => (
                            <tr key={v.vendorId} className="border-t border-line">
                              <td className="px-4 py-2 text-ink">{v.businessName}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-text-muted">
                                {v.units.toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-ink">
                                {fmtUSD(v.valueCents)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="rounded-md border border-line bg-white p-6">
            <div className="mb-3 font-mono text-mono-label uppercase text-text-muted">
              Receiving queue
            </div>
            <div className="grid gap-6 md:grid-cols-4">
              <QueueStat
                label="Awaiting receipt"
                value={data.receiving.awaiting}
                link="/admin/psn"
              />
              <QueueStat
                label="Partial"
                value={data.receiving.partial}
                link="/admin/psn"
              />
              <QueueStat
                label="Discrepancy"
                value={data.receiving.discrepancy}
                link="/admin/psn"
                amber={data.receiving.discrepancy > 0}
              />
              <QueueStat
                label="On hold"
                value={data.receiving.hold}
                link="/admin/psn"
                amber={data.receiving.hold > 0}
              />
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-6">
            <div className="mb-3 font-mono text-mono-label uppercase text-text-muted">
              Inventory (units)
            </div>
            <p className="mb-4 max-w-prose text-body-sm text-text-muted">
              Per-piece view — sums every active and reserved SKU. For
              the per-box billing view see the &quot;Active boxes&quot;
              tile above or the inventory page on each vendor.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <Tile label="Units on hand" value={data.inventory.unitsOnHand.toLocaleString()} />
              <Tile label="Units reserved" value={data.inventory.unitsReserved.toLocaleString()} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  amber,
  footnote,
}: {
  label: string;
  value: string;
  amber?: boolean;
  footnote?: string;
}): JSX.Element {
  return (
    <div className="rounded-md border border-line bg-white p-6">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className={"mt-3 text-display-lg font-medium tabular-nums " + (amber ? "text-amber" : "text-ink")}>
        {value}
      </div>
      {footnote ? (
        <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

function QueueStat({
  label,
  value,
  link,
  amber,
}: {
  label: string;
  value: number;
  link: string;
  amber?: boolean;
}): JSX.Element {
  return (
    <Link
      href={link}
      className="group flex items-baseline justify-between border-b border-line pb-3 hover:border-ink"
    >
      <span className="font-mono text-mono-label uppercase text-text-muted">{label}</span>
      <span className={"text-h1 font-medium tabular-nums " + (amber ? "text-amber" : "text-ink")}>{value}</span>
    </Link>
  );
}
