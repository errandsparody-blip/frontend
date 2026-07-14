/**
 * /admin/pack/rates — Fulfillment v2 rate-picker queue (Migration 0042).
 *
 * Two-panel layout: left is the queue of orders in PACKING_COMPLETED
 * or AWAITING_SHIPPING_SELECTION or AWAITING_WALLET_FUNDING, right is
 * the rate options + selection controls for the currently-focused
 * order.
 *
 * Workflow:
 *   1. Operator selects a row from the left panel.
 *   2. Right panel loads cached rate options. If none exist yet (row
 *      is PACKING_COMPLETED), operator clicks "Fetch rates" to call
 *      Shippo and populate the cache.
 *   3. Operator picks a rate + clicks "Charge and buy label".
 *      Two outcomes:
 *        * SHIPPING_PAID → wallet was debited, label-buy pipeline
 *          takes over. Row disappears from this queue.
 *        * AWAITING_WALLET_FUNDING → vendor's wallet was short. Row
 *          moves into the amber-tinted "waiting on funding" state
 *          in the queue. Operator can re-attempt selection once the
 *          vendor tops up.
 *
 * RBAC — enforced server-side by admin.orders.read/write. Client is
 * unaware of role; it just renders what the API returns.
 *
 * SECURITY / correctness notes
 *   * The rate-provider ref is never editable by the operator — they
 *     pick from the cached rows returned by the server. Server
 *     re-validates the ref inside the transaction so even a spoofed
 *     PATCH can't route around the cache.
 *   * All money is displayed from server-supplied cents; no client
 *     arithmetic touches wallet totals.
 *   * The wallet-short outcome does NOT trigger any additional
 *     action; operator must explicitly click Retry after coordinating
 *     with the vendor.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

type QueueStatus =
  | "PACKING_COMPLETED"
  | "AWAITING_SHIPPING_SELECTION"
  | "AWAITING_WALLET_FUNDING";

interface RateQueueRow {
  id: string;
  orderNumber: number;
  status: QueueStatus;
  vendorBusinessName: string;
  packedAt: string | null;
  lineCount: number;
}

interface RateOption {
  rateProviderRef: string;
  shipmentProviderRef: string;
  carrier: string;
  service: string;
  costCents: number;
  estimatedDeliveryDays: number;
  fetchedAt: string;
}

type SelectRateResponse =
  | {
      outcome: "SHIPPING_PAID";
      balanceAfterCents: number;
      shippingCostCents: number;
      carrier: string;
      service: string;
      rateProviderRef: string;
    }
  | {
      outcome: "AWAITING_WALLET_FUNDING";
      walletBalanceCents: number;
      requiredCents: number;
      carrier: string;
      service: string;
      rateProviderRef: string;
    };

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATUS_TONE: Record<QueueStatus, "neutral" | "info" | "warning"> = {
  PACKING_COMPLETED: "neutral",
  AWAITING_SHIPPING_SELECTION: "info",
  AWAITING_WALLET_FUNDING: "warning",
};

export default function AdminRatePickerPage(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SelectRateResponse | null>(null);

  const queueQ = useQuery({
    queryKey: ["admin", "pack", "rate-queue"],
    queryFn: () =>
      api.get<{ items: RateQueueRow[] }>("/admin/pack/rate-queue?limit=100"),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  // Auto-select the first row when the queue lands so the operator
  // doesn't stare at an empty right panel. Never override an explicit
  // pick — only fill when nothing is selected.
  useEffect(() => {
    if (selectedId !== null) return;
    const first = queueQ.data?.items[0];
    if (first) setSelectedId(first.id);
  }, [queueQ.data, selectedId]);

  const selectedRow = queueQ.data?.items.find((r) => r.id === selectedId) ?? null;

  const optionsQ = useQuery({
    queryKey: ["admin", "pack", "rate-options", selectedId],
    queryFn: () =>
      api.get<{ items: RateOption[] }>(
        `/admin/pack/${selectedId}/rate-options`,
      ),
    enabled: selectedId !== null,
    staleTime: 10_000,
  });

  const fetchMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No order selected.");
      return api.post<{ orderId: string; status: string; options: RateOption[] }>(
        `/admin/pack/${selectedId}/fetch-rates`,
        {},
      );
    },
    onMutate: () => clear(),
    onSuccess: async (data) => {
      qc.setQueryData(["admin", "pack", "rate-options", selectedId], {
        items: data.options,
      });
      // Order status just changed — refresh the queue so the pill
      // updates from PACKING_COMPLETED to AWAITING_SHIPPING_SELECTION.
      await qc.invalidateQueries({ queryKey: ["admin", "pack", "rate-queue"] });
    },
    onError: (err) => handle(err),
  });

  const selectMut = useMutation({
    mutationFn: async (rateProviderRef: string) => {
      if (!selectedId) throw new Error("No order selected.");
      return api.post<SelectRateResponse>(
        `/admin/pack/${selectedId}/select-rate`,
        { rateProviderRef },
      );
    },
    onMutate: () => {
      clear();
      setLastResult(null);
    },
    onSuccess: async (data) => {
      setLastResult(data);
      await qc.invalidateQueries({ queryKey: ["admin", "pack", "rate-queue"] });
      if (data.outcome === "SHIPPING_PAID") {
        // Order left this queue — clear the picked ref and select the
        // next row so the operator flows through their batch.
        setPickedRef(null);
        const remaining = queueQ.data?.items.filter((r) => r.id !== selectedId) ?? [];
        setSelectedId(remaining[0]?.id ?? null);
      }
    },
    onError: (err) => handle(err),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Fulfillment v2"
        title="Rate picker"
        description="Orders packed and awaiting a carrier decision. Pick a rate to charge the vendor's wallet and hand off to label-buy."
        actions={
          <Link
            href="/admin/pack"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-body-sm font-semibold text-ink hover:bg-cream-soft"
          >
            ← Pack queue
          </Link>
        }
      />

      {bannerError ? <ErrorBanner error={bannerError} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* --- Queue panel --- */}
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
            Queue
          </h2>
          {queueQ.isLoading ? (
            <div className="p-4 text-body-sm text-text-muted">Loading…</div>
          ) : queueQ.data && queueQ.data.items.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              description="Once orders are packed they'll appear here for rate selection."
            />
          ) : (
            <ul className="divide-y divide-line">
              {(queueQ.data?.items ?? []).map((row) => {
                const isSelected = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(row.id);
                        setPickedRef(null);
                        setLastResult(null);
                      }}
                      className={
                        isSelected
                          ? "w-full rounded-md bg-cream-soft px-3 py-3 text-left"
                          : "w-full px-3 py-3 text-left hover:bg-cream-soft"
                      }
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-mono text-body-sm font-semibold text-ink">
                          #{row.orderNumber}
                        </div>
                        <StatusPill tone={STATUS_TONE[row.status]}>
                          {row.status.replace(/_/g, " ")}
                        </StatusPill>
                      </div>
                      <div className="mt-1 text-body-sm text-text">
                        {row.vendorBusinessName}
                      </div>
                      <div className="mt-0.5 font-mono text-body-xs text-text-muted">
                        {row.lineCount} lines · packed{" "}
                        {row.packedAt
                          ? new Date(row.packedAt).toLocaleTimeString()
                          : "—"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* --- Detail / rate picker panel --- */}
        <section className="rounded-md border border-line bg-white p-6">
          {selectedRow === null ? (
            <div className="text-body-sm text-text-muted">
              Select an order from the queue to view carrier rates.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-h2 font-semibold text-ink">
                    Order <span className="font-mono">#{selectedRow.orderNumber}</span>
                  </h2>
                  <p className="mt-1 text-body-sm text-text-muted">
                    {selectedRow.vendorBusinessName} · {selectedRow.lineCount} lines
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fetchMut.mutate()}
                    loading={fetchMut.isPending}
                    disabled={fetchMut.isPending}
                  >
                    {optionsQ.data && optionsQ.data.items.length > 0
                      ? "Re-fetch rates"
                      : "Fetch rates"}
                  </Button>
                </div>
              </div>

              {selectedRow.status === "AWAITING_WALLET_FUNDING" ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-body-sm text-amber-900">
                  This order is waiting on the vendor to top up their wallet.
                  Coordinate with the vendor before re-attempting the charge —
                  a second selection will re-run the wallet debit.
                </div>
              ) : null}

              {optionsQ.isLoading ? (
                <div className="mt-6 text-body-sm text-text-muted">
                  Loading cached rates…
                </div>
              ) : optionsQ.data && optionsQ.data.items.length === 0 ? (
                <div className="mt-6 rounded-md border border-line bg-cream-soft p-4 text-body-sm text-text-muted">
                  No cached rates yet. Click <strong>Fetch rates</strong> above
                  to price against Shippo.
                </div>
              ) : (
                <div className="mt-6">
                  <div className="mb-2 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
                    Carrier rates
                  </div>
                  <DataTable>
                    <THead>
                      <Th>Pick</Th>
                      <Th>Carrier</Th>
                      <Th>Service</Th>
                      <Th align="right">Est. days</Th>
                      <Th align="right">Cost</Th>
                    </THead>
                    <TBody>
                      {(optionsQ.data?.items ?? []).map((opt) => {
                        const checked = opt.rateProviderRef === pickedRef;
                        return (
                          <TR
                            key={opt.rateProviderRef}
                            onClick={() => setPickedRef(opt.rateProviderRef)}
                            className={
                              checked
                                ? "cursor-pointer bg-cream-soft"
                                : "cursor-pointer"
                            }
                          >
                            <Td>
                              <input
                                type="radio"
                                name="pickedRate"
                                checked={checked}
                                onChange={() => setPickedRef(opt.rateProviderRef)}
                              />
                            </Td>
                            <Td>{opt.carrier}</Td>
                            <Td>{opt.service}</Td>
                            <Td num>{opt.estimatedDeliveryDays}</Td>
                            <Td num>{dollars(opt.costCents)}</Td>
                          </TR>
                        );
                      })}
                    </TBody>
                  </DataTable>
                </div>
              )}

              {lastResult ? (
                <div
                  className={
                    lastResult.outcome === "SHIPPING_PAID"
                      ? "mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-body-sm text-green-800"
                      : "mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-body-sm text-amber-900"
                  }
                >
                  {lastResult.outcome === "SHIPPING_PAID" ? (
                    <>
                      <div className="font-semibold">Wallet debited</div>
                      <p className="mt-1">
                        Charged {dollars(lastResult.shippingCostCents)} for{" "}
                        {lastResult.carrier} {lastResult.service}. Vendor balance
                        is now {dollars(lastResult.balanceAfterCents)}. Label
                        purchase queued.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold">Vendor wallet short</div>
                      <p className="mt-1">
                        Needed {dollars(lastResult.requiredCents)} for{" "}
                        {lastResult.carrier} {lastResult.service}. Vendor
                        balance is {dollars(lastResult.walletBalanceCents)}.
                        Order moved to AWAITING_WALLET_FUNDING; retry after top-up.
                      </p>
                    </>
                  )}
                </div>
              ) : null}

              <div className="mt-6 flex justify-end">
                <Button
                  type="button"
                  variant="amber"
                  size="lg"
                  disabled={pickedRef === null || selectMut.isPending}
                  loading={selectMut.isPending}
                  onClick={() => {
                    if (pickedRef) selectMut.mutate(pickedRef);
                  }}
                >
                  {selectMut.isPending
                    ? "Charging…"
                    : "Charge wallet and buy label"}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
