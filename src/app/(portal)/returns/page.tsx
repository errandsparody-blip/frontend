"use client";

import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

interface ReturnRow {
  id: string;
  rmaCode: string;
  status:
    | "REQUESTED"
    | "AUTHORIZED"
    | "IN_TRANSIT"
    | "RECEIVED"
    | "INSPECTED"
    | "RESTOCKED"
    | "DISPOSED"
    | "REJECTED"
    | "CANCELLED";
  reason: string;
  refundAmountCents: number;
  restockFeeCents: number;
  inboundTracking: string | null;
  inboundCarrier: string | null;
  createdAt: string;
  resolvedAt: string | null;
  lines: Array<{
    id: string;
    requestedQty: number;
    receivedQty: number;
    restockedQty: number;
  }>;
}

const TONE: Record<ReturnRow["status"], "neutral" | "info" | "success" | "warning" | "error"> = {
  REQUESTED: "neutral",
  AUTHORIZED: "info",
  IN_TRANSIT: "info",
  RECEIVED: "warning",
  INSPECTED: "warning",
  RESTOCKED: "success",
  DISPOSED: "error",
  REJECTED: "error",
  CANCELLED: "error",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VendorReturnsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["returns"],
    queryFn: () => api.get<{ items: ReturnRow[]; nextCursor: string | null }>("/returns?limit=50"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[06] Returns"
        title="Return authorisations"
        description="Open an RMA against a delivered order. We'll send the customer a prepaid label; once the box arrives we inspect and refund."
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load returns."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No returns yet"
          description="Open one from the order detail page when a customer needs to send something back."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>RMA</Th>
            <Th>Status</Th>
            <Th>Reason</Th>
            <Th align="right">Lines</Th>
            <Th align="right">Refund</Th>
            <Th>Inbound</Th>
            <Th>Resolved</Th>
          </THead>
          <TBody>
            {data.items.map((r) => (
              <TR key={r.id}>
                <Td mono>{r.rmaCode}</Td>
                <Td>
                  <StatusPill tone={TONE[r.status]}>{r.status.replace(/_/g, " ")}</StatusPill>
                </Td>
                <Td mono className="text-text-muted">
                  {r.reason.replace(/_/g, " ")}
                </Td>
                <Td num>{r.lines.length}</Td>
                <Td num strong>
                  {formatCents(r.refundAmountCents)}
                </Td>
                <Td mono className="text-text-muted">
                  {r.inboundTracking ?? "—"}
                </Td>
                <Td mono className="text-text-muted">
                  {r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : "—"}
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
