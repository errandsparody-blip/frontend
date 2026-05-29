"use client";

/**
 * Admin mirror of the vendor's /wallet/recurring page.
 *
 * Shows the same monthly total, next charge, upcoming-charges
 * timeline, and per-PSN breakdown the vendor sees — but with three
 * extra actions on each individual box row:
 *
 *   - Mark empty   (ACTIVE → EMPTY)   stops billing, keeps audit row
 *   - Remove       (any → REMOVED)    consolidated out of warehouse
 *   - Restore      (EMPTY/REMOVED → ACTIVE) undo an operator mistake
 *
 * Each action posts to /v1/admin/storage-boxes/:id/{mark-empty,remove,restore}
 * which audit-logs the change. On success we invalidate both the
 * recurring-storage and storage-boxes queries so the page re-fetches
 * and the headline + lists update together.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types — mirror the backend VendorRecurringStorage response.
// ---------------------------------------------------------------------------

interface RecurringStorage {
  vendorId: string;
  monthlyTotalCents: number;
  nextChargeAmountCents: number;
  monthlyEstimateCents: number;
  negotiatedTierSkuCount: number;
  activeSkuCount: number;
  coveredAtIntakeSkuCount: number;
  nextChargeAt: string;
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
    contributingSkuCount: number;
    contributingTierCounts: Record<string, number>;
    monthlyEstimateCents: number;
    firstBillingDate: string | null;
    /**
     * Migration 0036 — true when every box on this PSN is bundled with
     * an existing parent pallet (ADD_TO_PALLET shipment). UI renders a
     * "Bundled with pallet" badge instead of a per-month charge.
     */
    isBundledWithParentPallet: boolean;
  }>;
  /** Migration 0036 — boxes folded into an existing parent pallet. */
  bundledBoxCount: number;
  /** Per-tier breakdown of the bundled boxes above. */
  bundledByTier: Record<string, number>;
}

