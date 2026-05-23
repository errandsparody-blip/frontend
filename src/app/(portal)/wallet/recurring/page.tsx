/**
 * /wallet/recurring — vendor's recurring monthly storage breakdown.
 *
 * Three reads of the same payload:
 *   - "How much will I be charged on the 1st?"          → headline + per-tier
 *   - "Which PSN is costing me what?"                   → perPsn table
 *   - "Have my past storage charges been reasonable?"   → history list
 *
 * Per-PSN attribution: when multiple PSNs filled the same SKU bucket
 * (restocks), each PSN's share is `acceptedQty / sum(acceptedQty)` for
 * that bucket. Reported as a $/month estimate per PSN.
 *
 * No mutations — pure read view backed by GET /v1/vendors/me/recurring-storage.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Info, Repeat } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types — mirror the backend `VendorRecurringStorage` shape.
// ---------------------------------------------------------------------------

interface RecurringStorage {
  vendorId: string;
  monthlyEstimateCents: number;
  negotiatedTierSkuCount: number;
  activeSkuCount: number;
  /**
   * Migration 0034 — SKUs that have stock but are skipping the upcoming
   * cron because their first cycle was prepaid via the intake fee at
   * PSN submit. Shown to the vendor so they understand why newly-added
   * inventory doesn't push up the next bill.
   */
  coveredAtIntakeSkuCount: number;
  nextChargeAt: string;
  perTier: Array<{
    tier: string;
    skuCount: number;
    rateCents: number | null;
    subtotalCents: number | null;
  }>;
  perPsn: Array<{
    psnId: string;
    status: string;
    receivedAt: string | null;
    carrier: string | null;
    masterTracking: string | null;
    declaredBoxCounts: Record<string, number>;
    contributingSkuCount: number;
    contributingTierCounts: Record<string, number>;
    monthlyEstimateCents: number;
  }>;
  history: Array<{
    id: string;
    amountCents: number;
    balanceAfterCents: number | null;
    description: string;
    createdAt: string;
  }>;
}

interface WalletSnapshot {
  balanceCents: number;
  lowBalanceThresholdCents: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Days between now and `iso`. Negative if `iso` is in the past. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

const PSN_TONE: Record<string, "success" | "warning" | "error"> = {
  RECEIVED: "success",
  PARTIALLY_RECEIVED: "warning",
  DISCREPANCY: "warning",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RecurringStoragePage(): JSX.Element {
  const recurringQ = useQuery({
    queryKey: ["vendor", "recurring-storage"],
    queryFn: () => api.get<RecurringStorage>("/vendors/me/recurring-storage"),
    // Inventory state changes with each PSN receive / order ship — but not
    // on a per-second timescale. 60 s is plenty for a billing page.
    staleTime: 60_000,
  });

  // Wallet is shown side-by-side with the estimate so vendors can see if
  // they'll fund the upcoming charge. Fed by the existing /wallet endpoint.
  const walletQ = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get<WalletSnapshot>("/wallet"),
    staleTime: 60_000,
  });

