"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["orders", { search }],
    queryFn: () =>
      api.get<{ items: PublicOrder[]; nextCursor: string | null }>(
        `/orders?limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[05] Orders"
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
            <Th>Carrier</Th>
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
                    <span className="font-mono text-body-sm text-text">
                      {o.externalReference ?? o.id.slice(0, 8)}
                    </span>
                    <span className="text-body-sm text-text-muted">
                      {o.recipient.name} · {o.recipient.city}, {o.recipient.state}
                    </span>
                  </div>
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
    </div>
  );
}
