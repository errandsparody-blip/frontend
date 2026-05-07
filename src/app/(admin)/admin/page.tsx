"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";

interface AdminOverview {
  vendors: { active: number; pendingKyc: number };
  receiving: { awaiting: number; partial: number; discrepancy: number };
  inventory: { skuCount: number; unitsOnHand: number; unitsReserved: number };
}

export default function AdminDashboardPage() {
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
            <Tile label="Active vendors" value={data.vendors.active.toString()} />
            <Tile label="Pending KYC" value={data.vendors.pendingKyc.toString()} amber={data.vendors.pendingKyc > 0} />
            <Tile label="Active SKUs" value={data.inventory.skuCount.toString()} />
          </section>

          <section className="rounded-md border border-line bg-white p-6">
            <div className="mb-3 font-mono text-mono-label uppercase text-text-muted">Receiving queue</div>
            <div className="grid gap-6 md:grid-cols-3">
              <QueueStat label="Awaiting receipt" value={data.receiving.awaiting} link="/admin/psn?status=AWAITING_RECEIPT" />
              <QueueStat label="Partial" value={data.receiving.partial} link="/admin/psn?status=PARTIALLY_RECEIVED" />
              <QueueStat label="Discrepancy" value={data.receiving.discrepancy} link="/admin/psn?status=DISCREPANCY" amber={data.receiving.discrepancy > 0} />
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-6">
            <div className="mb-3 font-mono text-mono-label uppercase text-text-muted">Inventory</div>
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

function Tile({ label, value, amber }: { label: string; value: string; amber?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-white p-6">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className={"mt-3 text-display-lg font-medium tabular-nums " + (amber ? "text-amber" : "text-ink")}>
        {value}
      </div>
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
}) {
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
