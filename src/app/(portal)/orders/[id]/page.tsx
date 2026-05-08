"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import { ORDER_CANCEL_REASON, type OrderStatus, type PublicOrder } from "@/lib/schemas/orders";

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

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "retry") void cancelMut.mutate();
    else if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
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
        actions={
          <button
            type="button"
            onClick={() => router.push("/orders")}
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back
          </button>
        }
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
