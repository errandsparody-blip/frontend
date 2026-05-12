/**
 * Admin Finance — Transactions
 *
 * Unified view of every dollar movement on the platform: vendor wallet
 * entries + shopper request entries, interleaved by createdAt. Filterable
 * by transaction type. Hits GET /v1/admin/finance/transactions, which is
 * backed by the same `ledger_entries` table (migration 0019 made it
 * polymorphic across vendors and shopper requests).
 *
 * Per product spec: no vendor filter, no shopper filter at this level
 * (subject is implicit in the row's badge). Filters: transaction type only.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

type LedgerType =
  | "DEPOSIT"
  | "ONBOARDING"
  | "STORAGE"
  | "FULFILLMENT"
  | "SHIPPING"
  | "RETURN"
  | "MANUAL_CREDIT"
  | "MANUAL_DEBIT"
  | "REVERSAL"
  | "RECEIVING_HOLD_FEE"
  | "PARTNERSHIP_ITEM_COST"
  | "PURCHASE_FEE"
  | "REFUND";

/**
 * Ordering matches the user's spec for the filter UI — the most-used
 * categories first, then admin escape hatches at the bottom.
 */
const TYPES: ReadonlyArray<{ value: LedgerType; label: string }> = [
  { value: "ONBOARDING", label: "Onboarding fee" },
  { value: "STORAGE", label: "Storage fee" },
  { value: "SHIPPING", label: "Shipping fee" },
  { value: "FULFILLMENT", label: "Fulfillment fee" },
  { value: "PARTNERSHIP_ITEM_COST", label: "Partnership item cost" },
  { value: "PURCHASE_FEE", label: "Purchase fee" },
  { value: "RECEIVING_HOLD_FEE", label: "Additional receiving fee" },
  { value: "RETURN", label: "Return fee" },
  { value: "REFUND", label: "Refund" },
  { value: "REVERSAL", label: "Reversal" },
  { value: "DEPOSIT", label: "Deposit" },
  { value: "MANUAL_CREDIT", label: "Manual credit" },
  { value: "MANUAL_DEBIT", label: "Manual debit" },
];

/**
 * Status-pill tone per ledger type. Categorisation:
 *   - success: money coming in (deposits, our revenue)
 *   - info: routine operational charges
 *   - warning: exceptional / one-off (refunds, manual)
 *   - error: reversals + manual debits (potentially needs review)
 */
const TONE: Record<LedgerType, "success" | "info" | "warning" | "error" | "neutral"> = {
  DEPOSIT: "success",
  PURCHASE_FEE: "success",
  ONBOARDING: "info",
  STORAGE: "info",
  FULFILLMENT: "info",
  SHIPPING: "info",
  RETURN: "info",
  PARTNERSHIP_ITEM_COST: "neutral",
  RECEIVING_HOLD_FEE: "warning",
  REFUND: "warning",
  REVERSAL: "error",
  MANUAL_CREDIT: "warning",
  MANUAL_DEBIT: "warning",
};

interface Transaction {
  id: string;
  type: LedgerType;
  amountCents: number;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  vendor: { id: string; businessName: string } | null;
  shopperRequest: { id: string; reference: string } | null;
}

interface ListResponse {
  items: Transaction[];
  nextCursor: string | null;
}

