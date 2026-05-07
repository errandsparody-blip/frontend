"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

interface ReconRow {
  vendorId: string;
  businessName: string;
  materialized: number;
  ledger: number;
  deltaCents: number;
  walletStatus: string | null;
}

interface ReconResponse {
  totals: {
    vendors: number;
    clean: number;
    discrepancies: number;
    totalMaterializedCents: number;
    totalLedgerCents: number;
  };
  discrepancies: ReconRow[];
  cleanSample: ReconRow[];
}

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReconciliationPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "finance", "reconciliation"],
    queryFn: () => api.get<ReconResponse>("/admin/finance/reconciliation"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[03] Finance / Reconciliation"
        title="Ledger reconciliation"
        description="For every vendor: does the materialized wallet balance equal the sum of their ledger entries? The daily cron writes the same comparison; this is the on-demand view."
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Computing…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load report."}
        </div>
      ) : data ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <Tile label="Vendors" value={data.totals.vendors.toString()} />
            <Tile label="Clean" value={data.totals.clean.toString()} tone="success" />
            <Tile
              label="Discrepancies"
              value={data.totals.discrepancies.toString()}
              tone={data.totals.discrepancies > 0 ? "error" : "neutral"}
            />
            <Tile label="Total balance" value={fmt(data.totals.totalMaterializedCents)} />
          </section>

          {data.discrepancies.length > 0 ? (
            <section>
              <h2 className="mb-3 font-mono text-mono-label uppercase text-error">
                Discrepancies — investigate immediately
              </h2>
              <DataTable>
                <THead>
                  <Th>Vendor</Th>
                  <Th>Wallet status</Th>
                  <Th align="right">Materialized</Th>
                  <Th align="right">Ledger sum</Th>
                  <Th align="right">Delta</Th>
                </THead>
                <TBody>
                  {data.discrepancies.map((r) => (
                    <TR key={r.vendorId}>
                      <Td strong>{r.businessName}</Td>
                      <Td>
                        <StatusPill
                          tone={
                            r.walletStatus === "ACTIVE"
                              ? "success"
                              : r.walletStatus === "STORAGE_OVERDUE"
                                ? "error"
                                : "warning"
                          }
                        >
                          {r.walletStatus ?? "none"}
                        </StatusPill>
                      </Td>
                      <Td num>{fmt(r.materialized)}</Td>
                      <Td num>{fmt(r.ledger)}</Td>
                      <Td num className="text-error">
                        {fmt(r.deltaCents)}
                      </Td>
                    </TR>
                  ))}
                </TBody>
              </DataTable>
            </section>
          ) : (
            <div className="rounded-md border-l-4 border-success bg-success/10 px-5 py-4">
              <div className="font-mono text-mono-label uppercase text-success">All clean</div>
              <p className="mt-1 text-body-sm text-text">
                Every vendor&apos;s materialized balance equals the sum of their ledger entries.
              </p>
            </div>
          )}

          <section>
            <h2 className="mb-3 font-mono text-mono-label uppercase text-text-muted">
              Sample of clean vendors
            </h2>
            <DataTable>
              <THead>
                <Th>Vendor</Th>
                <Th align="right">Balance</Th>
                <Th align="right">Ledger sum</Th>
              </THead>
              <TBody>
                {data.cleanSample.map((r) => (
                  <TR key={r.vendorId}>
                    <Td>{r.businessName}</Td>
                    <Td num>{fmt(r.materialized)}</Td>
                    <Td num className="text-text-muted">
                      {fmt(r.ledger)}
                    </Td>
                  </TR>
                ))}
              </TBody>
            </DataTable>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "error" | "neutral";
}) {
  const valueClass =
    tone === "success" ? "text-success" : tone === "error" ? "text-error" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-white p-6">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className={"mt-3 text-display-lg font-medium tabular-nums " + valueClass}>{value}</div>
    </div>
  );
}
