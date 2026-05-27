"use client";

/**
 * Vendor returns — list page.
 *
 * Lists every RMA the signed-in vendor has opened, newest first. Status
 * pill, reason, refund total, inbound tracking. Each row links to
 * /returns/[id] for the full detail (line breakdown, cancel button,
 * inbound label url).
 *
 * Status filter is a query-string param so an admin debugging "show me
 * all the AUTHORIZED ones" can deep-link, and the URL is shareable.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

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

export default function VendorReturnsPage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = (searchParams.get("status") ?? "") as ReturnStatus | "";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["returns", { status: statusFilter }],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: "50" });
      if (statusFilter) qs.set("status", statusFilter);
      return api.get<ReturnListResponse>(`/returns?${qs.toString()}`);
    },
  });

  function setStatus(next: ReturnStatus | ""): void {
    const sp = new URLSearchParams(searchParams);
    if (next) sp.set("status", next);
    else sp.delete("status");
    router.replace(`/returns${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  const normalized = error ? normalizeError(error) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[06] Returns"
        title="Return authorisations"
        description="Open an RMA against a delivered order. We'll send the customer a prepaid label; once the box arrives we inspect and refund your wallet."
      />

      {/* Status filter — quick-toggles + reset button. Quick-toggles use
          the same chip style as the rest of the portal so this fits in. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-mono-label uppercase text-text-muted">Status</span>
        <button
          type="button"
          onClick={() => setStatus("")}
          className={chipClass(statusFilter === "")}
        >
          All
        </button>
        {RETURN_STATUS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={chipClass(statusFilter === s)}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

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
          title={statusFilter ? `No returns in ${statusFilter.replace(/_/g, " ").toLowerCase()}` : "No returns yet"}
          description={
            statusFilter
              ? "Try a different status filter, or clear it to see everything."
              : "Open one from the order detail page when a customer needs to send something back."
          }
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
            <Th align="right">{""}</Th>
          </THead>
          <TBody>
            {data.items.map((r) => (
              <TR key={r.id}>
                <Td mono>{r.rmaCode}</Td>
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
                  {r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : "—"}
                </Td>
                <Td align="right">
                  <Link
                    href={`/returns/${r.id}`}
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

function chipClass(active: boolean): string {
  return [
    "rounded-sm border px-3 py-1 font-mono text-[10px] uppercase tracking-[1.4px] transition-colors",
    active
      ? "border-ink bg-ink text-text-inv"
      : "border-line bg-cream-soft text-text-muted hover:border-ink hover:text-ink",
  ].join(" ");
}
