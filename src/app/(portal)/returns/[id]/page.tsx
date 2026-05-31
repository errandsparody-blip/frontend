"use client";

/**
 * Vendor return detail — the drill-in for a single RMA.
 *
 * Shows everything the vendor needs to know about an inbound return:
 *
 *   - Header: RMA code, status pill, reason
 *   - Inbound: carrier + tracking number + downloadable shipping label
 *     (this is the prepaid label we email the customer; vendor may want
 *     to print it from here for their records)
 *   - Lines: per-SKU breakdown — requested vs received vs restocked
 *     vs damaged vs disposed. Once admin inspects, the vendor sees
 *     exactly what came back vs what the customer claimed.
 *   - Refund summary: gross refund − restock fee = net wallet credit,
 *     using the same math the backend uses (lib/schemas/returns.ts).
 *   - Timeline: created → authorized → received → inspected → resolved.
 *   - Cancel: only when status is REQUESTED or AUTHORIZED. Same allow-
 *     list the backend service enforces.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import {
  CANCELLABLE_RETURN_STATUSES,
  netRefundCents,
  RETURN_REASON_LABEL,
  type ReturnSnapshot,
  type ReturnStatus,
} from "@/lib/schemas/returns";

const TONE: Record<ReturnStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  REQUESTED: "neutral",
  AUTHORIZED: "info",
  IN_TRANSIT: "info",
  RECEIVED: "warning",
  INSPECTED: "warning",
  RESTOCKED: "success",
  DISPOSED: "error",
  REJECTED: "error",
  CANCELLED: "error",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function VendorReturnDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();

  const returnQ = useQuery({
    queryKey: ["returns", params.id],
    queryFn: () => api.get<ReturnSnapshot>(`/returns/${params.id}`),
    enabled: !!params.id,
  });

  const [showCancel, setShowCancel] = useState(false);
  const { bannerError, handle, clear } = useApiErrorHandler();

  const cancelMut = useMutation({
    mutationFn: () => api.post<ReturnSnapshot>(`/returns/${params.id}/cancel`),
    onMutate: clear,
    onSuccess: async () => {
      setShowCancel(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["returns", params.id] }),
        qc.invalidateQueries({ queryKey: ["returns"] }),
      ]);
    },
    onError: (err) => handle(err),
  });

  if (returnQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (returnQ.error || !returnQ.data) {
    const normalized = returnQ.error ? normalizeError(returnQ.error) : null;
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "Return not found"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ??
            "This RMA may have been deleted, or you do not have access to it."}
        </p>
        {normalized?.correlationId ? (
          <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            Reference: {normalized.correlationId.slice(0, 16)}
          </div>
        ) : null}
      </div>
    );
  }

  const r = returnQ.data;
  const isCancellable = CANCELLABLE_RETURN_STATUSES.includes(r.status);
  const net = netRefundCents(r);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`  Returns / ${r.rmaCode}`}
        title={r.rmaCode}
        description={`RMA against order ${r.orderId.slice(0, 8)} — reason: ${RETURN_REASON_LABEL[r.reason]}.`}
        actions={<BackButton fallback="/returns" />}
      />

      {/* Status + headline numbers */}
      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <StatusPill tone={TONE[r.status]}>{r.status.replace(/_/g, " ")}</StatusPill>
          <span className="font-mono text-body-sm text-text-muted">
            Opened {new Date(r.createdAt).toLocaleString()}
          </span>
          {r.resolvedAt ? (
            <span className="font-mono text-body-sm text-text">
              Resolved {new Date(r.resolvedAt).toLocaleString()}
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Inbound shipment</div>
            {r.inboundCarrier && r.inboundTracking ? (
              <>
                <div className="mt-1 text-body text-text">{r.inboundCarrier}</div>
                <div className="font-mono text-body-sm text-text">{r.inboundTracking}</div>
                {r.inboundLabelUrl ? (
                  <a
                    href={r.inboundLabelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                  >
                    Open shipping label →
                  </a>
                ) : null}
              </>
            ) : (
              <div className="mt-1 text-body-sm text-text-muted">
                Inbound label not yet attached. We&apos;ll generate one shortly — refresh in a minute or two.
              </div>
            )}
          </div>

          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Refund summary</div>
            <dl className="mt-1 grid grid-cols-2 gap-y-1 font-mono text-body-sm">
              <dt className="text-text-muted">Refund (gross)</dt>
              <dd className="text-right text-text">{formatCents(r.refundAmountCents)}</dd>
              <dt className="text-text-muted">Restock fee</dt>
              <dd className="text-right text-text">−{formatCents(r.restockFeeCents)}</dd>
              <dt className="text-h3 font-semibold text-ink">Net to wallet</dt>
              <dd className="text-right text-h3 font-semibold text-ink">{formatCents(net)}</dd>
            </dl>
            {r.status !== "RESTOCKED" && r.status !== "DISPOSED" && r.status !== "REJECTED" ? (
              <>
                <p className="mt-2 text-body-sm text-text-muted">
                  Final amount confirmed after our warehouse team inspects the inbound box.
                </p>
                {r.potentialRefundCents != null && r.potentialRefundCents > 0 ? (
                  <div className="mt-3 rounded-sm border border-amber/40 bg-amber/5 px-3 py-2 font-mono text-body-sm">
                    <span className="text-text-muted">Potential refund:</span>{" "}
                    <span className="font-semibold text-ink">
                      {formatCents(r.potentialRefundCents)}
                    </span>
                    <span className="ml-1 text-text-muted">(if everything restocks at full value)</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </section>

      {/* Attached photo evidence (Migration 0018). Only renders when
          the vendor uploaded something at RMA-creation. Each thumbnail
          opens the original in a new tab. */}
      {r.attachmentUrls.length > 0 ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="font-mono text-mono-label uppercase text-text-muted">
            Photo evidence
          </h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Attached when this RMA was opened. Inspector will review these alongside the inbound box.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {r.attachmentUrls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square overflow-hidden rounded-sm border border-line bg-cream-soft hover:border-ink"
                  title={url}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="RMA evidence"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Per-line breakdown */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Lines</h2>
        <p className="mt-1 text-body-sm text-text-muted">
          Requested by you · Received at the warehouse · Restocked / Damaged / Disposed after inspection.
        </p>
        <div className="mt-3">
          <DataTable>
            <THead>
              <Th>SKU</Th>
              <Th align="right">Requested</Th>
              <Th align="right">Received</Th>
              <Th align="right">Restocked</Th>
              <Th align="right">Damaged</Th>
              <Th align="right">Disposed</Th>
              <Th>Notes</Th>
            </THead>
            <TBody>
              {r.lines.map((l) => (
                <TR key={l.id}>
                  <Td mono>{l.skuId}</Td>
                  <Td num>{l.requestedQty}</Td>
                  <Td num>{l.receivedQty}</Td>
                  <Td num>{l.restockedQty}</Td>
                  <Td num>{l.damagedQty}</Td>
                  <Td num>{l.disposedQty}</Td>
                  <Td className="text-text-muted">{l.notes ?? "—"}</Td>
                </TR>
              ))}
            </TBody>
          </DataTable>
        </div>
      </section>

      {/* Timeline */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Timeline</h2>
        <ul className="mt-3 space-y-2 font-mono text-body-sm">
          <Event when={r.createdAt} label="RMA opened" />
          {r.authorizedAt ? <Event when={r.authorizedAt} label="Authorised — inbound label issued" /> : null}
          {r.receivedAt ? <Event when={r.receivedAt} label="Box received at warehouse" /> : null}
          {r.inspectedAt ? <Event when={r.inspectedAt} label="Inspection complete" /> : null}
          {r.resolvedAt ? (
            <Event
              when={r.resolvedAt}
              label={`Resolved — ${r.status.toLowerCase()}`}
              tone={r.status === "RESTOCKED" ? "success" : "neutral"}
            />
          ) : null}
        </ul>
      </section>

      {/* Inspector notes if present (read-only for vendor) */}
      {r.inspectorNotes ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="font-mono text-mono-label uppercase text-text-muted">Inspector notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-body text-text">{r.inspectorNotes}</p>
        </section>
      ) : null}

      {/* Cancel — only allowed pre-receive */}
      {isCancellable ? (
        <section className="rounded-md border border-line bg-white p-6">
          {!showCancel ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-mono-label uppercase text-text-muted">Cancel return</h2>
                <p className="mt-1 text-body-sm text-text-muted">
                  Voids the inbound label and removes this RMA. Only possible before the box reaches
                  our warehouse.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setShowCancel(true)}>
                Cancel return
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="text-h3 font-semibold text-ink">Cancel this RMA?</h2>
              <p className="text-body-sm text-text-muted">
                If the customer has already shipped the box, this cancellation will not stop them — let
                support know if you need to redirect the inbound parcel.
              </p>
              <ErrorBanner
                error={bannerError}
                onAction={(handler) => {
                  if (handler === "retry") void cancelMut.mutate();
                  else if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
                }}
              />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowCancel(false)}>
                  Keep return
                </Button>
                <Button
                  variant="amber"
                  loading={cancelMut.isPending}
                  onClick={() => cancelMut.mutate()}
                >
                  {cancelMut.isPending ? "Cancelling…" : "Confirm cancel"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* Cross-link back to the parent order. Useful for support reps. */}
      <div className="text-body-sm text-text-muted">
        Parent order:{" "}
        <Link href={`/orders/${r.orderId}`} className="text-amber hover:text-amber-hi">
          {r.orderId.slice(0, 8)} →
        </Link>
      </div>
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
  tone?: "neutral" | "success";
}): JSX.Element {
  return (
    <li className="flex items-baseline gap-3">
      <span className="text-text-subtle">{new Date(when).toLocaleString()}</span>
      <span className={tone === "success" ? "text-success" : "text-text"}>· {label}</span>
    </li>
  );
}
