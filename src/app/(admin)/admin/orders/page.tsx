"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import {
  FilterBar,
  FilterDateRange,
  FilterSelect,
  type FilterOption,
} from "@/components/admin/filters";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";

interface AdminOrderRow {
  id: string;
  orderNumber: number;
  status:
    | "ON_HOLD"
    | "ALLOCATED"
    | "LABEL_PURCHASED"
    | "PICKING"
    | "PACKED"
    | "SHIPPED"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "HANDED_OFF"
    | "EXCEPTION"
    | "CANCELLED"
    | "RETURNED";
  externalReference: string | null;
  recipientName: string;
  shipCity: string;
  shipState: string;
  carrierService: string | null;
  trackingNumber: string | null;
  totalChargedCents: number;
  allocatedAt: string | null;
  vendor: { id: string; businessName: string; country: string };
  lines: Array<{ id: string; quantity: number; productName: string }>;
  /**
   * Migration 0037 — `PLATFORM_SHIP` is a USA Errands-bought carrier
   * label; `VENDOR_CARRIER` is the vendor's own label / carrier hand-off.
   * Older orders pre-migration default to `PLATFORM_SHIP` (server-side
   * default), so this field is always present on the wire.
   */
  fulfillmentMode: "PLATFORM_SHIP" | "VENDOR_CARRIER";
  vendorCarrierName: string | null;
  vendorTrackingNumber: string | null;
  // Migration 0038 — storefront-integration provenance + hold lifecycle.
  // source = "API" for orders pushed from a vendor's website; holdReason is
  // set only while status = ON_HOLD.
  source: "MANUAL" | "API";
  holdReason: string | null;
  createdAt: string;
}

// Tabs the operator sees, in workflow order. Queue = work in front of you;
// the post-packed statuses are for "where did my order go?" lookups and
// audit trails. "All" omits the filter entirely (`view=all` on the API).
const QUEUE_STATUSES = ["ALLOCATED", "LABEL_PURCHASED", "PICKING", "PACKED"] as const;
const POST_QUEUE_STATUSES = [
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED",
  // Migration 0037 — terminal status for VENDOR_CARRIER orders. Slotted
  // next to DELIVERED in the filter row so operators looking up
  // completed orders find both branches in the same place.
  "HANDED_OFF",
  "EXCEPTION",
  "CANCELLED",
  "RETURNED",
] as const;