interface StorageBox {
  id: string;
  psnId: string;
  tier: string;
  status: string;
  receivedAt: string;
  /**
   * Migration 0036 — null means "bundled with parent pallet, not billed
   * independently". UI renders bundled rows with a badge instead of a
   * charge date.
   */
  nextBillingDate: string | null;
  palletContentTier: string | null;
  palletContentCount: number | null;
  statusNote: string | null;
  statusChangedAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — kept local so the component file is self-contained.
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

const STATUS_TONE: Record<string, "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  EMPTY: "warning",
  REMOVED: "neutral",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminRecurringStorage({ vendorId }: { vendorId: string }): JSX.Element {
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const recurringQ = useQuery({
    queryKey: ["admin", "vendors", vendorId, "recurring-storage"],
    queryFn: () =>
      api.get<RecurringStorage>(
        `/admin/vendors/${encodeURIComponent(vendorId)}/recurring-storage`,
      ),
    staleTime: 30_000,
  });

  const boxesQ = useQuery({
    queryKey: ["admin", "vendors", vendorId, "storage-boxes"],
    queryFn: () =>
      api.get<StorageBox[]>(
        `/admin/vendors/${encodeURIComponent(vendorId)}/storage-boxes`,
      ),
    staleTime: 30_000,
  });

  // Three mutations, one per state transition. They share the same
  // onSuccess / onError handlers via inline arrow functions so the
  // hook calls stay at the top level (rules of hooks).
  const handleSuccess = async (): Promise<void> => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "vendors", vendorId, "recurring-storage"] }),
      qc.invalidateQueries({ queryKey: ["admin", "vendors", vendorId, "storage-boxes"] }),
    ]);
  };
  const handleError = (err: unknown): void => {
    const msg =
      (err as { response?: { message?: string } })?.response?.message ??
      (err instanceof Error ? err.message : "Action failed");
    setActionError(msg);
  };

  const markEmptyM = useMutation({
    mutationFn: ({ boxId, note }: { boxId: string; note?: string }) =>
      api.post<{ id: string; status: string }>(
        `/admin/storage-boxes/${encodeURIComponent(boxId)}/mark-empty`,
        { note },
      ),
    onMutate: () => setActionError(null),
    onSuccess: handleSuccess,
    onError: handleError,
  });
  const removeM = useMutation({
    mutationFn: ({ boxId, note }: { boxId: string; note?: string }) =>
      api.post<{ id: string; status: string }>(
        `/admin/storage-boxes/${encodeURIComponent(boxId)}/remove`,
        { note },
      ),
    onMutate: () => setActionError(null),
    onSuccess: handleSuccess,
    onError: handleError,
  });
  const restoreM = useMutation({
    mutationFn: ({ boxId, note }: { boxId: string; note?: string }) =>
      api.post<{ id: string; status: string }>(
        `/admin/storage-boxes/${encodeURIComponent(boxId)}/restore`,
        { note },
      ),
    onMutate: () => setActionError(null),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  if (recurringQ.isLoading || boxesQ.isLoading) {
    return (
      <section className="rounded-md border border-line bg-white p-6">
        <div className="font-mono text-mono-label uppercase text-text-muted">
          Loading recurring storage…
        </div>
      </section>
    );
  }
  if (recurringQ.error || !recurringQ.data || boxesQ.error || !boxesQ.data) {
    return (
      <section className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-error">
          Couldn&apos;t load recurring storage
        </div>
        <p className="mt-1 text-body-sm text-text">Try refreshing the page in a moment.</p>
      </section>
    );
  }

  const data = recurringQ.data;
  const boxes = boxesQ.data;

  // Index boxes by PSN so we can render them under each PSN row.
  const boxesByPsn = new Map<string, StorageBox[]>();
  for (const b of boxes) {
    const list = boxesByPsn.get(b.psnId) ?? [];
    list.push(b);
    boxesByPsn.set(b.psnId, list);
  }

  return (
    <section className="flex flex-col gap-6 rounded-md border border-line bg-white p-6">
      {/* Header */}
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-semibold text-ink">Recurring storage</h2>
        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          Same view the vendor sees · per-box billing
        </span>
      </header>
      <p className="text-body-sm text-text-muted">
        What this vendor is charged to keep their inventory in our warehouse.
        Each item is billed once every 30 days, anchored to the day it was
        received. Use the controls under each box to mark it empty or remove
        it from billing.
      </p>

      {actionError ? (
        <div
          role="alert"
          className="rounded-md border-l-4 border-error bg-error/10 px-5 py-3 text-body-sm text-text"
        >
          {actionError}
        </div>
      ) : null}

      {/* Headline cards — monthly total / next charge / active counts. */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card label="Storage per month" value={formatCents(data.monthlyTotalCents)}>
          {data.activeSkuCount} active box{data.activeSkuCount === 1 ? "" : "es"}
          {data.negotiatedTierSkuCount > 0
            ? ` · ${data.negotiatedTierSkuCount} on a custom rate`
            : ""}
        </Card>
        <Card label="Next charge" value={formatCents(data.nextChargeAmountCents)}>
          {formatDate(data.nextChargeAt)}
        </Card>
        <Card
          label="In grace period"
          value={String(data.coveredAtIntakeSkuCount)}
          amber={data.coveredAtIntakeSkuCount > 0}
        >
          Box{data.coveredAtIntakeSkuCount === 1 ? "" : "es"} whose first 30 days
          are already covered by the receiving fee
        </Card>
      </div>

      {/* Upcoming charges */}
      {data.upcomingCharges.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-h3 font-semibold text-ink">Upcoming charges</h3>
          {data.upcomingCharges.map((group) => (
            <div
              key={group.startsBilling}
              className="rounded-md border border-line bg-cream-soft p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
                <div className="font-medium text-ink">{formatDate(group.startsBilling)}</div>
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
                      {line.subtotalCents != null ? formatCents(line.subtotalCents) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {/* Per-PSN with action buttons on every box. This is the
          consolidate UI: staff see every box this vendor has, grouped
          by the shipment it came from, with a button to flag each one
          empty or remove it from billing entirely. */}
      <div className="flex flex-col gap-3">
        <h3 className="text-h3 font-semibold text-ink">By Pre-Shipment Notice</h3>
        {boxes.length === 0 ? (
          <EmptyState
            title="No boxes yet"
            description="Once a shipment is received, every physical box becomes a row here."
          />
        ) : (
          <DataTable>
            <THead>
              <Th>PSN</Th>
              <Th>Box</Th>
              <Th>Status</Th>
              <Th>Received</Th>
              <Th>Next billing</Th>
              <Th align="right">Actions</Th>
            </THead>
            <TBody>
              {Array.from(boxesByPsn.entries()).map(([psnId, list]) =>
                list.map((box) => {
                  const isPending =
                    (markEmptyM.isPending && markEmptyM.variables?.boxId === box.id) ||
                    (removeM.isPending && removeM.variables?.boxId === box.id) ||
                    (restoreM.isPending && restoreM.variables?.boxId === box.id);
                  return (
                    <TR key={box.id}>
                      <Td mono>{psnId.slice(0, 8)}</Td>
                      <Td>
                        <div className="font-medium text-ink">{tierLabel(box.tier)}</div>
                        {box.tier === "PALLET" && box.palletContentCount != null ? (
                          <div className="font-mono text-[11px] text-text-muted">
                            {box.palletContentCount}{" "}
                            {box.palletContentTier
                              ? tierLabel(box.palletContentTier)
                              : "box"}
                            {box.palletContentCount === 1 ? "" : "es"} inside
                          </div>
                        ) : null}
                      </Td>
                      <Td>
                        <StatusPill tone={STATUS_TONE[box.status] ?? "neutral"}>
                          {box.status}
                        </StatusPill>
                        {box.statusNote ? (
                          <div className="mt-0.5 text-[11px] text-text-muted">
                            {box.statusNote}
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-text-muted">{formatDate(box.receivedAt)}</Td>
                      <Td className="text-text-muted">
                        {box.status !== "ACTIVE"
                          ? "—"
                          : box.nextBillingDate === null
                          ? "Bundled with pallet"
                          : formatDate(box.nextBillingDate)}
                      </Td>
                      <Td align="right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {box.status === "ACTIVE" ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                loading={isPending && markEmptyM.isPending}
                                disabled={isPending}
                                onClick={() => markEmptyM.mutate({ boxId: box.id })}
                              >
                                Mark empty
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                loading={isPending && removeM.isPending}
                                disabled={isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Remove this ${tierLabel(box.tier)} from billing? This is for boxes that have been physically consolidated out of the warehouse.`,
                                    )
                                  ) {
                                    removeM.mutate({ boxId: box.id });
                                  }
                                }}
                              >
                                Remove
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              loading={isPending && restoreM.isPending}
                              disabled={isPending}
                              onClick={() => restoreM.mutate({ boxId: box.id })}
                            >
                              Restore
                            </Button>
                          )}
                        </div>
                      </Td>
                    </TR>
                  );
                }),
              )}
            </TBody>
          </DataTable>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inline card subcomponent — kept private to this file because no
// other admin surface uses this exact shape.
// ---------------------------------------------------------------------------

function Card({
  label,
  value,
  amber,
  children,
}: {
  label: string;
  value: string;
  amber?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      className={
        "rounded-md border p-5 " + (amber ? "border-amber bg-amber/5" : "border-line bg-white")
      }
    >
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div
        className={
          "mt-2 text-display-lg font-medium tabular-nums " +
          (amber ? "text-amber" : "text-ink")
        }
      >
        {value}
      </div>
      <div className="mt-1 text-body-sm text-text-muted">{children}</div>
    </div>
  );
}
