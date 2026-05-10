"use client";

/**
 * Admin Shopper queue.
 *
 * Mirror of the orders queue page, narrowed to the personal-shopper
 * lifecycle. Default tab "Queue" surfaces in-flight requests; specific-status
 * tabs and "All" are available for forensics.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import {
  SHOPPER_REQUEST_STATUS,
  type ShopperRequestStatus,
} from "@/lib/schemas/shopper";

interface AdminShopperRow {
  id: string;
  reference: string;
  parentRequestId: string | null;
  status: ShopperRequestStatus;
  buyerEmail: string;
  buyerName: string | null;
  itemsSubtotalCents: number;
  intakeTotalCents: number;
  followupAmountCents: number | null;
  intakePaidAt: string | null;
  followupResolvedAt: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  createdAt: string;
  lines: Array<{ id: string; quantity: number; productUrl: string; productTitle: string | null }>;
}

const QUEUE_STATUSES: ShopperRequestStatus[] = [
  "AWAITING_INTAKE_PAYMENT",
  "PAID",
  "PROCURING",
  "AWAITING_RECONCILIATION",
  "READY_TO_SHIP",
  "SHIPPED",
];
const POST_QUEUE_STATUSES: ShopperRequestStatus[] = ["DELIVERED", "CANCELLED", "REFUNDED"];

const TONE: Record<ShopperRequestStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  AWAITING_INTAKE_PAYMENT: "warning",
  PAID: "info",
  PROCURING: "info",
  AWAITING_RECONCILIATION: "warning",
  READY_TO_SHIP: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

function formatCents(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type TabValue = "queue" | "all" | ShopperRequestStatus;

export default function AdminShopperQueuePage(): JSX.Element {
  const [tab, setTab] = useState<TabValue>("queue");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (tab === "all") {
    params.set("view", "all");
  } else if (tab !== "queue") {
    params.set("status", tab);
  }
  // Trim before the trip — the API requires min(1) on `search` if present.
  const trimmed = search.trim();
  if (trimmed.length > 0) params.set("search", trimmed);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "shopper", { tab, search: trimmed }],
    queryFn: () =>
      api.get<{ items: AdminShopperRow[]; nextCursor: string | null }>(
        `/admin/shopper?${params.toString()}`,
      ),
  });

  // Sanity check — keep the schema-shared status array in sync with this UI.
  // If the API gains a status the UI doesn't know about, the toggle still works
  // (status string falls through to its own tab), but we'd lose its tone color.
  const knownStatuses = new Set(SHOPPER_REQUEST_STATUS);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[08] Personal Shopper"
        title="Shopper queue"
        description="Buyer-paid procurement requests. Each request tracks a buyer thread, intake payment, line reconciliation, and shipping."
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

        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name…"
            className="h-9 w-64 rounded-sm border border-line-strong bg-cream-soft px-3 text-body-sm text-text outline-none placeholder:text-text-subtle focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load shopper requests."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={trimmed ? "No matches" : "Nothing here"}
          description={
            trimmed
              ? "No shopper requests match the search."
              : "No shopper requests in this view."
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Request</Th>
            <Th>Buyer</Th>
            <Th>Status</Th>
            <Th align="right">Items</Th>
            <Th align="right">Intake</Th>
            <Th align="right">Follow-up</Th>
            <Th>Carrier</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((r) => (
              <TR key={r.id}>
                <Td mono>
                  {r.reference}
                  {r.parentRequestId ? (
                    <span className="ml-1 font-mono text-[10px] text-amber" title="Linked to a previous order">
                      ↳
                    </span>
                  ) : null}
                </Td>
                <Td strong>
                  {r.buyerEmail}
                  {r.buyerName ? (
                    <span className="text-text-muted"> · {r.buyerName}</span>
                  ) : null}
                </Td>
                <Td>
                  <StatusPill tone={knownStatuses.has(r.status) ? TONE[r.status] : "neutral"}>
                    {r.status.replace(/_/g, " ")}
                  </StatusPill>
                </Td>
                <Td num>{r.lines.length}</Td>
                <Td num strong>
                  {formatCents(r.intakeTotalCents)}
                </Td>
                <Td num className={signedToneClass(r.followupAmountCents)}>
                  {r.followupAmountCents == null
                    ? "—"
                    : (r.followupAmountCents > 0 ? "+" : r.followupAmountCents < 0 ? "−" : "") +
                      formatCents(Math.abs(r.followupAmountCents))}
                </Td>
                <Td mono className="text-text-muted">
                  {r.carrier && r.trackingNumber ? `${r.carrier} · ${r.trackingNumber}` : "—"}
                </Td>
                <Td align="right">
                  <Link
                    href={`/admin/shopper/${r.id}`}
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

function signedToneClass(cents: number | null): string {
  if (cents == null) return "text-text-muted";
  if (cents > 0) return "text-amber";
  if (cents < 0) return "text-success";
  return "text-text-muted";
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
