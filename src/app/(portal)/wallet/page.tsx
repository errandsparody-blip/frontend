"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { LedgerEntryType, PublicLedgerEntry, WalletSnapshot } from "@/lib/schemas/wallet";

const TYPE_LABEL: Record<LedgerEntryType, string> = {
  DEPOSIT: "Deposit",
  ONBOARDING: "Onboarding fee",
  STORAGE: "Storage",
  FULFILLMENT: "Fulfillment",
  SHIPPING: "Shipping",
  RETURN: "Return",
  MANUAL_CREDIT: "Manual credit",
  MANUAL_DEBIT: "Manual debit",
  REVERSAL: "Reversal",
};

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function WalletPage() {
  const walletQ = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get<WalletSnapshot>("/wallet"),
  });
  const ledgerQ = useQuery({
    queryKey: ["wallet", "ledger"],
    queryFn: () =>
      api.get<{ items: PublicLedgerEntry[]; nextCursor: string | null }>("/wallet/ledger?limit=100"),
  });

  const wallet = walletQ.data;
  const lowBalance =
    wallet && wallet.balanceCents <= wallet.lowBalanceThresholdCents;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[05] Wallet"
        title="Balance & ledger"
        description="Your prepaid balance funds storage, fulfillment, and shipping. The ledger is append-only — every charge or deposit is here permanently."
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/wallet/recurring"
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
            >
              Recurring storage →
            </Link>
            <Link
              href="/wallet/statements"
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
            >
              Monthly statements →
            </Link>
            <button
              type="button"
              onClick={() =>
                api.download("/exports/ledger.csv", `ledger_${new Date().toISOString().slice(0, 10)}.csv`).catch(() => undefined)
              }
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
            >
              Download CSV
            </button>
            <Link href="/wallet/fund">
              <Button variant="amber" withArrow>
                Add funds
              </Button>
            </Link>
          </div>
        }
      />

      {wallet && wallet.status === "STORAGE_OVERDUE" ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
          <div className="font-mono text-mono-label uppercase text-error">Storage overdue</div>
          <p className="mt-1 text-body-sm text-text">
            Your wallet has insufficient funds for monthly storage. New fulfillment requests are blocked
            until the balance covers the outstanding fee.
          </p>
        </div>
      ) : null}

      {/* Balance tile */}
      <section className="rounded-md border border-line bg-white p-8">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Available balance</div>
            <div
              className={
                "mt-3 text-display-lg font-medium tabular-nums tracking-[-1.5px] " +
                (lowBalance ? "text-amber" : "text-ink")
              }
            >
              {wallet ? formatCents(wallet.balanceCents) : "…"}
            </div>
            {wallet ? (
              <div className="mt-3 flex items-center gap-3">
                <StatusPill tone={wallet.status === "ACTIVE" ? "success" : wallet.status === "STORAGE_OVERDUE" ? "error" : "warning"}>
                  {wallet.status.replace(/_/g, " ")}
                </StatusPill>
                {lowBalance ? (
                  <span className="font-mono text-mono-label uppercase text-amber">
                    Below low-balance threshold
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="font-mono text-mono-label uppercase text-text-muted">Low-balance alert at</div>
            <div className="mt-1 font-mono text-h2 tabular-nums text-text">
              {wallet ? formatCents(wallet.lowBalanceThresholdCents) : "—"}
            </div>
          </div>
        </div>
      </section>

      {/* Ledger */}
      {ledgerQ.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading ledger…</div>
      ) : !ledgerQ.data || ledgerQ.data.items.length === 0 ? (
        <EmptyState
          title="No ledger entries yet"
          description="Fund your wallet and submit a Pre-Shipment Notice to see entries appear here."
          action={
            <Link href="/wallet/fund">
              <Button variant="primary" withArrow>
                Add funds
              </Button>
            </Link>
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Date</Th>
            <Th>Type</Th>
            <Th>Description</Th>
            <Th align="right">Amount</Th>
            <Th align="right">Balance after</Th>
          </THead>
          <TBody>
            {ledgerQ.data.items.map((e) => (
              <TR key={e.id}>
                <Td mono className="text-text-muted">
                  {new Date(e.createdAt).toLocaleDateString()}{" "}
                  <span className="text-text-subtle">
                    {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </Td>
                <Td>
                  <StatusPill tone={e.amountCents > 0 ? "success" : "neutral"}>
                    {TYPE_LABEL[e.type]}
                  </StatusPill>
                </Td>
                <Td className="text-text">{e.description}</Td>
                <Td num className={e.amountCents < 0 ? "text-error" : "text-success"}>
                  {formatCents(e.amountCents)}
                </Td>
                <Td num strong>
                  {formatCents(e.balanceAfterCents)}
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
