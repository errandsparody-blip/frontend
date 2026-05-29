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

export default function AdminDashboardPage(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => api.get<AdminOverview>("/admin/dashboard"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[01] Operations"
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
