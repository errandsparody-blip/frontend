"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

interface MonthlyStatement {
  month: string;
  windowStart: string;
  windowEnd: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  depositsCents: number;
  chargesCents: number; // signed (negative)
  refundsCents: number;
  entryCount: number;
  byType: Record<string, { count: number; totalCents: number }>;
  entries: Array<{
    id: string;
    type: string;
    amountCents: number;
    balanceAfterCents: number;
    description: string;
    referenceType: string | null;
    referenceId: string | null;
    createdAt: string;
  }>;
}

function formatCents(cents: number, signed = false): string {
  const sign = signed && cents > 0 ? "+" : cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function defaultMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function StatementsPage() {
  const [month, setMonth] = useState<string>(defaultMonth());
  const months = useMemo(() => lastNMonths(12), []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["wallet", "statements", month],
    queryFn: () => api.get<MonthlyStatement>(`/wallet/statements/${encodeURIComponent(month)}`),
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="  Wallet / Statements"
        title="Monthly statements"
        description="Pick a month to see the opening + closing balance, totals by entry type, and every line that hit your wallet."
        actions={
          <Link
            href="/wallet"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Wallet
          </Link>
        }
      />

      <div className="flex items-center gap-3 font-mono text-mono-label uppercase">
        <span className="text-text-muted">Month</span>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            api
              .download(
                `/exports/ledger.csv?from=${encodeURIComponent(`${month}-01T00:00:00Z`)}`,
                `ledger_${month}.csv`,
              )
              .catch(() => undefined)
          }
          className="rounded-sm border border-line-strong px-3 py-1 text-text hover:border-ink"
        >
          Download CSV
        </button>
      </div>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load statement."}
        </div>
      ) : data ? (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile label="Opening" cents={data.openingBalanceCents} />
            <Tile label="Deposits" cents={data.depositsCents} positive />
            <Tile label="Charges" cents={data.chargesCents} />
            <Tile label="Closing" cents={data.closingBalanceCents} bold />
          </section>

          {data.refundsCents > 0 ? (
            <div className="rounded-md border-l-4 border-success bg-success/10 px-5 py-4">
              <div className="font-mono text-mono-label uppercase text-success">Refunds this month</div>
              <p className="mt-1 font-mono text-body-sm">+{formatCents(data.refundsCents)}</p>
            </div>
          ) : null}

          {Object.keys(data.byType).length > 0 ? (
            <section className="rounded-md border border-line bg-white p-6">
              <h2 className="font-mono text-mono-label uppercase text-text-muted">Totals by entry type</h2>
              <div className="mt-3">
                <DataTable>
                  <THead>
                    <Th>Type</Th>
                    <Th align="right">Count</Th>
                    <Th align="right">Total</Th>
                  </THead>
                  <TBody>
                    {Object.entries(data.byType)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([type, agg]) => (
                        <TR key={type}>
                          <Td mono>{type}</Td>
                          <Td num>{agg.count}</Td>
                          <Td num strong>{formatCents(agg.totalCents, true)}</Td>
                        </TR>
                      ))}
                  </TBody>
                </DataTable>
              </div>
            </section>
          ) : (
            <p className="font-mono text-mono-label uppercase text-text-subtle">
              No entries this month.
            </p>
          )}

          {data.entries.length > 0 ? (
            <section className="rounded-md border border-line bg-white p-6">
              <h2 className="font-mono text-mono-label uppercase text-text-muted">Entries</h2>
              <div className="mt-3">
                <DataTable>
                  <THead>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Description</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Balance after</Th>
                  </THead>
                  <TBody>
                    {data.entries.map((e) => (
                      <TR key={e.id}>
                        <Td mono className="text-text-muted">
                          {new Date(e.createdAt).toLocaleString()}
                        </Td>
                        <Td mono>{e.type}</Td>
                        <Td>{e.description}</Td>
                        <Td num strong>
                          {formatCents(e.amountCents, true)}
                        </Td>
                        <Td num className="text-text-muted">
                          {formatCents(e.balanceAfterCents)}
                        </Td>
                      </TR>
                    ))}
                  </TBody>
                </DataTable>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  cents,
  positive = false,
  bold = false,
}: {
  label: string;
  cents: number;
  positive?: boolean;
  bold?: boolean;
}): JSX.Element {
  const tone = bold ? "text-ink" : positive ? "text-success" : cents < 0 ? "text-error" : "text-text";
  return (
    <div className="rounded-md border border-line bg-white p-5">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className={`mt-2 text-h2 ${bold ? "font-semibold" : "font-medium"} tabular-nums ${tone}`}>
        {formatCents(cents, positive)}
      </div>
    </div>
  );
}
