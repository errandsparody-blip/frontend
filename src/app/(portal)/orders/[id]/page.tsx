"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { AttachmentUploader } from "@/components/portal/attachment-uploader";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import { ORDER_CANCEL_REASON, type OrderStatus, type PublicOrder } from "@/lib/schemas/orders";
import {
  RETURN_REASON,
  RETURN_REASON_LABEL,
  type CreateReturnInput,
  type ReturnReason,
  type ReturnSnapshot,
} from "@/lib/schemas/returns";

const TONE: Record<OrderStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  ALLOCATED: "info",
  LABEL_PURCHASED: "info",
  PICKING: "warning",
  PACKED: "warning",
  SHIPPED: "info",
  IN_TRANSIT: "info",
  DELIVERED: "success",
  EXCEPTION: "error",
  CANCELLED: "error",
  RETURNED: "warning",
};

const CANCELLABLE: OrderStatus[] = ["DRAFT", "SUBMITTED", "ALLOCATED"];
// Server-side rule (return.service.ts:68): an RMA can only be opened
// against orders the carrier has confirmed as DELIVERED, or that hit
// EXCEPTION (delivery problem). Anything earlier in the lifecycle goes
// through cancel-order, not return.
const RETURNABLE: OrderStatus[] = ["DELIVERED", "EXCEPTION"];

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const orderQ = useQuery({
    queryKey: ["orders", params.id],
    queryFn: () => api.get<PublicOrder>(`/orders/${params.id}`),
    enabled: !!params.id,
  });

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState<(typeof ORDER_CANCEL_REASON)[number]>("VENDOR_REQUEST");
  const [cancelNote, setCancelNote] = useState("");

  // Request-return state. The form lets vendors pick which lines + how
  // many units to return. Defaults to 0 per line so they have to opt-in
  // to each one — easier than having to remove unwanted lines.
  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState<ReturnReason>("DEFECTIVE");
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  // Migration 0018 — vendor-supplied photo evidence at RMA-creation
  // time. Up to 5 R2 URLs from the AttachmentUploader.
  const [returnAttachments, setReturnAttachments] = useState<string[]>([]);

  const { bannerError, handle, clear } = useApiErrorHandler();

  const cancelMut = useMutation({
    mutationFn: () =>
      api.post<PublicOrder>(`/orders/${params.id}/cancel`, {
        reason: cancelReason,
        note: cancelNote.trim() || undefined,
      }),
    onMutate: clear,
    onSuccess: async () => {
      setShowCancel(false);
      setCancelNote("");
      await qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err) => handle(err),
  });

  /**
   * Open an RMA. Builds the body from the per-line qty map (lines with
   * 0 are excluded so the user-facing "I want 2 of A, none of B" maps
   * to the wire shape directly). On success, navigates to the new
   * return's detail page so the vendor sees the inbound label as soon
   * as EasyPost returns.
   */
  const returnMut = useMutation({
    mutationFn: (body: CreateReturnInput) => api.post<ReturnSnapshot>("/returns", body),
    onMutate: clear,
    onSuccess: async (created) => {
      setShowReturn(false);
      setReturnQty({});
      setReturnAttachments([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders"] }),
        qc.invalidateQueries({ queryKey: ["returns"] }),
      ]);
      router.push(`/returns/${created.id}`);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "retry") void cancelMut.mutate();
    else if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  if (orderQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (orderQ.error || !orderQ.data) {
    const normalized = orderQ.error ? normalizeError(orderQ.error) : null;
    return (
      <div
        role="alert"
        className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
      >
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "Order not found"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "The order may have been deleted or you do not have access to it."}
        </p>
        {normalized?.correlationId ? (
          <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            Reference: {normalized.correlationId.slice(0, 16)}
          </div>
        ) : null}
      </div>
    );
  }
  const o = orderQ.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`[05] Orders / ${o.id.slice(0, 8)}`}
        title={o.externalReference ?? `Order ${o.id.slice(0, 8)}`}
        description="Status, line items, money breakdown, and timeline."
        actions={<BackButton fallback="/orders" />}
      />

      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <StatusPill tone={TONE[o.status]}>{o.status.replace(/_/g, " ")}</StatusPill>
          {o.carrierService ? (
            <span className="font-mono text-body-sm text-text-muted">{o.carrierService}</span>
          ) : null}
          {o.trackingNumber ? (
            <span className="font-mono text-body-sm text-text">
              Tracking: {o.trackingNumber}
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Ship to</div>
            <div className="mt-1 text-body text-text">{o.recipient.name}</div>
            <div className="font-mono text-body-sm text-text-muted">
              {o.recipient.line1}
              {o.recipient.line2 ? ` · ${o.recipient.line2}` : ""}
              <br />
              {o.recipient.city}, {o.recipient.state} {o.recipient.postalCode} · {o.recipient.country}
            </div>
          </div>
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Money</div>
            <dl className="mt-1 grid grid-cols-2 gap-y-1 font-mono text-body-sm">
              <dt className="text-text-muted">Shipping</dt>
              <dd className="text-right text-text">{formatCents(o.shippingFeeCents)}</dd>
              <dt className="text-text-muted">Fulfillment</dt>
              <dd className="text-right text-text">{formatCents(o.fulfillmentFeeCents)}</dd>
              <dt className="text-text-muted">Insurance</dt>
              <dd className="text-right text-text">{formatCents(o.insuranceFeeCents)}</dd>
              {o.reassessmentDeltaCents !== 0 ? (
                <>
                  <dt className="text-text-muted">Reassessment</dt>
                  <dd className="text-right text-text">
                    {o.reassessmentDeltaCents > 0 ? "+" : ""}
                    {formatCents(o.reassessmentDeltaCents)}
                  </dd>
                </>
              ) : null}
              <dt className="text-h3 font-semibold text-ink">Total charged</dt>
              <dd className="text-right text-h3 font-semibold text-ink">
                {formatCents(o.totalChargedCents)}
              </dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Lines</h2>
        <div className="mt-3">
          <DataTable>
            <THead>
              <Th>SKU</Th>
              <Th>Product</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Declared value</Th>
              <Th>Allocation</Th>
            </THead>
            <TBody>
              {o.lines.map((l) => (
                <TR key={l.id}>
                  <Td mono>{l.skuId}</Td>
                  <Td>
                    {l.productName} <span className="text-text-muted">({l.variant})</span>
                  </Td>
                  <Td num>{l.quantity}</Td>
                  <Td num>{formatCents(l.declaredValueCents)}</Td>
                  <Td mono className="text-text-muted">
                    {l.allocationStatus}
                  </Td>
                </TR>
              ))}
            </TBody>
          </DataTable>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Timeline</h2>
        <ul className="mt-3 space-y-2 font-mono text-body-sm">
          {o.submittedAt ? (
            <Event when={o.submittedAt} label="Submitted" />
          ) : null}
          {o.allocatedAt ? <Event when={o.allocatedAt} label="Stock reserved" /> : null}
          {o.shippedAt ? <Event when={o.shippedAt} label="Shipped" /> : null}
          {o.deliveredAt ? <Event when={o.deliveredAt} label="Delivered" /> : null}
          {o.cancelledAt ? (
            <Event when={o.cancelledAt} label={`Cancelled: ${o.cancelReason ?? ""}${o.cancelNote ? ` (${o.cancelNote})` : ""}`} tone="error" />
          ) : null}
        </ul>
      </section>

      {/* Request return — only when order has been delivered (or hit
          an exception) AND inside the configurable return window.
          Server enforces both rules too; the UI hide-when-not-eligible
          is just to keep the surface clean. */}
      {RETURNABLE.includes(o.status) ? (() => {
        const windowExpired =
          o.returnableUntil != null && new Date(o.returnableUntil).getTime() < Date.now();
        const daysLeft = o.returnableUntil
          ? Math.max(
              0,
              Math.ceil((new Date(o.returnableUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            )
          : null;
        // Live refund preview · sum of (returnQty × unit price) where
        // unit price = declaredValueCents / quantity. Mirrors the
        // backend's potentialRefundCents math exactly.
        const livePreviewCents = o.lines.reduce((sum, ln) => {
          const qty = returnQty[ln.id] ?? 0;
          if (qty <= 0 || ln.quantity <= 0) return sum;
          const unitCents = Math.floor(ln.declaredValueCents / ln.quantity);
          return sum + unitCents * qty;
        }, 0);
        return (
        <section className="rounded-md border border-line bg-white p-6">
          {windowExpired ? (
            <div>
              <h2 className="font-mono text-mono-label uppercase text-text-muted">
                Request a return
              </h2>
              <p className="mt-1 text-body-sm text-text-muted">
                Returns can&apos;t be opened — this order&apos;s return window expired on{" "}
                {new Date(o.returnableUntil!).toLocaleDateString()}. Contact support if there&apos;s an
                exceptional reason this needs to be reopened.
              </p>
            </div>
          ) : !showReturn ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-mono-label uppercase text-text-muted">
                  Request a return
                </h2>
                <p className="mt-1 text-body-sm text-text-muted">
                  We&apos;ll generate a prepaid inbound label and email it to the customer.
                  Inspection happens at our warehouse — your wallet is credited automatically.
                  {daysLeft != null ? (
                    <span className="ml-1 font-medium text-ink">
                      {daysLeft} day{daysLeft === 1 ? "" : "s"} left in window.
                    </span>
                  ) : null}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  // Pre-seed the qty map with 0 for every line so the
                  // controlled inputs render correctly on first paint.
                  const seed: Record<string, number> = {};
                  for (const ln of o.lines) seed[ln.id] = 0;
                  setReturnQty(seed);
                  setReturnAttachments([]);
                  setShowReturn(true);
                }}
              >
                Request return
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <h2 className="text-h3 font-semibold text-ink">Request return</h2>

              <Field label="Reason">
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value as ReturnReason)}
                  className="h-11 w-full rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
                >
                  {RETURN_REASON.map((r) => (
                    <option key={r} value={r}>
                      {RETURN_REASON_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>

              <div>
                <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                  Pick lines
                </div>
                <p className="mb-3 text-body-sm text-text-muted">
                  Set the quantity to return for each line. Leave at 0 to skip a line. You can
                  return at most the quantity that was originally ordered.
                </p>
                <DataTable>
                  <THead>
                    <Th>SKU</Th>
                    <Th>Product</Th>
                    <Th align="right">Ordered</Th>
                    <Th align="right">Return qty</Th>
                  </THead>
                  <TBody>
                    {o.lines.map((l) => (
                      <TR key={l.id}>
                        <Td mono>{l.skuId}</Td>
                        <Td>
                          {l.productName}{" "}
                          <span className="text-text-muted">({l.variant})</span>
                        </Td>
                        <Td num>{l.quantity}</Td>
                        <Td align="right">
                          <Input
                            type="number"
                            min={0}
                            max={l.quantity}
                            step={1}
                            value={String(returnQty[l.id] ?? 0)}
                            onChange={(e) => {
                              const n = Math.max(
                                0,
                                Math.min(l.quantity, Math.floor(Number(e.target.value) || 0)),
                              );
                              setReturnQty((prev) => ({ ...prev, [l.id]: n }));
                            }}
                            className="ml-auto h-9 w-24 text-right"
                          />
                        </Td>
                      </TR>
                    ))}
                  </TBody>
                </DataTable>
              </div>

              {/* Photo evidence — optional but strongly recommended for
                  defective / damaged claims. Up to 5 attachments, R2-
                  hosted public URLs. The same uploader is used in the
                  shopper thread; this presigns against /returns/uploads. */}
              <div>
                <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                  Photo evidence (optional)
                </div>
                <p className="mb-3 text-body-sm text-text-muted">
                  Attach up to 5 photos or receipts. Our inspector reviews these alongside the
                  inbound box, so claims like &quot;arrived damaged&quot; or &quot;defective&quot; are settled
                  faster.
                </p>
                <AttachmentUploader
                  value={returnAttachments}
                  onChange={setReturnAttachments}
                  presignEndpoint="/returns/uploads"
                  disabled={returnMut.isPending}
                />
              </div>

              <ErrorBanner
                error={bannerError}
                onAction={(handler) => {
                  if (handler === "support") {
                    window.location.href = "mailto:support@myusaerrands.com";
                  }
                }}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-mono text-body-sm text-text-muted">
                    {Object.values(returnQty).reduce((sum, n) => sum + n, 0)} unit(s) across{" "}
                    {Object.values(returnQty).filter((n) => n > 0).length} line(s)
                  </span>
                  <span className="font-mono text-body-sm text-ink">
                    Potential refund:{" "}
                    <span className="font-semibold">{formatCents(livePreviewCents)}</span>
                    <span className="ml-1 text-text-muted">(subject to inspection)</span>
                  </span>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowReturn(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="amber"
                    loading={returnMut.isPending}
                    disabled={
                      returnMut.isPending ||
                      Object.values(returnQty).every((n) => !n || n <= 0)
                    }
                    onClick={() => {
                      const lines = o.lines
                        .map((l) => ({
                          orderLineId: l.id,
                          requestedQty: returnQty[l.id] ?? 0,
                        }))
                        .filter((line) => line.requestedQty > 0);
                      if (lines.length === 0) return;
                      returnMut.mutate({
                        orderId: o.id,
                        reason: returnReason,
                        lines,
                        attachmentUrls: returnAttachments,
                      });
                    }}
                  >
                    {returnMut.isPending ? "Opening RMA…" : "Open return"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
        );
      })() : null}

      {CANCELLABLE.includes(o.status) ? (
        <section className="rounded-md border border-line bg-white p-6">
          {!showCancel ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-mono-label uppercase text-text-muted">Cancel order</h2>
                <p className="mt-1 text-body-sm text-text-muted">
                  Releases the reservation and refunds {formatCents(o.totalChargedCents)} to your wallet.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setShowCancel(true)}>
                Cancel order
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="text-h3 font-semibold text-ink">Cancel this order</h2>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value as typeof cancelReason)}
                className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
              >
                {ORDER_CANCEL_REASON.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                placeholder="Optional note (max 500 chars)"
                maxLength={500}
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                className="rounded-sm border border-line-strong bg-white p-3 font-sans text-body text-text outline-none focus:border-ink"
              />
              <ErrorBanner error={bannerError} onAction={onAction} />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowCancel(false)}>
                  Keep order
                </Button>
                <Button variant="amber" loading={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                  {cancelMut.isPending ? "Cancelling…" : "Confirm cancel"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Event({
  when,
  label,
  tone = "neutral",
}: {
  when: string;
  label: string;
  tone?: "neutral" | "error";
}): JSX.Element {
  return (
    <li className="flex items-baseline gap-3">
      <span className="text-text-subtle">{new Date(when).toLocaleString()}</span>
      <span className={tone === "error" ? "text-error" : "text-text"}>· {label}</span>
    </li>
  );
}