  if (recurringQ.isLoading) {
    return (
      <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
    );
  }
  if (recurringQ.error || !recurringQ.data) {
    const normalized = recurringQ.error ? normalizeError(recurringQ.error) : null;
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "Couldn't load your storage estimate"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "Try refreshing the page in a moment."}
        </p>
      </div>
    );
  }

  const data = recurringQ.data;
  const wallet = walletQ.data;
  const daysLeft = daysUntil(data.nextChargeAt);
  const willCover = wallet ? wallet.balanceCents >= data.monthlyEstimateCents : null;
  const showWalletShortfallWarning =
    wallet && data.monthlyEstimateCents > 0 && wallet.balanceCents < data.monthlyEstimateCents;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[05] Wallet / Recurring storage"
        title="Monthly storage charges"
        description="Your storage bill on the 1st of each month, driven by the SKU buckets currently in our warehouse. Updates the moment a PSN is received."
        actions={
          <Link
            href="/wallet"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back to wallet
          </Link>
        }
      />

      {/* Headline summary — three cards. Estimate, next charge date, wallet vs charge. */}
      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-line bg-white p-5">
          <div className="flex items-center gap-2 font-mono text-mono-label uppercase text-text-muted">
            <Repeat className="h-3.5 w-3.5" aria-hidden /> Next monthly charge
          </div>
          <div className="mt-2 text-display-lg font-medium tabular-nums text-ink">
            {formatCents(data.monthlyEstimateCents)}
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
            {data.activeSkuCount} active SKU{data.activeSkuCount === 1 ? "" : "s"}
            {data.negotiatedTierSkuCount > 0
              ? ` · ${data.negotiatedTierSkuCount} negotiated`
              : ""}
          </div>
          {/* Migration 0034 — when the vendor has SKUs whose first cycle
              is prepaid at intake, surface that here so they understand
              the upcoming bill DOESN'T include their just-added boxes.
              This is the line that prevents the "$50 → $72 due in 7
              days" confusion when adding inventory mid-month. */}
          {data.coveredAtIntakeSkuCount > 0 ? (
            <div className="mt-2 rounded-sm border-l-2 border-amber bg-amber/5 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-amber">
              + {data.coveredAtIntakeSkuCount} SKU
              {data.coveredAtIntakeSkuCount === 1 ? "" : "s"} · first cycle paid at intake
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-line bg-white p-5">
          <div className="flex items-center gap-2 font-mono text-mono-label uppercase text-text-muted">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Charge date
          </div>
          <div className="mt-2 text-h1 font-medium text-ink">
            {formatDate(data.nextChargeAt)}
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
            {daysLeft > 0
              ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} from now · 02:00 UTC`
              : "Today · 02:00 UTC"}
          </div>
        </div>

        <div
          className={
            "rounded-md border p-5 " +
            (showWalletShortfallWarning
              ? "border-error bg-error/5"
              : "border-line bg-white")
          }
        >
          <div className="flex items-center gap-2 font-mono text-mono-label uppercase text-text-muted">
            <Info className="h-3.5 w-3.5" aria-hidden /> Wallet vs. charge
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span
              className={
                "text-h1 font-medium tabular-nums " +
                (showWalletShortfallWarning ? "text-error" : "text-ink")
              }
            >
              {formatCents(wallet?.balanceCents ?? null)}
            </span>
            {wallet ? (
              <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                /{formatCents(data.monthlyEstimateCents)}
              </span>
            ) : null}
          </div>
          {showWalletShortfallWarning ? (
            <Link
              href="/wallet/fund"
              className="mt-2 inline-block font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
            >
              Top up wallet →
            </Link>
          ) : willCover ? (
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.2px] text-success">
              Covered
            </div>
          ) : (
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
              Loading balance…
            </div>
          )}
        </div>
      </section>

      {/* Wallet shortfall banner — prominent so it can't be missed. */}
      {showWalletShortfallWarning ? (
        <div
          role="alert"
          className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
        >
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-error">
            Wallet won&apos;t cover next charge
          </div>
          <p className="mt-1 text-body-sm text-text">
            On {formatDate(data.nextChargeAt)} we&apos;ll attempt to debit{" "}
            <strong>{formatCents(data.monthlyEstimateCents)}</strong> from your wallet,
            currently holding <strong>{formatCents(wallet?.balanceCents ?? 0)}</strong>.
            Top up before the 1st to avoid your account flipping to{" "}
            <span className="font-mono text-[11px] uppercase tracking-[1.2px]">
              STORAGE OVERDUE
            </span>
            , which pauses fulfillment.
          </p>
          <div className="mt-3">
            <Link
              href="/wallet/fund"
              className="inline-block rounded-sm border border-amber bg-amber/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:bg-amber/20"
            >
              Add funds →
            </Link>
          </div>
        </div>
      ) : null}

      {/* Per-tier breakdown */}
      <section className="rounded-md border border-line bg-white p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 font-semibold text-ink">By storage tier</h2>
          <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
            One row per tier × rate
          </span>
        </header>
        <p className="mt-1 text-body-sm text-text-muted">
          Each row is a tier × the count of SKU buckets currently sitting in
          that tier. The Pallet tier is priced per-quote — those slots are
          shown but excluded from the monthly total.
        </p>
        {data.perTier.length === 0 ? (
          <EmptyState
            title="No active inventory yet"
            description="Once your first PSN is received, the storage estimate appears here. Submit a Pre-Shipment Notice to get started."
          />
        ) : (
          <DataTable className="mt-4">
            <THead>
              <Th>Tier</Th>
              <Th align="right">Active SKUs</Th>
              <Th align="right">Rate / SKU</Th>
              <Th align="right">Monthly subtotal</Th>
            </THead>
            <TBody>
              {data.perTier.map((row) => (
                <TR key={row.tier}>
                  <Td mono>{row.tier.replace("_", "-")}</Td>
                  <Td num>{row.skuCount}</Td>
                  <Td num>
                    {row.rateCents != null ? formatCents(row.rateCents) : "Negotiable"}
                  </Td>
                  <Td num strong>
                    {row.subtotalCents != null
                      ? formatCents(row.subtotalCents)
                      : "Negotiable"}
                  </Td>
                </TR>
              ))}
              <TR className="bg-cream-soft">
                <Td mono strong>
                  Monthly total
                </Td>
                <Td num strong>
                  {data.activeSkuCount}
                </Td>
                <Td num className="text-text-muted">
                  —
                </Td>
                <Td num strong>
                  {formatCents(data.monthlyEstimateCents)}
                </Td>
              </TR>
            </TBody>
          </DataTable>
        )}
      </section>

      {/* Per-PSN attribution — the headline view the user asked for. */}
      <section className="rounded-md border border-line bg-white p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 font-semibold text-ink">By Pre-Shipment Notice</h2>
          <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
            What each PSN is costing you per month
          </span>
        </header>
        <p className="mt-1 text-body-sm text-text-muted">
          We attribute each PSN&apos;s monthly cost based on the inventory it
          brought into the warehouse. When restocks land in the same SKU
          bucket, the cost splits proportionally by accepted quantity.
        </p>
        {data.perPsn.length === 0 ? (
          <EmptyState
            title="No PSNs are contributing storage yet"
            description="As soon as a PSN is received and its SKUs have stock, the per-PSN cost appears here."
          />
        ) : (
          <DataTable className="mt-4">
            <THead>
              <Th>PSN</Th>
              <Th>Status</Th>
              <Th>Received</Th>
              <Th>Contributing SKUs</Th>
              <Th align="right">Monthly cost</Th>
              <Th align="right">{" "}</Th>
            </THead>
            <TBody>
              {data.perPsn.map((row) => {
                const totalMonthly = data.monthlyEstimateCents;
                const sharePct =
                  totalMonthly > 0
                    ? Math.round((row.monthlyEstimateCents / totalMonthly) * 100)
                    : 0;
                return (
                  <TR key={row.psnId}>
                    <Td mono strong>
                      {row.psnId.slice(0, 8)}
                    </Td>
                    <Td>
                      <StatusPill tone={PSN_TONE[row.status] ?? "warning"}>
                        {row.status.replace(/_/g, " ")}
                      </StatusPill>
                    </Td>
                    <Td className="text-text-muted">
                      {formatDate(row.receivedAt)}
                    </Td>
                    <Td>
                      <div className="font-medium text-ink">
                        {row.contributingSkuCount} SKU
                        {row.contributingSkuCount === 1 ? "" : "s"}
                      </div>
                      <div className="font-mono text-[11px] text-text-muted">
                        {Object.entries(row.contributingTierCounts)
                          .map(([t, n]) => `${t.replace("_", "-")}×${n}`)
                          .join(" · ") || "—"}
                      </div>
                    </Td>
                    <Td num strong>
                      {formatCents(row.monthlyEstimateCents)}
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-text-subtle">
                        {sharePct}% of bill
                      </div>
                    </Td>
                    <Td align="right">
                      <Link
                        href={`/psn/${row.psnId}`}
                        className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                      >
                        Open →
                      </Link>
                    </Td>
                  </TR>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </section>

      {/* Past storage charges */}
      <section className="rounded-md border border-line bg-white p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 font-semibold text-ink">Past storage charges</h2>
          <Link
            href="/wallet/statements"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
          >
            Full statements →
          </Link>
        </header>
        <p className="mt-1 text-body-sm text-text-muted">
          The latest twelve monthly storage debits from your ledger. Use the
          statements page for itemized PDFs.
        </p>
        {data.history.length === 0 ? (
          <p className="mt-4 font-mono text-mono-label uppercase text-text-muted">
            No storage charges yet — your first will land on the 1st of next month.
          </p>
        ) : (
          <DataTable className="mt-4">
            <THead>
              <Th>When</Th>
              <Th>Description</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Balance after</Th>
            </THead>
            <TBody>
              {data.history.map((row) => (
                <TR key={row.id}>
                  <Td mono className="text-text-muted">
                    {new Date(row.createdAt).toLocaleString()}
                  </Td>
                  <Td>{row.description}</Td>
                  <Td num strong className="text-error">
                    {formatCents(row.amountCents)}
                  </Td>
                  <Td num className="text-text-muted">
                    {formatCents(row.balanceAfterCents)}
                  </Td>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </section>

      {/* Footer note */}
      <p className="text-caption text-text-muted">
        Estimates use the live monthly storage rates from{" "}
        <Link href="/pricing" className="underline-offset-4 hover:underline">
          pricing
        </Link>
        . The actual debit on the 1st is computed at billing time, so a PSN
        received between now and then will be included.
      </p>
    </div>
  );
}