function formatCents(cents: number): string {
  // Negative = debit; positive = credit. Sign-before-dollar matches accounting
  // convention and what the shopper receipts already render.
  const abs = Math.abs(cents);
  const formatted = `$${(abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return cents < 0 ? `-${formatted}` : formatted;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelForType(t: LedgerType): string {
  return TYPES.find((x) => x.value === t)?.label ?? t.replace(/_/g, " ");
}

/**
 * Pull the most useful, single-line diagnostic out of whatever shape the
 * api-client surfaced. Our error envelope from the API looks like:
 *   { status, code?, message, details? }
 * `react-query` hands us the raw thrown value, so we defensively probe
 * each shape.
 */
function readableError(err: unknown): string {
  if (!err) return "Unknown error.";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const anyErr = err as Error & { status?: number; code?: string };
    const parts: string[] = [];
    if (anyErr.status) parts.push(`HTTP ${anyErr.status}`);
    if (anyErr.code) parts.push(`[${anyErr.code}]`);
    if (anyErr.message) parts.push(anyErr.message);
    return parts.length > 0 ? parts.join(" · ") : "Request failed.";
  }
  // Plain object envelope.
  if (typeof err === "object") {
    const o = err as { status?: number; code?: string; message?: string };
    return [
      o.status ? `HTTP ${o.status}` : null,
      o.code ? `[${o.code}]` : null,
      o.message ?? null,
    ]
      .filter(Boolean)
      .join(" · ") || "Request failed.";
  }
  return "Unknown error.";
}

export default function AdminTransactionsPage(): JSX.Element {
  // Multi-select filter — empty Set means "all types".
  const [selected, setSelected] = useState<Set<LedgerType>>(new Set());

  const typeParam = Array.from(selected).join(",");
  const query = useQuery({
    queryKey: ["admin", "finance", "transactions", typeParam],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (typeParam) params.set("type", typeParam);
      return api.get<ListResponse>(`/admin/finance/transactions?${params.toString()}`);
    },
  });

  function toggle(t: LedgerType): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function clearAll(): void {
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[03] Finance"
        title="Transactions"
        description="Every dollar movement on the platform — vendor wallet activity and shopper request payments, in one filterable view."
        actions={
          <Link
            href="/admin/finance"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
          >
            ← Vendors & wallets
          </Link>
        }
      />

      {/* Filter pills. Multi-select; click to toggle. Empty = all. */}
      <section className="rounded-md border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={clearAll}
            className={`rounded-sm border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[1.2px] transition-colors ${
              selected.size === 0
                ? "border-ink bg-ink text-text-inv"
                : "border-line-strong bg-white text-text hover:border-ink"
            }`}
          >
            All
          </button>
          {TYPES.map((t) => {
            const on = selected.has(t.value);
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => toggle(t.value)}
                className={`rounded-sm border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[1.2px] transition-colors ${
                  on
                    ? "border-amber bg-amber text-ink"
                    : "border-line-strong bg-white text-text hover:border-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {query.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : query.error ? (
        <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
          <div className="font-mono text-mono-label uppercase text-error">
            Couldn&#39;t load transactions
          </div>
          {/* Admin-only page — show the real error so the operator can
              triage without opening DevTools. Includes status code +
              message + (when present) the API error `code` from our
              normalised error envelope. */}
          <p className="mt-1 text-body-sm text-text">
            {readableError(query.error)}
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            If this keeps happening, copy the line above into Sentry / API
            logs to find the stack trace.
          </p>
        </div>
      ) : !query.data || query.data.items.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description={
            selected.size > 0
              ? "Loosen the filters or click All."
              : "Once vendors fund wallets or shoppers pay for requests, transactions show up here."
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Date</Th>
            <Th>Type</Th>
            <Th>Subject</Th>
            <Th>Description</Th>
            <Th align="right">Amount</Th>
          </THead>
          <TBody>
            {query.data.items.map((t) => (
              <TR key={t.id}>
                <Td mono className="text-text-muted">
                  {formatDate(t.createdAt)}
                </Td>
                <Td>
                  <StatusPill tone={TONE[t.type]}>{labelForType(t.type)}</StatusPill>
                </Td>
                <Td>
                  {t.vendor ? (
                    <Link
                      href={`/admin/vendors/${t.vendor.id}`}
                      className="text-ink hover:text-amber"
                    >
                      {t.vendor.businessName}
                    </Link>
                  ) : t.shopperRequest ? (
                    <Link
                      href={`/admin/shopper/${t.shopperRequest.id}`}
                      className="font-mono text-ink hover:text-amber"
                    >
                      {t.shopperRequest.reference}
                    </Link>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </Td>
                <Td className="text-text-muted">{t.description}</Td>
                <Td
                  num
                  strong
                  className={t.amountCents < 0 ? "text-error" : "text-success"}
                >
                  {formatCents(t.amountCents)}
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
