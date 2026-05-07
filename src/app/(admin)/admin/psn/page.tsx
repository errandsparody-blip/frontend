"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { PsnStatus, PublicPsn } from "@/lib/schemas/psn";

interface AdminPsnRow extends PublicPsn {
  vendor: { id: string; businessName: string };
}

const TONE: Record<PsnStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  AWAITING_RECEIPT: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  DISCREPANCY: "warning",
  CANCELLED: "error",
};

export default function AdminPsnQueuePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "psns"],
    queryFn: () =>
      api.get<{ items: AdminPsnRow[]; nextCursor: string | null }>("/admin/psns?limit=100"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[02] Receiving"
        title="Inbound queue"
        description="PSNs awaiting receipt at the warehouse. Open one to start the receiving workflow."
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load queue."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Queue is clear" description="No PSNs are awaiting receipt right now." />
      ) : (
        <DataTable>
          <THead>
            <Th>Reference</Th>
            <Th>Vendor</Th>
            <Th>Status</Th>
            <Th>Carrier</Th>
            <Th>Submitted</Th>
            <Th align="right">Lines</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((p) => (
              <TR key={p.id}>
                <Td mono>{p.id.slice(0, 8)}</Td>
                <Td strong>{p.vendor.businessName}</Td>
                <Td>
                  <StatusPill tone={TONE[p.status]}>{p.status.replace(/_/g, " ")}</StatusPill>
                </Td>
                <Td mono className="text-text-muted">{p.carrier ?? "—"}</Td>
                <Td mono className="text-text-muted">
                  {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : "—"}
                </Td>
                <Td num>{p.lines.length}</Td>
                <Td align="right">
                  <Link
                    href={`/admin/psn/${p.id}/receive`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                  >
                    Receive →
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