const TONE: Record<AdminOrderRow["status"], "info" | "success" | "warning" | "error" | "neutral"> = {
  ON_HOLD: "warning",
  ALLOCATED: "info",
  LABEL_PURCHASED: "info",
  PICKING: "warning",
  PACKED: "warning",
  SHIPPED: "info",
  IN_TRANSIT: "info",
  DELIVERED: "success",
  // Migration 0037 — terminal success state for VENDOR_CARRIER orders.
  // We don't observe carrier delivery (no Shippo webhook), so "handed
  // off" is as good as it gets — treated as a success outcome.
  HANDED_OFF: "success",
  EXCEPTION: "error",
  CANCELLED: "error",
  RETURNED: "warning",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Tab values: "queue" (default), "all", or any specific status.
type TabValue =
  | "queue"
  | "all"
  | "ON_HOLD"
  | (typeof QUEUE_STATUSES)[number]
  | (typeof POST_QUEUE_STATUSES)[number];

const ORDER_STATUS_OPTIONS: FilterOption[] = [
  { value: "queue", label: "Queue (active)" },
  // Migration 0038 — storefront orders parked awaiting a fix (funds / mapping).
  { value: "ON_HOLD", label: "Held (storefront)" },
  ...QUEUE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
  ...POST_QUEUE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
  { value: "all", label: "All" },
];

// Human-readable hold reasons for the operator queue.
const HOLD_REASON_LABEL: Record<string, string> = {
  INSUFFICIENT_FUNDS: "Low wallet — will auto-release on top-up",
  UNMAPPED_SKU: "Unmatched SKU — fix the product code",
  INSUFFICIENT_STOCK: "Not enough stock on hand",
  ADDRESS_INVALID: "Address couldn't be verified",
};

export default function AdminOrdersQueuePage() {
  const [tab, setTab] = useState<TabValue>("queue");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (tab === "all") {
    params.set("view", "all");
  } else if (tab !== "queue") {
    params.set("status", tab);
  }
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "orders", { tab, from, to }],
    queryFn: () =>
      api.get<{ items: AdminOrderRow[]; nextCursor: string | null }>(
        `/admin/orders?${params.toString()}`,
      ),
  });

  // Migration 0038 — retry allocation on a held storefront order after the
  // blocker is resolved (funds added, SKU received, address fixed).
  const releaseMut = useMutation({
    mutationFn: (id: string) =>
      api.post<{ released: boolean; status: string; holdReason: string | null }>(
        `/admin/orders/${id}/release`,
      ),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      toast.show({
        title: res.released
          ? "Order released into fulfillment."
          : `Still held: ${HOLD_REASON_LABEL[res.holdReason ?? ""] ?? res.holdReason ?? "unresolved"}`,
        severity: res.released ? "success" : "warning",
      });
    },
    onError: () => toast.show({ title: "Couldn't release the order.", severity: "error" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Fulfillment"
        title="Order queue"
        description="Buy labels, pick, pack, and ship. Each transition is captured in the order's append-only timeline."
      />

      <FilterBar
        gridClassName="md:grid-cols-[220px_200px_200px]"
        onClear={() => {
          setTab("queue");
          setFrom("");
          setTo("");
        }}
        canClear={tab !== "queue" || from !== "" || to !== ""}
      >
        <FilterSelect
          label="Status"
          value={tab}
          onChange={(v) => setTab(v as TabValue)}
          options={ORDER_STATUS_OPTIONS}
        />
        <FilterDateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load orders."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Queue is empty" description="No orders are waiting on you right now." />
      ) : (
        <DataTable>
          <THead>
            <Th>Order</Th>
            <Th>Date</Th>
            <Th>Vendor</Th>
            <Th>Recipient</Th>
            <Th>Status</Th>
            <Th>Carrier</Th>
            <Th align="right">Lines</Th>
            <Th align="right">Charged</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((o) => (
              <TR key={o.id}>
                <Td mono strong>
                  #{o.orderNumber}
                  {o.externalReference ? (
                    <div className="font-mono text-caption font-normal text-text-muted">
                      {o.externalReference}
                    </div>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap text-text-muted">{formatDate(o.createdAt)}</Td>
                <Td strong>{o.vendor.businessName}</Td>
                <Td>
                  {o.recipientName}{" "}
                  <span className="text-text-muted">
                    · {o.shipCity}, {o.shipState}
                  </span>
                </Td>
                <Td>
                  <StatusPill tone={TONE[o.status]}>{o.status.replace(/_/g, " ")}</StatusPill>
                  {o.source === "API" && o.status !== "ON_HOLD" ? (
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[1.1px] text-text-muted">
                      Storefront
                    </div>
                  ) : null}
                  {o.status === "ON_HOLD" && o.holdReason ? (
                    <div className="mt-1 max-w-[180px] text-caption text-amber">
                      {HOLD_REASON_LABEL[o.holdReason] ?? o.holdReason}
                    </div>
                  ) : null}
                </Td>
                <Td mono className="text-text-muted">
                  {o.fulfillmentMode === "VENDOR_CARRIER" ? (
                    <div className="flex flex-col gap-0.5">
                      {/* Migration 0037 — make the branch unmistakable in the
                          operator queue. We render the vendor's carrier name
                          if they typed one, but ALWAYS prefix with the badge
                          so it's never confused with a USA Errands-bought
                          label. */}
                      <span className="inline-flex w-fit items-center rounded-sm border border-amber/30 bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[1.1px] text-amber">
                        Fulfillment only
                      </span>
                      <span>
                        {o.vendorCarrierName?.trim() ||
                          o.carrierService ||
                          "Vendor label"}
                      </span>
                    </div>
                  ) : (
                    (o.carrierService ?? "—")
                  )}
                </Td>
                <Td num>{o.lines.length}</Td>
                <Td num strong>
                  {formatCents(o.totalChargedCents)}
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-3">
                    {o.status === "ON_HOLD" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={releaseMut.isPending && releaseMut.variables === o.id}
                        onClick={() => releaseMut.mutate(o.id)}
                      >
                        Release
                      </Button>
                    ) : null}
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                    >
                      Open →
                    </Link>
                  </div>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}

