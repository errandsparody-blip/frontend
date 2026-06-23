"use client";

/**
 * Admin returns — operator queue.
 *
 * Lists every RMA across every vendor, newest first. Operators use the
 * status filter to triage:
 *
 *   - AUTHORIZED / IN_TRANSIT — waiting for the box to arrive
 *   - RECEIVED                — needs inspection
 *   - INSPECTED / RESTOCKED   — done, kept for the audit trail
 *
 * Click a row to drill into the detail page where the receive +
 * inspect actions live.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  FilterBar,
  FilterDateRange,
  FilterSelect,
  type FilterOption,
} from "@/components/admin/filters";
import { ErrorBanner } from "@/components/errors/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError } from "@/lib/errors";
import {
  RETURN_REASON_LABEL,
  RETURN_STATUS,
  type ReturnListResponse,
  type ReturnStatus,
} from "@/lib/schemas/returns";

const TONE: Record<ReturnStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
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
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const RETURN_STATUS_OPTIONS: FilterOption[] = [
  { value: "", label: "All statuses" },
  ...RETURN_STATUS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
];

export default function AdminReturnsPage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = (searchParams.get("status") ?? "") as ReturnStatus | "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "returns", { status: statusFilter, from, to }],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: "50" });
      if (statusFilter) qs.set("status", statusFilter);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      return api.get<ReturnListResponse>(`/admin/returns?${qs.toString()}`);
    },
  });

  function setStatus(next: ReturnStatus | ""): void {
    const sp = new URLSearchParams(searchParams);
    if (next) sp.set("status", next);
    else sp.delete("status");
    router.replace(`/admin/returns${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  const normalized = error ? normalizeError(error) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Returns / Queue"
        title="Returns queue"
        description="Inbound RMAs across every vendor. Triage with the status filter; click a row to receive or inspect."
      />

      <FilterBar
        gridClassName="md:grid-cols-[220px_200px_200px]"
        onClear={() => {
          setStatus("");
          setFrom("");
          setTo("");
        }}
        canClear={statusFilter !== "" || from !== "" || to !== ""}
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatus(v as ReturnStatus | "")}
          options={RETURN_STATUS_OPTIONS}
        />
        <FilterDateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : normalized ? (
        <ErrorBanner
          error={normalized}
          onAction={(handler) => {
            if (handler === "retry") void refetch();
            else if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
          }}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Queue is empty"
          description={
            statusFilter
              ? `No returns currently in ${statusFilter.replace(/_/g, " ").toLowerCase()}.`
              : "No returns have been opened yet."
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>RMA</Th>
            <Th>Vendor</Th>
            <Th>Status</Th>
            <Th>Reason</Th>
            <Th align="right">Lines</Th>
            <Th align="right">Refund</Th>
            <Th>Inbound</Th>
            <Th>Opened</Th>
            <Th align="right">{""}</Th>
          </THead>
          <TBody>
            {data.items.map((r) => (
              <TR key={r.id}>
                <Td mono>{r.rmaCode}</Td>
                <Td mono className="text-text-muted">
                  {r.vendorId.slice(0, 8)}
                </Td>
                <Td>
                  <StatusPill tone={TONE[r.status]}>{r.status.replace(/_/g, " ")}</StatusPill>
                </Td>
                <Td className="text-text-muted">{RETURN_REASON_LABEL[r.reason]}</Td>
                <Td num>{r.lines.length}</Td>
                <Td num strong>
                  {formatCents(r.refundAmountCents)}
                </Td>
                <Td mono className="text-text-muted">
                  {r.inboundTracking ?? "—"}
                </Td>
                <Td mono className="text-text-muted">
                  {new Date(r.createdAt).toLocaleDateString()}
                </Td>
                <Td align="right">
                  <Link
                    href={`/admin/returns/${r.id}`}
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

