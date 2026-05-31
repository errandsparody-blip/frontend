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
  /**
   * Steady-state cost across ALL active inventory at each item's
   * tier rate. Answers "what does my storage cost per month overall?".
   */
  monthlyTotalCents: number;
  /**
   * The very next charge amount — the sum of rates for the items
   * whose billing day has come due.
   */
  nextChargeAmountCents: number;
  /** Back-compat alias for nextChargeAmountCents — preferred new name above. */
  monthlyEstimateCents: number;
  negotiatedTierSkuCount: number;
  activeSkuCount: number;
  /**
   * Items still inside their 30-day receiving-fee grace period. Shown
   * to the vendor so they understand why their newest inventory does
   * not push up the next charge.
   */
  coveredAtIntakeSkuCount: number;
  nextChargeAt: string;
  /**
   * One group per upcoming billing date, each itemised by box size.
   * Renders as a stack of cards: "On Jun 24, 2026 you will be charged
   * $36 — 2× small box, 1× large box". The vendor sees exactly what
   * is being billed and when each box first joins the schedule.
   */
  upcomingCharges: Array<{
    startsBilling: string;
    totalCents: number;
    lines: Array<{
      tier: string;
      quantity: number;
      rateCents: number | null;
      subtotalCents: number | null;
    }>;
  }>;
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
    /** Earliest nextBillingDate among this PSN's SKUs — "this PSN starts billing on". */
    firstBillingDate: string | null;
    /**
     * Migration 0036 — true when every box on this PSN is bundled with
     * an existing parent pallet (ADD_TO_PALLET shipment). The row should
     * render a "Bundled with pallet" badge instead of a per-month charge
     * and a first-bill date, because the parent pallet's monthly $45
     * already covers the contents.
     */
    isBundledWithParentPallet: boolean;
  }>;
  /**
   * Migration 0036 — boxes the vendor has that ride inside an existing
   * parent pallet and so don't bill independently. Surfaced separately
   * so vendors who ship ADD_TO_PALLET can see they're carrying extra
   * inventory without thinking the next charge will jump.
   */
  bundledBoxCount: number;
  /** Per-tier breakdown of the bundled boxes above. */
  bundledByTier: Record<string, number>;
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

