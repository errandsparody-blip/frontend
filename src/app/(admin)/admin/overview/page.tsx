"use client";

/**
 * Operational-admin overview — a small snapshot of what the signed-in admin
 * looks after: assigned vendors, orders waiting on them, and PSNs awaiting
 * receipt. Scoped server-side to their vendors + country (SUPER_ADMIN sees
 * platform-wide totals).
 */

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";

interface Overview {
  country: "US" | "CA" | null;
  assignedVendors: number;
  pendingOrders: number;
  awaitingPsns: number;
}

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const inner = (
    <div className="rounded-md border border-line bg-white p-6">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className="mt-2 text-display-sm font-medium tabular-nums text-ink">{value}</div>
    </div>
  );
  return href ? (
    <a href={href} className="block transition-colors hover:border-ink [&>div]:hover:border-ink">
      {inner}
    </a>
  ) : (
    inner
  );
}

export default function AdminOverviewPage(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.get<Overview>("/admin/overview"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Overview"
        title="Your overview"
        description={
          data?.country
            ? `A snapshot of your ${data.country === "CA" ? "Canada" : "USA"} workload — the vendors you manage and what's waiting on you.`
            : "A snapshot of the platform — vendors, orders waiting to ship, and inbound shipments awaiting receipt."
        }
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load overview."}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Vendors you manage" value={data.assignedVendors} />
          <Stat label="Orders pending" value={data.pendingOrders} href="/admin/orders" />
          <Stat label="PSNs awaiting receipt" value={data.awaitingPsns} href="/admin/psn" />
        </div>
      ) : null}
    </div>
  );
}
