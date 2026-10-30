"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageSizeSelect, Pagination, useCursorPagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { OrderStatus, PublicOrder } from "@/lib/schemas/orders";

const TONE: Record<OrderStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  ALLOCATED: "info",
  LABEL_PURCHASED: "info",
  PICKING: "warning",
  PACKED: "warning",
  SHIPPED: "info",
  IN_TRANSIT: "info",
  DELIVERED: "success",
  // terminal success state for VENDOR_CARRIER orders.
  HANDED_OFF: "success",
  // v2 lifecycle states. All treated as "in progress"
  // from the vendor's viewpoint — none are terminal. AWAITING_WALLET_FUNDING
  // is amber-tinted (warning) so the vendor notices they need to act.
  PENDING_PACKING: "info",
  PACKING_COMPLETED: "info",
  AWAITING_SHIPPING_SELECTION: "info",
  AWAITING_WALLET_FUNDING: "warning",
  SHIPPING_PAID: "info",
  EXCEPTION: "error",
  CANCELLED: "error",
  RETURNED: "warning",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function OrdersListPage() {
  const [search, setSearch] = useState("");

  const page = useCursorPagination();
  const { reset: resetPage } = page;
  useEffect(() => {
    resetPage();
  }, [search, resetPage]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["orders", { search, cursor: page.cursor, pageSize: page.pageSize }],
    queryFn: () =>
      api.get<{ items: PublicOrder[]; nextCursor: string | null }>(
        `/orders?limit=${page.pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}${page.cursor ? `&cursor=${page.cursor}` : ""}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Orders"
        title="Outbound shipments"
        description="Submit fulfillment orders. Stock is reserved and the wallet is debited at submit time; both are released on cancel."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                api.download("/exports/orders.csv", `orders_${new Date().toISOString().slice(0, 10)}.csv`).catch(() => undefined)
              }
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
            >
              Download CSV
            </button>
            {/* Migration 0046 — vendor CSV bulk import. */}
            <Link
              href="/orders/import"
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
            >
              Bulk import →
            </Link>
            <Link href="/orders/new">
              <Button variant="amber" withArrow>
                New order
              </Button>
            </Link>
          </div>
        }
      />

      <div className="max-w-md">
        <Input
          type="text"
          placeholder="Search by reference, tracking, recipient…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-3 flex justify-end"><PageSizeSelect value={page.pageSize} onChange={page.setPageSize} /></div>
      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load orders."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Submit your first order once you've received inventory."
          action={
            <Link href="/orders/new">
              <Button variant="primary" withArrow>
                Create your first order
              </Button>
            </Link>
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Reference / Recipient</Th>
            <Th>Status</Th>
            <Th>Carrier / Tracking</Th>
            <Th align="right">Weight</Th>
            <Th align="right">Lines</Th>
            <Th align="right">Charged</Th>
            <Th>Submitted</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((o) => (
              <TR key={o.id}>
                <Td>
                  <div className="flex flex-col">
                    {/* Platform-assigned, monotonic order number — the
                        primary identifier vendors recognise. If they ALSO
                        provided their own external reference we render it
                        beneath as a smaller "your ref" line so they can
                        cross-check against their own OMS. */}
                    <span className="font-mono text-body-sm font-semibold text-text">
                      #{o.orderNumber}
                    </span>
                    {o.externalReference ? (
                      <span className="font-mono text-caption text-text-muted">
                        Your ref: {o.externalReference}
                      </span>
                    ) : null}
                    <span className="text-body-sm text-text-muted">
                      {o.recipient.name} · {o.recipient.city}, {o.recipient.state}
                    </span>
                  </div>
                </Td>
                <Td>
                  <StatusPill tone={TONE[o.status]}>{o.status.replace(/_/g, " ")}</StatusPill>
                </Td>
                <Td className="text-text-muted">
                  <CarrierCell order={o} />
                </Td>
                <Td num>
                  <WeightCell order={o} />
                </Td>
                <Td num>{o.lines.length}</Td>
                <Td num strong>
                  {formatCents(o.totalChargedCents)}
                </Td>
                <Td mono className="text-text-muted">
                  {o.submittedAt ? new Date(o.submittedAt).toLocaleDateString() : "—"}
                </Td>
                <Td align="right">
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                  >
                    Open →
                  </Link>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}

      {!isLoading && !error && data && data.items.length > 0 ? (
        <Pagination
          page={page.page}
          hasPrev={page.hasPrev}
          hasNext={Boolean(data.nextCursor)}
          loading={isFetching}
          onPrev={page.prev}
          onNext={() => page.next(data.nextCursor)}
        />
      ) : null}
    </div>
  );
}

/**
 * Carrier / tracking cell. Shows the actual shipping company (DHL, FedEx,
 * USPS, UPS…) as the primary line — not just the service level — with the
 * service beneath it, and the tracking number with a one-tap copy button
 * so vendors don't have to open the order to grab it.
 *
 * Carrier identity differs by fulfillment mode:
 *   PLATFORM_SHIP   → set when USA Errands buys the label (carrier /
 *                     carrierService / trackingNumber).
 *   VENDOR_CARRIER  → the vendor's own carrier + tracking they supplied.
 * Until a label is bought / tracking is known, these are null and we show
 * a dash rather than an empty cell.
 */
/** oz → a compact "X.X lb" (or "N oz" under a pound). */
function formatWeight(oz: number): string {
  const lb = oz / 16;
  return lb >= 1 ? `${lb.toFixed(1)} lb` : `${Math.round(oz)} oz`;
}

/**
 * Package weight. Shows the ACTUAL packed weight once the warehouse records
 * it; before that, shows the ESTIMATE from product weights (tagged "est."),
 * so vendors can gauge weight while setting their own shipping rates.
 */
function WeightCell({ order }: { order: PublicOrder }): JSX.Element {
  const actual = order.packedWeightOz;
  const oz = actual ?? order.estimatedWeightOz;
  if (oz == null) return <span className="text-text-subtle">—</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={actual != null ? "font-medium text-text" : "text-text-muted"}>
        {formatWeight(oz)}
      </span>
      {actual == null ? (
        <span className="font-mono text-[9px] uppercase tracking-[1px] text-text-subtle">est.</span>
      ) : null}
    </span>
  );
}

function CarrierCell({ order }: { order: PublicOrder }): JSX.Element {
  const isVendor = order.fulfillmentMode === "VENDOR_CARRIER";
  const carrierName = isVendor
    ? order.vendorCarrierName?.trim() || null
    : order.carrier?.trim() || null;
  const service = isVendor ? null : order.carrierService?.trim() || null;
  const tracking = isVendor
    ? order.vendorTrackingNumber?.trim() || null
    : order.trackingNumber?.trim() || null;

  return (
    <div className="flex flex-col gap-0.5">
      {isVendor ? (
        <span className="inline-flex w-fit items-center rounded-sm border border-amber/30 bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[1.1px] text-amber">
          Your carrier
        </span>
      ) : null}
      <span className="font-medium text-text">
        {carrierName ?? (isVendor ? "Your label" : "—")}
      </span>
      {service ? (
        <span className="font-mono text-caption text-text-muted">{service}</span>
      ) : null}
      {tracking ? <CopyTracking value={tracking} /> : null}
    </div>
  );
}

/** Tracking number + inline copy button. */
function CopyTracking({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the number is still visible to select manually */
    }
  }
  return (
    <span className="mt-0.5 inline-flex items-center gap-1.5">
      <span className="font-mono text-caption text-text" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 font-mono text-[10px] uppercase tracking-[1.1px] text-amber hover:text-amber-hi"
        aria-label="Copy tracking number"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </span>
  );
}
