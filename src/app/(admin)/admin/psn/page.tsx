"use client";

/**
 * Admin receiving page.
 *
 * Two tabs over the same endpoint (`GET /admin/psns`):
 *
 *   Inbox    — default. Shows AWAITING_RECEIPT + PARTIALLY_RECEIVED so
 *              the operator's queue is the first thing rendered, ordered
 *              oldest-first so the longest-waiting shipment surfaces
 *              at the top.
 *
 *   History  — RECEIVED + DISCREPANCY + REJECTED + RETURN_REQUESTED,
 *              ordered receivedAt desc so the most-recently-processed
 *              PSN comes first. Lets super admin browse every shipment
 *              the warehouse has touched without leaving the page.
 *
 * The Receive action on every row still links to the existing
 * /admin/psn/[id]/receive page. For PSNs whose status has already moved
 * past receiving, that page is read-only (the workflow gates the
 * receive form on AWAITING_RECEIPT / PARTIALLY_RECEIVED).
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { PsnStatus, PublicPsn } from "@/lib/schemas/psn";

interface AdminPsnRow extends PublicPsn {
  vendor: { id: string; businessName: string };
  receivedAt: string | null;
}

type TabId = "inbox" | "history";

// Inbox passes no `status` param — the backend already defaults to
// AWAITING_RECEIPT + PARTIALLY_RECEIVED when status is omitted. Doing it
// this way keeps the Inbox tab working against older backend builds
// that don't yet understand the comma-separated multi-status form.
// History always passes the explicit four-status list because there is
// no equivalent server-side default for the post-receive view.
const TAB_STATUS: Record<TabId, string | null> = {
  inbox: null,
  history: "RECEIVED,DISCREPANCY,REJECTED,RETURN_REQUESTED",
};

const TONE: Record<PsnStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  AWAITING_RECEIPT: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  DISCREPANCY: "warning",
  CANCELLED: "error",
  HOLD: "warning",
  REJECTED: "error",
  RETURN_REQUESTED: "error",
};

/** Compact box-count summary — "5 large · 1 pallet". */
function summariseBoxes(counts: Record<string, number> | null | undefined): string {
  if (!counts) return "—";
  const entries = Object.entries(counts).filter(([, n]) => Number(n) > 0);
  if (entries.length === 0) return "—";
  return entries
    .map(([tier, n]) => `${n} ${tier.toLowerCase().replace(/_/g, "-")}`)
    .join(" · ");
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminPsnQueuePage(): JSX.Element {
  const [tab, setTab] = useState<TabId>("inbox");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "psns", tab],
    queryFn: () => {
      const statusParam = TAB_STATUS[tab];
      const qs = statusParam
        ? `limit=100&status=${encodeURIComponent(statusParam)}`
        : `limit=100`;
      return api.get<{ items: AdminPsnRow[]; nextCursor: string | null }>(
        `/admin/psns?${qs}`,
      );
    },
    // Keep previous data while switching tabs so the table doesn't
    // collapse into the loading state between clicks.
    placeholderData: (prev) => prev,
  });

  const isHistory = tab === "history";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[02] Receiving"
        title={isHistory ? "Received PSN history" : "Inbound queue"}
        description={
          isHistory
            ? "Every Pre-Shipment Notice the warehouse has processed — received, discrepancy, rejected, or returned. Open one to view its receive record."
            : "PSNs awaiting receipt at the warehouse. Open one to start the receiving workflow."
        }
      />

      {/* Tab strip — keeps the page within a single route so the
          operator's bookmarks and the existing sidebar entry both
          continue to work. */}
      <div
        role="tablist"
        aria-label="Receiving view"
        className="inline-flex w-fit gap-1 rounded-md border border-line bg-white p-1"
      >
        {(["inbox", "history"] as TabId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-[1.4px] transition",
              tab === id
                ? "bg-ink text-cream-soft"
                : "text-text-muted hover:bg-cream-soft hover:text-ink",
            )}
          >
            {id === "inbox" ? "Inbox" : "History"}
          </button>
        ))}
      </div>

      {isLoading && !data ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load PSNs."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={isHistory ? "No history yet" : "Queue is clear"}
          description={
            isHistory
              ? "No PSNs have been processed yet. Once a shipment is received, rejected, or returned, it will appear here."
              : "No PSNs are awaiting receipt right now."
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Reference</Th>
            <Th>Vendor</Th>
            <Th>Status</Th>
            <Th>Carrier</Th>
            <Th>Boxes</Th>
            <Th>{isHistory ? "Received" : "Submitted"}</Th>
            <Th align="right">Lines</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((p) => {
              const declaredBoxCounts =
                (p as unknown as { declaredBoxCounts?: Record<string, number> })
                  .declaredBoxCounts ?? null;
              const dateValue = isHistory ? p.receivedAt : p.submittedAt;
              return (
                <TR key={p.id}>
                  <Td mono>{p.id.slice(0, 8)}</Td>
                  <Td strong>{p.vendor.businessName}</Td>
                  <Td>
                    <StatusPill tone={TONE[p.status]}>
                      {p.status.replace(/_/g, " ")}
                    </StatusPill>
                  </Td>
                  <Td mono className="text-text-muted">
                    {p.carrier ?? "—"}
                  </Td>
                  <Td mono className="text-text-muted">
                    {summariseBoxes(declaredBoxCounts)}
                  </Td>
                  <Td mono className="text-text-muted">
                    {formatDate(dateValue)}
                  </Td>
                  <Td num>{p.lines.length}</Td>
                  <Td align="right">
                    <Link
                      href={`/admin/psn/${p.id}/receive`}
                      className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                    >
                      {isHistory ? "View →" : "Receive →"}
                    </Link>
                  </Td>
                </TR>
              );
            })}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