/** Human-readable label for a storage tier — "small box", "pallet", etc. */
function tierLabel(tier: string): string {
  switch (tier) {
    case "SMALL":
      return "small box";
    case "MEDIUM":
      return "medium box";
    case "LARGE":
      return "large box";
    case "X_LARGE":
      return "extra-large box";
    case "PALLET":
      return "pallet";
    default:
      return tier.toLowerCase().replace(/_/g, " ");
  }
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
  // Wallet shortfall is judged against the very next charge (the
  // amount that will actually be debited), not the steady-state
  // monthly total. The vendor only needs enough funds for what is
  // coming due on the next billing day.
  const nextChargeCents = data.nextChargeAmountCents;
  const willCover = wallet ? wallet.balanceCents >= nextChargeCents : null;
  const showWalletShortfallWarning =
    wallet && nextChargeCents > 0 && wallet.balanceCents < nextChargeCents;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Wallet / Recurring storage"
        title="Storage charges"
        description="What you pay to keep your inventory in our warehouse. Each item is billed once every 30 days, anchored to the day it was received. Your first 30 days are already covered by the receiving fee you paid when the shipment arrived."
        actions={
          <Link
            href="/wallet"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back to wallet
          </Link>
        }
      />

      {/* Headline summary — three cards. Steady-state monthly cost,
          next charge, wallet balance vs that charge. */}
      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-line bg-white p-5">
          <div className="flex items-center gap-2 font-mono text-mono-label uppercase text-text-muted">
            <Repeat className="h-3.5 w-3.5" aria-hidden /> Storage per month
          </div>
          <div className="mt-2 text-display-lg font-medium tabular-nums text-ink">
            {formatCents(data.monthlyTotalCents)}
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
            {data.activeSkuCount} active box{data.activeSkuCount === 1 ? "" : "es"}
            {data.negotiatedTierSkuCount > 0
              ? ` · ${data.negotiatedTierSkuCount} on a custom rate`
              : ""}
          </div>
          {data.coveredAtIntakeSkuCount > 0 ? (
            <div className="mt-2 rounded-sm border-l-2 border-amber bg-amber/5 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-amber">
              {data.coveredAtIntakeSkuCount} box
              {data.coveredAtIntakeSkuCount === 1 ? "" : "es"} · first 30 days already covered
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-line bg-white p-5">
          <div className="flex items-center gap-2 font-mono text-mono-label uppercase text-text-muted">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Next charge
          </div>
          <div className="mt-2 text-h1 font-medium text-ink">
            {formatCents(data.nextChargeAmountCents)}
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
            {formatDate(data.nextChargeAt)} ·{" "}
            {daysLeft > 1
              ? `${daysLeft} days from now`
              : daysLeft === 1
              ? "tomorrow"
              : "today"}
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
                /{formatCents(nextChargeCents)}
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

      {/* Upcoming charges — one card per billing date, itemised by box
          size. Replaces the old per-month timeline so a vendor with
          inventory received on different days sees each cohort
          clearly: "On Jun 24 you pay $36 for 2 small + 1 large; on
          Jul 14 you start paying an extra $14 when the medium box
          comes off its grace period." */}
      {data.upcomingCharges.length > 0 ? (
        <section className="rounded-md border border-line bg-white p-6">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-h3 font-semibold text-ink">Upcoming charges</h2>
            <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
              What you pay, and when each box first appears
            </span>
          </header>
          <p className="mt-1 text-body-sm text-text-muted">
            Each card below is a billing date and the boxes being charged
            on that day. Items received recently sit in a later card because
            their first 30 days are already covered by the receiving fee
            you paid when the shipment arrived.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {data.upcomingCharges.map((group) => (
              <div
                key={group.startsBilling}
                className="rounded-md border border-line bg-cream-soft p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <div className="font-medium text-ink">
                      {formatDate(group.startsBilling)}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
                      {(() => {
                        const days = daysUntil(group.startsBilling);
                        if (days <= 0) return "Due today";
                        if (days === 1) return "Due tomorrow";
                        return `In ${days} days`;
                      })()}
                    </div>
                  </div>
                  <span className="text-h3 font-medium tabular-nums text-ink">
                    {formatCents(group.totalCents)}
                  </span>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {group.lines.map((line) => (
                    <li
                      key={line.tier}
                      className="flex items-baseline justify-between gap-3 text-body-sm"
                    >
                      <span className="text-text">
                        {line.quantity} × {tierLabel(line.tier)}
                        <span className="ml-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
                          {line.rateCents != null
                            ? `${formatCents(line.rateCents)} each`
                            : "custom rate"}
                        </span>
                      </span>
                      <span className="font-medium tabular-nums text-text">
                        {line.subtotalCents != null
                          ? formatCents(line.subtotalCents)
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Wallet shortfall banner — prominent so it can't be missed. */}
      {showWalletShortfallWarning ? (
        <div
          role="alert"
          className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
        >
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-error">
            Your wallet will not cover the next charge
          </div>
          <p className="mt-1 text-body-sm text-text">
            On {formatDate(data.nextChargeAt)} we will charge{" "}
            <strong>{formatCents(nextChargeCents)}</strong> from your wallet,
            which currently holds <strong>{formatCents(wallet?.balanceCents ?? 0)}</strong>.
            Please add funds before then. If the charge fails, your account will
            be marked overdue and we will pause shipping new orders until the
            balance is settled.
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
            All active inventory by size
          </span>
        </header>
        <p className="mt-1 text-body-sm text-text-muted">
          Every box we are currently holding for you, grouped by storage
          size. The monthly total is the ongoing cost of keeping this
          inventory in our warehouse — items still inside their first
          30 days are included here at their full rate even though the
          first charge is covered by the receiving fee. Pallet inventory
          is priced per quote and is listed but not included in the total.
        </p>
        {data.perTier.length === 0 ? (
          <EmptyState
            title="No inventory yet"
            description="Once we receive your first shipment, your storage estimate will appear here. Submit a Pre-Shipment Notice to get started."
          />
        ) : (
          <DataTable className="mt-4">
            <THead>
              <Th>Box size</Th>
              <Th align="right">Active boxes</Th>
              <Th align="right">Rate per box</Th>
              <Th align="right">Monthly subtotal</Th>
            </THead>
            <TBody>
              {data.perTier.map((row) => (
                <TR key={row.tier}>
                  <Td>{tierLabel(row.tier)}</Td>
                  <Td num>{row.skuCount}</Td>
                  <Td num>
                    {row.rateCents != null ? formatCents(row.rateCents) : "Custom"}
                  </Td>
                  <Td num strong>
                    {row.subtotalCents != null
                      ? formatCents(row.subtotalCents)
                      : "Custom"}
                  </Td>
                </TR>
              ))}
              <TR className="bg-cream-soft">
                <Td strong>Monthly total</Td>
                <Td num strong>
                  {data.activeSkuCount}
                </Td>
                <Td num className="text-text-muted">
                  —
                </Td>
                <Td num strong>
                  {formatCents(data.monthlyTotalCents)}
                </Td>
              </TR>
            </TBody>
          </DataTable>
        )}
        {/*
          Bundled boxes (migration 0036) — these are inner boxes from a
          PALLET shipment or boxes added on an ADD_TO_PALLET shipment.
          They are physically in the warehouse and listed here for
          transparency, but they do not contribute to the monthly total
          because the parent pallet's $45/mo already covers them.
          Hidden when there are none.
        */}
        {data.bundledBoxCount > 0 ? (
          <div className="mt-6 rounded-md border border-line-strong bg-cream-soft p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-mono text-mono-label uppercase tracking-[1.2px] text-text">
                Also in storage — bundled with a pallet
              </h3>
              <span className="font-mono text-[11px] text-text-muted">
                {data.bundledBoxCount}{" "}
                {data.bundledBoxCount === 1 ? "box" : "boxes"} · $0.00 / mo ·
                covered by pallet billing
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(data.bundledByTier)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([tier, count]) => (
                  <li
                    key={tier}
                    className="inline-flex items-baseline gap-1.5 rounded-sm border border-line bg-white px-2 py-1 font-mono text-[11px]"
                  >
                    <span className="text-text">{tierLabel(tier)}</span>
                    <span className="font-semibold tabular-nums text-ink">
                      ×{count}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* Per-PSN attribution — the headline view the user asked for. */}
      <section className="rounded-md border border-line bg-white p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 font-semibold text-ink">By Pre-Shipment Notice</h2>
          <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
            What each shipment costs per month
          </span>
        </header>
        <p className="mt-1 text-body-sm text-text-muted">
          Each shipment&apos;s monthly cost is the total rate of the physical
          boxes it delivered. Boxes still inside their first 30-day grace
          period are listed here at their full rate, but their cost will not
          appear on the next charge until that period ends.
        </p>
        {data.perPsn.length === 0 ? (
          <EmptyState
            title="No shipments are contributing to storage yet"
            description="Once we receive your first shipment and your boxes are in our warehouse, the per-shipment breakdown will appear here."
          />
        ) : (
          <DataTable className="mt-4">
            <THead>
              <Th>PSN</Th>
              <Th>Status</Th>
              <Th>Received</Th>
              <Th>Boxes</Th>
              <Th>Starts billing</Th>
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
                // Whether this PSN's first cron-bill has already passed
                // (i.e. it's currently contributing to the upcoming
                // charge) vs sits in the future (deferred, intake-prepaid
                // first cycle). The amber tint surfaces the deferred ones
                // so vendors can spot "yes, this PSN is loaded but not on
                // my next bill yet".
                const firstBills = row.firstBillingDate
                  ? new Date(row.firstBillingDate)
                  : null;
                const nextCharge = new Date(data.nextChargeAt);
                const isDeferred = firstBills !== null && firstBills > nextCharge;
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
                        {row.contributingSkuCount} box
                        {row.contributingSkuCount === 1 ? "" : "es"}
                      </div>
                      <div className="font-mono text-[11px] text-text-muted">
                        {Object.entries(row.contributingTierCounts)
                          .map(([t, n]) => `${t.replace("_", "-")}×${n}`)
                          .join(" · ") || "—"}
                      </div>
                    </Td>
                    <Td>
                      {row.isBundledWithParentPallet ? (
                        // ADD_TO_PALLET shipments: the parent pallet is
                        // already billing $45/mo and covers these boxes,
                        // so there is no separate first-bill date for
                        // this PSN. Surface it as a bundled badge.
                        <div className="font-mono text-body-sm text-text-muted">
                          Bundled with pallet
                        </div>
                      ) : (
                        <>
                          <div
                            className={
                              "font-mono text-body-sm " +
                              (isDeferred ? "text-amber" : "text-text")
                            }
                          >
                            {formatDate(row.firstBillingDate)}
                          </div>
                          {isDeferred ? (
                            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-amber">
                              first month already covered
                            </div>
                          ) : null}
                        </>
                      )}
                    </Td>
                    <Td num strong>
                      {row.isBundledWithParentPallet ? (
                        <>
                          <span className="text-text-muted">$0.00</span>
                          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-text-subtle">
                            covered by pallet billing
                          </div>
                        </>
                      ) : (
                        <>
                          {formatCents(row.monthlyEstimateCents)}
                          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-text-subtle">
                            {sharePct}% of bill
                          </div>
                        </>
                      )}
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
          Your last twelve monthly storage charges. For a full breakdown of
          every transaction, see your statements.
        </p>
        {data.history.length === 0 ? (
          <p className="mt-4 font-mono text-mono-label uppercase text-text-muted">
            No storage charges yet — your first will be on the 1st of next month.
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
        Estimates use the current monthly storage rates published on the{" "}
        <Link href="/pricing" className="underline-offset-4 hover:underline">
          pricing page
        </Link>
        . The actual charge is calculated on the 1st, so any shipment we
        receive before then will be included.
      </p>
    </div>
  );
}
