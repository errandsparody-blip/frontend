"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

interface AdminOrderRow {
  id: string;
  orderNumber: number;
  status:
    | "ALLOCATED"
    | "LABEL_PURCHASED"
    | "PICKING"
    | "PACKED"
    | "SHIPPED"
    | "IN_TRANSIT"
    | "DELIVERED"
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
}

// Tabs the operator sees, in workflow order. Queue = work in front of you;
// the post-packed statuses are for "where did my order go?" lookups and
// audit trails. "All" omits the filter entirely (`view=all` on the API).
const QUEUE_STATUSES = ["ALLOCATED", "LABEL_PURCHASED", "PICKING", "PACKED"] as const;
const POST_QUEUE_STATUSES = [
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED",
  "EXCEPTION",
  "CANCELLED",
  "RETURNED",
] as const;

const TONE: Record<AdminOrderRow["status"], "info" | "success" | "warning" | "error" | "neutral"> = {
  ALLOCATED: "info",
  LABEL_PURCHASED: "info",
  PICKING: "warning",
  PACKED: "warning",
  SHIPPED: "info",
  IN_TRANSIT: "info",
  DELIVERED: "success",
  EXCEPTION: "error",
  CANCELLED: "error",
  RETURNED: "warning",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Tab values: "queue" (default), "all", or any specific status.
type TabValue = "queue" | "all" | (typeof QUEUE_STATUSES)[number] | (typeof POST_QUEUE_STATUSES)[number];

export default function AdminOrdersQueuePage() {
  const [tab, setTab] = useState<TabValue>("queue");

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (tab === "all") {
    params.set("view", "all");
  } else if (tab !== "queue") {
    params.set("status", tab);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "orders", { tab }],
    queryFn: () =>
      api.get<{ items: AdminOrderRow[]; nextCursor: string | null }>(
        `/admin/orders?${params.toString()}`,
      ),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Fulfillment"
        title="Order queue"
        description="Buy labels, pick, pack, and ship. Each transition is captured in the order's append-only timeline."
      />

      <div className="flex flex-wrap items-center gap-2 font-mono text-mono-label uppercase">
        <span className="text-text-muted">Filter</span>
        <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
          Queue
        </TabButton>
        {QUEUE_STATUSES.map((s) => (
          <TabButton key={s} active={tab === s} onClick={() => setTab(s)}>
            {s.replace(/_/g, " ")}
          </TabButton>
        ))}
        <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
        {POST_QUEUE_STATUSES.map((s) => (
          <TabButton key={s} active={tab === s} onClick={() => setTab(s)}>
            {s.replace(/_/g, " ")}
          </TabButton>
        ))}
        <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          All
        </TabButton>
      </div>

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
                <Td strong>{o.vendor.businessName}</Td>
                <Td>
                  {o.recipientName}{" "}
                  <span className="text-text-muted">
                    · {o.shipCity}, {o.shipState}
                  </span>
                </Td>
                <Td>
                  <StatusPill tone={TONE[o.status]}>{o.status.replace(/_/g, " ")}</StatusPill>
                </Td>
                <Td mono className="text-text-muted">
                  {o.carrierService ?? "—"}
                </Td>
                <Td num>{o.lines.length}</Td>
                <Td num strong>
                  {formatCents(o.totalChargedCents)}
                </Td>
                <Td align="right">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                  >
                    Open →
                  </Link>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-sm bg-ink px-3 py-1 text-text-inv"
          : "rounded-sm border border-line-strong px-3 py-1 text-text hover:border-ink"
      }
    >
      {children}
    </button>
  );
}
