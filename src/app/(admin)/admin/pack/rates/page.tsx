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
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import { recipientAddressSchema } from "@/lib/schemas/orders";

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

/**
 * Phase P-D — order detail projection used by the rate picker's edit
 * panel. Only the fields the panel reads; the full admin order shape
 * is bigger.
 */
interface PackOrderDetail {
  id: string;
  status: string;
  recipientName: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  shipAddressLine1: string;
  shipAddressLine2: string | null;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
  itemsDeclaredValueCents: number;
  // Migration 0055 — vendor-requested label add-ons the operator honours.
  insuranceRequested: boolean;
  signatureRequired: boolean;
  adultSignatureRequired: boolean;
  // Migration 0057 — hazmat / special-handling add-ons.
  containsAlcohol: boolean;
  alcoholRecipientType: string | null;
  containsDryIce: boolean;
  dryIceWeightOz: number | null;
  containsLithium: boolean;
  packedLengthIn: number | null;
  packedWidthIn: number | null;
  packedHeightIn: number | null;
  packedWeightOz: number | null;
  packingNotes: string | null;
  packagingLabel: string | null;
}

type SelectRateResponse =
  | {
      // Phase P-C — the click also purchases the label in one shot
      // (spec Step 7). SHIPPING_PAID is no longer a terminal client-
      // observable outcome; LABEL_PURCHASED is.
      outcome: "LABEL_PURCHASED";
      balanceAfterCents: number;
      shippingCostCents: number;
      carrier: string;
      service: string;
      rateProviderRef: string;
      trackingNumber: string;
      labelUrl: string;
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

// Editable label add-ons the operator applies at rate/label time. Any change
// re-prices the rates against Shippo (extras affect the carrier rate).
interface AddonState {
  insuranceRequested: boolean;
  signatureRequired: boolean;
  adultSignatureRequired: boolean;
  containsAlcohol: boolean;
  alcoholRecipientType: "consumer" | "licensee";
  containsDryIce: boolean;
  dryIceWeightOz: number | null;
  containsLithium: boolean;
}

// Editable recipient / shipping-address fields. Mirrors the create
// form's recipient shape; validated client-side against
// recipientAddressSchema before the PATCH.
interface RecipientForm {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  shipAddressLine1: string;
  shipAddressLine2: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: "US" | "CA";
}

const STATUS_TONE: Record<QueueStatus, "neutral" | "info" | "warning"> = {
  PACKING_COMPLETED: "neutral",
  AWAITING_SHIPPING_SELECTION: "info",
  AWAITING_WALLET_FUNDING: "warning",
};

export default function AdminRatePickerPage(): JSX.Element {
  const qc = useQueryClient();
  const router = useRouter();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SelectRateResponse | null>(null);
  // Editable add-ons the operator applies at buy-label time. Seeded from the
  // vendor's request; the admin can add or remove them. Signature affects the
  // rate, so changes take effect on the next Fetch/Refresh rates.
  const [addons, setAddons] = useState<AddonState | null>(null);
  // Signature of the add-ons as of the last seed/fetch. When the operator
  // changes an add-on the signature diverges and we auto re-price.
  const addonSigRef = useRef<string | null>(null);

  // Edit-recipient panel. Opened when a carrier refuses the shipment over
  // the recipient details (missing phone is the usual one). Seeded from
  // the order; on save we PATCH the order, the server drops the cached
  // rates, and we auto re-fetch so the operator picks from fresh rates.
  const [editingRecipient, setEditingRecipient] = useState(false);
  const [recipientForm, setRecipientForm] = useState<RecipientForm | null>(null);
  const [recipientErrors, setRecipientErrors] = useState<Record<string, string>>({});

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

  // Phase P-D — order detail fetch so the right panel can surface
  // packed dims, weight, packaging, address, and (via the "Edit"
  // action) let the operator correct any of them BEFORE the label
  // is bought. Guarded on selectedId; short stale time so an edit
  // shows up immediately.
  const orderQ = useQuery({
    queryKey: ["admin", "pack", "order-detail", selectedId],
    queryFn: () =>
      api.get<PackOrderDetail>(`/admin/orders/${selectedId}`),
    enabled: selectedId !== null,
    staleTime: 10_000,
  });

  // Seed the editable add-ons from the order — but only when a DIFFERENT
  // order loads (keyed on id), so a background refetch of the same order
  // doesn't clobber the operator's in-progress edits.
  useEffect(() => {
    if (!orderQ.data) return;
    const seeded: AddonState = {
      insuranceRequested: orderQ.data.insuranceRequested,
      signatureRequired: orderQ.data.signatureRequired,
      adultSignatureRequired: orderQ.data.adultSignatureRequired,
      containsAlcohol: orderQ.data.containsAlcohol,
      alcoholRecipientType: orderQ.data.alcoholRecipientType === "licensee" ? "licensee" : "consumer",
      containsDryIce: orderQ.data.containsDryIce,
      dryIceWeightOz: orderQ.data.dryIceWeightOz,
      containsLithium: orderQ.data.containsLithium,
    };
    setAddons(seeded);
    // Baseline signature — the auto re-price only fires once the operator
    // changes something away from this.
    addonSigRef.current = JSON.stringify(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderQ.data?.id]);

  // Seed the editable recipient form when a different order loads, and
  // close any open editor so it never shows one order's data over
  // another's.
  useEffect(() => {
    if (!orderQ.data) return;
    setRecipientForm({
      recipientName: orderQ.data.recipientName ?? "",
      recipientPhone: orderQ.data.recipientPhone ?? "",
      recipientEmail: orderQ.data.recipientEmail ?? "",
      shipAddressLine1: orderQ.data.shipAddressLine1 ?? "",
      shipAddressLine2: orderQ.data.shipAddressLine2 ?? "",
      shipCity: orderQ.data.shipCity ?? "",
      shipState: orderQ.data.shipState ?? "",
      shipPostalCode: orderQ.data.shipPostalCode ?? "",
      shipCountry: orderQ.data.shipCountry === "CA" ? "CA" : "US",
    });
    setEditingRecipient(false);
    setRecipientErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderQ.data?.id]);

  // "Send back to pack queue" — regresses the order to PENDING_PACKING
  // so the operator can re-pack it with the full toolset on /admin/pack
  // (packaging presets, carrier templates, barcode scan). Replaces the
  // old restrictive inline dims/weight editor. On success we navigate
  // straight to the pack queue so the operator can pick the order up.
  const sendBackMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No order selected.");
      return api.post<{ orderId: string; status: string }>(
        `/admin/pack/${selectedId}/send-to-pack-queue`,
        {},
      );
    },
    onMutate: () => clear(),
    onSuccess: async () => {
      // Order left the rate queue for the pack queue — refresh both,
      // then send the operator to the full pack flow.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "pack", "rate-queue"] }),
        qc.invalidateQueries({ queryKey: ["admin", "pack", "queue"] }),
      ]);
      router.push("/admin/pack");
    },
    onError: (err) => handle(err),
  });

  const fetchMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No order selected.");
      // Send the operator's add-on choices so signature is priced into the
      // rates and insurance is stored for the label purchase.
      const body = addons
        ? {
            insuranceRequested: addons.insuranceRequested,
            signatureRequired: addons.signatureRequired || addons.adultSignatureRequired,
            adultSignatureRequired: addons.adultSignatureRequired,
            containsAlcohol: addons.containsAlcohol,
            alcoholRecipientType: addons.alcoholRecipientType,
            containsDryIce: addons.containsDryIce,
            dryIceWeightOz: addons.containsDryIce ? addons.dryIceWeightOz ?? 0 : null,
            containsLithium: addons.containsLithium,
          }
        : {};
      return api.post<{ orderId: string; status: string; options: RateOption[] }>(
        `/admin/pack/${selectedId}/fetch-rates`,
        body,
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

  // Live re-price: when the operator changes an add-on, re-fetch rates after
  // a short debounce so the carrier prices update automatically (extras like
  // signature / alcohol / dry ice affect the rate). We compare against the
  // last-fetched signature so this never fires on the initial seed or loops
  // after a fetch. Dry-ice weight is only meaningful when the box is ticked.
  useEffect(() => {
    if (!addons || !selectedId || addonSigRef.current === null) return;
    const sig = JSON.stringify(addons);
    if (sig === addonSigRef.current) return;
    const t = window.setTimeout(() => {
      addonSigRef.current = sig; // new baseline — prevents a re-trigger loop
      fetchMut.mutate();
    }, 650);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addons, selectedId]);

  // Save recipient edits → server drops the cached rates → re-fetch so
  // the operator picks from fresh rates priced against the corrected
  // destination. Client-side validation first so a bad phone/postal is
  // caught inline before the round-trip.
  const editRecipientMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No order selected.");
      if (!recipientForm) throw new Error("Recipient form not ready.");
      const parsed = recipientAddressSchema.safeParse({
        recipientName: recipientForm.recipientName,
        recipientPhone: recipientForm.recipientPhone,
        recipientEmail: recipientForm.recipientEmail || undefined,
        shipAddressLine1: recipientForm.shipAddressLine1,
        shipAddressLine2: recipientForm.shipAddressLine2 || undefined,
        shipCity: recipientForm.shipCity,
        shipState: recipientForm.shipState,
        shipPostalCode: recipientForm.shipPostalCode,
        shipCountry: recipientForm.shipCountry,
      });
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".") || "_";
          if (!errs[key]) errs[key] = issue.message;
        }
        setRecipientErrors(errs);
        throw new Error("Fix the highlighted recipient fields.");
      }
      setRecipientErrors({});
      return api.patch<{ id: string; status: string; ratesCleared: boolean }>(
        `/admin/orders/${selectedId}/recipient`,
        parsed.data,
      );
    },
    onMutate: () => {
      clear();
      setLastResult(null);
    },
    onSuccess: async () => {
      setEditingRecipient(false);
      setPickedRef(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "pack", "order-detail", selectedId] }),
        qc.invalidateQueries({ queryKey: ["admin", "pack", "rate-options", selectedId] }),
        qc.invalidateQueries({ queryKey: ["admin", "pack", "rate-queue"] }),
      ]);
      // Re-price against the corrected destination straight away.
      fetchMut.mutate();
    },
    onError: (err) => {
      // Client-side validation errors are surfaced inline (recipientErrors);
      // don't also throw them into the page banner.
      if (err instanceof Error && err.message.startsWith("Fix the highlighted")) return;
      handle(err);
    },
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
      if (data.outcome === "LABEL_PURCHASED") {
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
                    onClick={() => sendBackMut.mutate()}
                    loading={sendBackMut.isPending}
                    disabled={sendBackMut.isPending}
                    title="Move this order back to the pack queue to re-pack it with the full toolset (packaging, carrier template, barcode scan)."
                  >
                    Send back to pack queue
                  </Button>
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

              {/* Pack details + recipient summary. Read-only by default;
                  "Edit recipient" opens an inline form to correct the
                  name / phone / email / address when a carrier refuses
                  the shipment over the recipient details. Saving clears
                  the cached rates server-side and auto re-fetches. */}
              {orderQ.data ? (
                <div className="mt-4 rounded-md border border-line bg-cream-soft p-3 text-body-sm">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                      Order details
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        clear();
                        setRecipientErrors({});
                        setEditingRecipient((v) => !v);
                      }}
                      disabled={editRecipientMut.isPending}
                    >
                      {editingRecipient ? "Cancel edit" : "Edit recipient"}
                    </Button>
                  </div>
                  {!orderQ.data.recipientPhone && !editingRecipient ? (
                    <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-body-xs text-amber-900">
                      No recipient phone on this order. UPS, FedEx and every
                      Canada shipment are refused without one — add it via
                      &ldquo;Edit recipient&rdquo; before fetching rates.
                    </div>
                  ) : null}
                  <div className="grid gap-x-4 gap-y-1 md:grid-cols-2">
                    <div>
                      <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                        Ship to
                      </span>{" "}
                      {orderQ.data.recipientName} · {orderQ.data.shipAddressLine1}
                      {orderQ.data.shipAddressLine2
                        ? `, ${orderQ.data.shipAddressLine2}`
                        : ""}
                      , {orderQ.data.shipCity} {orderQ.data.shipState}{" "}
                      {orderQ.data.shipPostalCode}
                      {" · "}
                      {orderQ.data.recipientPhone ?? "no phone"}
                      {orderQ.data.recipientEmail
                        ? ` · ${orderQ.data.recipientEmail}`
                        : ""}
                    </div>
                    <div>
                      <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                        Packaging
                      </span>{" "}
                      {orderQ.data.packagingLabel ?? "Custom (no preset)"}
                    </div>
                    {orderQ.data.packedLengthIn !== null &&
                    orderQ.data.packedWidthIn !== null &&
                    orderQ.data.packedHeightIn !== null ? (
                      <div>
                        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                          Box
                        </span>{" "}
                        {orderQ.data.packedLengthIn} ×{" "}
                        {orderQ.data.packedWidthIn} ×{" "}
                        {orderQ.data.packedHeightIn} in
                      </div>
                    ) : null}
                    {orderQ.data.packedWeightOz !== null ? (
                      <div>
                        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                          Weight
                        </span>{" "}
                        {orderQ.data.packedWeightOz} oz
                      </div>
                    ) : null}
                    {orderQ.data.packingNotes ? (
                      <div className="md:col-span-2">
                        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                          Notes
                        </span>{" "}
                        {orderQ.data.packingNotes}
                      </div>
                    ) : null}
                    {orderQ.data.shipCountry && orderQ.data.shipCountry !== "US" ? (
                      <div className="md:col-span-2">
                        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                          Destination
                        </span>{" "}
                        International ({orderQ.data.shipCountry}) — a customs
                        declaration is attached automatically from the order
                        lines.
                      </div>
                    ) : null}
                  </div>

                  {editingRecipient && recipientForm ? (
                    <form
                      className="mt-3 border-t border-line pt-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        editRecipientMut.mutate();
                      }}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Recipient name" error={recipientErrors.recipientName}>
                          <Input
                            value={recipientForm.recipientName}
                            invalid={!!recipientErrors.recipientName}
                            onChange={(e) =>
                              setRecipientForm((f) => (f ? { ...f, recipientName: e.target.value } : f))
                            }
                          />
                        </Field>
                        <Field
                          label="Phone (required)"
                          error={recipientErrors.recipientPhone}
                          hint="10-digit US/Canada number — the carrier refuses the shipment without it."
                        >
                          <Input
                            type="tel"
                            value={recipientForm.recipientPhone}
                            invalid={!!recipientErrors.recipientPhone}
                            onChange={(e) =>
                              setRecipientForm((f) => (f ? { ...f, recipientPhone: e.target.value } : f))
                            }
                          />
                        </Field>
                        <Field label="Email (optional)" error={recipientErrors.recipientEmail}>
                          <Input
                            type="email"
                            value={recipientForm.recipientEmail}
                            invalid={!!recipientErrors.recipientEmail}
                            onChange={(e) =>
                              setRecipientForm((f) => (f ? { ...f, recipientEmail: e.target.value } : f))
                            }
                          />
                        </Field>
                        <Field label="Country" error={recipientErrors.shipCountry}>
                          <select
                            aria-label="Ship country"
                            value={recipientForm.shipCountry}
                            onChange={(e) =>
                              setRecipientForm((f) =>
                                f ? { ...f, shipCountry: e.target.value === "CA" ? "CA" : "US" } : f,
                              )
                            }
                            className="h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text"
                          >
                            <option value="US">United States</option>
                            <option value="CA">Canada</option>
                          </select>
                        </Field>
                        <Field
                          label="Address line 1"
                          error={recipientErrors.shipAddressLine1}
                          className="md:col-span-2"
                        >
                          <Input
                            value={recipientForm.shipAddressLine1}
                            invalid={!!recipientErrors.shipAddressLine1}
                            onChange={(e) =>
                              setRecipientForm((f) => (f ? { ...f, shipAddressLine1: e.target.value } : f))
                            }
                          />
                        </Field>
                        <Field
                          label="Address line 2 (optional)"
                          error={recipientErrors.shipAddressLine2}
                          className="md:col-span-2"
                        >
                          <Input
                            value={recipientForm.shipAddressLine2}
                            invalid={!!recipientErrors.shipAddressLine2}
                            onChange={(e) =>
                              setRecipientForm((f) => (f ? { ...f, shipAddressLine2: e.target.value } : f))
                            }
                          />
                        </Field>
                        <Field label="City" error={recipientErrors.shipCity}>
                          <Input
                            value={recipientForm.shipCity}
                            invalid={!!recipientErrors.shipCity}
                            onChange={(e) =>
                              setRecipientForm((f) => (f ? { ...f, shipCity: e.target.value } : f))
                            }
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field
                            label={recipientForm.shipCountry === "CA" ? "Province" : "State"}
                            error={recipientErrors.shipState}
                          >
                            <Input
                              value={recipientForm.shipState}
                              invalid={!!recipientErrors.shipState}
                              maxLength={2}
                              onChange={(e) =>
                                setRecipientForm((f) =>
                                  f ? { ...f, shipState: e.target.value.toUpperCase() } : f,
                                )
                              }
                            />
                          </Field>
                          <Field label="Postal code" error={recipientErrors.shipPostalCode}>
                            <Input
                              value={recipientForm.shipPostalCode}
                              invalid={!!recipientErrors.shipPostalCode}
                              onChange={(e) =>
                                setRecipientForm((f) =>
                                  f ? { ...f, shipPostalCode: e.target.value.toUpperCase() } : f,
                                )
                              }
                            />
                          </Field>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-body-xs text-text-muted">
                          Saving clears the cached rates and re-prices against the
                          corrected address.
                        </span>
                        <Button
                          type="submit"
                          variant="amber"
                          size="sm"
                          loading={editRecipientMut.isPending}
                          disabled={editRecipientMut.isPending}
                        >
                          Save &amp; re-fetch rates
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {/* Migration 0055 — label add-ons. Seeded from the vendor's
                  request; the operator can add or remove them here. Insurance
                  is applied at purchase (for the declared value); signature
                  is priced into the rate, so changing it takes effect on the
                  next Fetch/Refresh rates. */}
              {orderQ.data && addons ? (
                <div className="mt-4 rounded-md border-l-4 border-ink bg-cream-soft p-3 text-body-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                      Label add-ons
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-subtle">
                      vendor requested:{" "}
                      {[
                        orderQ.data.insuranceRequested ? "insurance" : null,
                        orderQ.data.adultSignatureRequired
                          ? "adult sig"
                          : orderQ.data.signatureRequired
                            ? "signature"
                            : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "none"}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={addons.insuranceRequested}
                        onChange={(e) =>
                          setAddons((a) => (a ? { ...a, insuranceRequested: e.target.checked } : a))
                        }
                      />
                      <span>
                        Insurance for the declared value (
                        {dollars(orderQ.data.itemsDeclaredValueCents)}) — applied at purchase.
                      </span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={addons.signatureRequired || addons.adultSignatureRequired}
                        onChange={(e) =>
                          setAddons((a) =>
                            a
                              ? {
                                  ...a,
                                  signatureRequired: e.target.checked,
                                  adultSignatureRequired: e.target.checked
                                    ? a.adultSignatureRequired
                                    : false,
                                }
                              : a,
                          )
                        }
                      />
                      <span>Signature on delivery.</span>
                    </label>
                    <label
                      className={
                        "flex items-start gap-2 " +
                        (addons.signatureRequired || addons.adultSignatureRequired
                          ? ""
                          : "opacity-50")
                      }
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        disabled={!(addons.signatureRequired || addons.adultSignatureRequired)}
                        checked={addons.adultSignatureRequired}
                        onChange={(e) =>
                          setAddons((a) => (a ? { ...a, adultSignatureRequired: e.target.checked } : a))
                        }
                      />
                      <span>Adult signature (21+) — requires signature.</span>
                    </label>

                    {/* Alcohol */}
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={addons.containsAlcohol}
                        onChange={(e) =>
                          setAddons((a) => (a ? { ...a, containsAlcohol: e.target.checked } : a))
                        }
                      />
                      <span>Contains alcohol.</span>
                    </label>
                    {addons.containsAlcohol ? (
                      <div className="ml-6">
                        <select
                          aria-label="Alcohol recipient type"
                          value={addons.alcoholRecipientType}
                          onChange={(e) =>
                            setAddons((a) =>
                              a
                                ? { ...a, alcoholRecipientType: e.target.value === "licensee" ? "licensee" : "consumer" }
                                : a,
                            )
                          }
                          className="h-9 rounded-md border border-line bg-white px-2 text-body-sm"
                        >
                          <option value="consumer">Consumer (DTC)</option>
                          <option value="licensee">Licensee (reseller)</option>
                        </select>
                      </div>
                    ) : null}

                    {/* Dry ice */}
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={addons.containsDryIce}
                        onChange={(e) =>
                          setAddons((a) => (a ? { ...a, containsDryIce: e.target.checked } : a))
                        }
                      />
                      <span>Contains dry ice.</span>
                    </label>
                    {addons.containsDryIce ? (
                      <div className="ml-6 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          placeholder="Dry ice weight"
                          value={addons.dryIceWeightOz ?? ""}
                          onChange={(e) =>
                            setAddons((a) =>
                              a
                                ? {
                                    ...a,
                                    dryIceWeightOz:
                                      e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value) || 0)),
                                  }
                                : a,
                            )
                          }
                          className="h-9 w-32 rounded-md border border-line bg-white px-2 text-body-sm"
                        />
                        <span className="text-text-muted">oz</span>
                      </div>
                    ) : null}

                    {/* Lithium batteries */}
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={addons.containsLithium}
                        onChange={(e) =>
                          setAddons((a) => (a ? { ...a, containsLithium: e.target.checked } : a))
                        }
                      />
                      <span>Contains lithium batteries.</span>
                    </label>
                  </div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[1.2px] text-text-subtle">
                    {fetchMut.isPending
                      ? "Re-pricing against the carriers…"
                      : "Changing an add-on re-prices the rates automatically."}
                  </div>
                </div>
              ) : null}

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
                    lastResult.outcome === "LABEL_PURCHASED"
                      ? "mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-body-sm text-green-800"
                      : "mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-body-sm text-amber-900"
                  }
                >
                  {lastResult.outcome === "LABEL_PURCHASED" ? (
                    <>
                      <div className="font-semibold">Label purchased</div>
                      <p className="mt-1">
                        Charged {dollars(lastResult.shippingCostCents)} for{" "}
                        {lastResult.carrier} {lastResult.service}. Vendor
                        balance is now {dollars(lastResult.balanceAfterCents)}.
                        Tracking:{" "}
                        <span className="font-mono">
                          {lastResult.trackingNumber}
                        </span>
                        .{" "}
                        <a
                          href={lastResult.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Open label →
                        </a>
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
