"use client";

/**
 * Vendor return detail — the drill-in for a single RMA (Returns v2).
 *
 *   - Header: RMA code, status pill, reason
 *   - Inbound: the vendor-supplied carrier + tracking + expected delivery
 *     date (the customer ships the return themselves; USA Errands buys no
 *     label).
 *   - Received photos + condition: shared by USA Errands after inspection.
 *   - Instructions: when the return is INSPECTED, the vendor tells us how
 *     to handle each line — restock / dispose / donate.
 *   - Lines: per-SKU requested → received → restocked/disposed/donated.
 *   - Charge: the processing fee (+ handling) charged at finalize. There
 *     is no refund.
 *   - Timeline + cancel (pre-receive only).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import {
  CANCELLABLE_RETURN_STATUSES,
  returnChargeCents,
  RETURN_REASON_LABEL,
  RETURN_STATUS_LABEL,
  type InstructReturnInput,
  type ReturnSnapshot,
  type ReturnStatus,
} from "@/lib/schemas/returns";

const TONE: Record<ReturnStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  REQUESTED: "neutral",
  AUTHORIZED: "info",
  IN_TRANSIT: "info",
  RECEIVED: "warning",
  INSPECTED: "warning",
  INSTRUCTED: "info",
  RESTOCKED: "success",
  DISPOSED: "error",
  DONATED: "success",
  REJECTED: "error",
  CANCELLED: "error",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Split {
  restock: number;
  dispose: number;
  donate: number;
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
  const [splits, setSplits] = useState<Record<string, Split>>({});
  const { bannerError, handle, clear } = useApiErrorHandler();

  // Seed the instruction split (default: restock everything) once the
  // return is INSPECTED and lines are known.
  useEffect(() => {
    const r = returnQ.data;
    if (!r || r.status !== "INSPECTED") return;
    setSplits((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const seed: Record<string, Split> = {};
      for (const l of r.lines) {
        seed[l.id] = { restock: l.receivedQty, dispose: 0, donate: 0 };
      }
      return seed;
    });
  }, [returnQ.data]);

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

  const instructMut = useMutation({
    mutationFn: (body: InstructReturnInput) =>
      api.post<ReturnSnapshot>(`/returns/${params.id}/instructions`, body),
    onMutate: clear,
    onSuccess: async () => {
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
      </div>
    );
  }

  const r = returnQ.data;
  const isCancellable = CANCELLABLE_RETURN_STATUSES.includes(r.status);
  const charge = returnChargeCents(r);
  const awaitingInstructions = r.status === "INSPECTED";

  // Validate the instruction split: each line's restock+dispose+donate
  // must equal its received quantity.
  const splitValid = r.lines.every((l) => {
    const s = splits[l.id] ?? { restock: 0, dispose: 0, donate: 0 };
    return s.restock + s.dispose + s.donate === l.receivedQty;
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`  Returns / ${r.rmaCode}`}
        title={r.rmaCode}
        description={`RMA against order ${r.orderId.slice(0, 8)} — reason: ${RETURN_REASON_LABEL[r.reason]}.`}
        actions={<BackButton fallback="/returns" />}
      />

      {/* Status + inbound + charge */}
      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <StatusPill tone={TONE[r.status]}>{RETURN_STATUS_LABEL[r.status]}</StatusPill>
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
            <div className="mt-1 text-body text-text">{r.inboundCarrier ?? "Your carrier"}</div>
            <div className="font-mono text-body-sm text-text">{r.inboundTracking ?? "—"}</div>
            {r.expectedDeliveryDate ? (
              <div className="mt-1 text-body-sm text-text-muted">
                Expected {new Date(r.expectedDeliveryDate).toLocaleDateString()}
              </div>
            ) : null}
          </div>

          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Charge</div>
            {r.resolvedAt ? (
              <dl className="mt-1 grid grid-cols-2 gap-y-1 font-mono text-body-sm">
                <dt className="text-text-muted">Processing fee</dt>
                <dd className="text-right text-text">{formatCents(r.processingFeeCents)}</dd>
                <dt className="text-text-muted">Handling</dt>
                <dd className="text-right text-text">{formatCents(r.handlingCostCents)}</dd>
                <dt className="text-h3 font-semibold text-ink">Total charged</dt>
                <dd className="text-right text-h3 font-semibold text-ink">{formatCents(charge)}</dd>
              </dl>
            ) : (
              <p className="mt-1 text-body-sm text-text-muted">
                A processing fee (plus any handling cost) is charged to your wallet when we
                finish handling this return. There is no product refund.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Received photos + condition, shared by USA Errands after inspection */}
      {r.receivedPhotoUrls.length > 0 || r.inspectorNotes ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="font-mono text-mono-label uppercase text-text-muted">
            What we received
          </h2>
          {r.inspectorNotes ? (
            <p className="mt-2 whitespace-pre-wrap text-body text-text">{r.inspectorNotes}</p>
          ) : null}
          {r.receivedPhotoUrls.length > 0 ? (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {r.receivedPhotoUrls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square overflow-hidden rounded-sm border border-line bg-cream-soft hover:border-ink"
                    title={url}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Received item" className="h-full w-full object-cover" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Instruction form — only when INSPECTED (awaiting the vendor's call) */}
      {awaitingInstructions ? (
        <section className="rounded-md border border-amber/40 bg-amber/5 p-6">
          <h2 className="text-h3 font-semibold text-ink">How should we handle these items?</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            For each line, tell us how many units to restock, dispose, or donate. The three must add
            up to the quantity we received.
          </p>
          <div className="mt-4">
            <DataTable>
              <THead>
                <Th>SKU</Th>
                <Th align="right">Received</Th>
                <Th align="right">Restock</Th>
                <Th align="right">Dispose</Th>
                <Th align="right">Donate</Th>
              </THead>
              <TBody>
                {r.lines.map((l) => {
                  const s = splits[l.id] ?? { restock: 0, dispose: 0, donate: 0 };
                  const sum = s.restock + s.dispose + s.donate;
                  const rowOk = sum === l.receivedQty;
                  const set = (key: keyof Split, raw: string) => {
                    const n = Math.max(0, Math.min(l.receivedQty, Math.floor(Number(raw) || 0)));
                    setSplits((prev) => ({ ...prev, [l.id]: { ...s, [key]: n } }));
                  };
                  return (
                    <TR key={l.id} className={rowOk ? undefined : "bg-error/5"}>
                      <Td mono>{l.skuId}</Td>
                      <Td num>{l.receivedQty}</Td>
                      <Td align="right">
                        <Input
                          type="number"
                          min={0}
                          max={l.receivedQty}
                          value={String(s.restock)}
                          onChange={(e) => set("restock", e.target.value)}
                          className="ml-auto h-9 w-20 text-right"
                        />
                      </Td>
                      <Td align="right">
                        <Input
                          type="number"
                          min={0}
                          max={l.receivedQty}
                          value={String(s.dispose)}
                          onChange={(e) => set("dispose", e.target.value)}
                          className="ml-auto h-9 w-20 text-right"
                        />
                      </Td>
                      <Td align="right">
                        <Input
                          type="number"
                          min={0}
                          max={l.receivedQty}
                          value={String(s.donate)}
                          onChange={(e) => set("donate", e.target.value)}
                          className="ml-auto h-9 w-20 text-right"
                        />
                      </Td>
                    </TR>
                  );
                })}
              </TBody>
            </DataTable>
          </div>
          <ErrorBanner error={bannerError} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-body-sm text-text-muted">
              {splitValid ? "Ready to submit." : "Each line's split must equal what we received."}
            </span>
            <Button
              variant="amber"
              loading={instructMut.isPending}
              disabled={instructMut.isPending || !splitValid}
              onClick={() =>
                instructMut.mutate({
                  lines: r.lines.map((l) => {
                    const s = splits[l.id] ?? { restock: 0, dispose: 0, donate: 0 };
                    return {
                      returnLineId: l.id,
                      restockQty: s.restock,
                      disposeQty: s.dispose,
                      donateQty: s.donate,
                    };
                  }),
                })
              }
            >
              {instructMut.isPending ? "Submitting…" : "Submit instructions"}
            </Button>
          </div>
        </section>
      ) : null}

      {/* Per-line breakdown */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Lines</h2>
        <div className="mt-3">
          <DataTable>
            <THead>
              <Th>SKU</Th>
              <Th align="right">Requested</Th>
              <Th align="right">Received</Th>
              <Th align="right">Restocked</Th>
              <Th align="right">Disposed</Th>
              <Th align="right">Donated</Th>
            </THead>
            <TBody>
              {r.lines.map((l) => (
                <TR key={l.id}>
                  <Td mono>{l.skuId}</Td>
                  <Td num>{l.requestedQty}</Td>
                  <Td num>{l.receivedQty}</Td>
                  <Td num>{l.restockedQty}</Td>
                  <Td num>{l.disposedQty}</Td>
                  <Td num>{l.donatedQty}</Td>
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
          <Event when={r.createdAt} label="Return registered — on its way to us" />
          {r.receivedAt ? <Event when={r.receivedAt} label="Received at warehouse" /> : null}
          {r.inspectedAt ? <Event when={r.inspectedAt} label="Inspected — photos shared" /> : null}
          {r.resolvedAt ? (
            <Event
              when={r.resolvedAt}
              label={`Finalized — ${RETURN_STATUS_LABEL[r.status].toLowerCase()}`}
              tone={r.status === "RESTOCKED" || r.status === "DONATED" ? "success" : "neutral"}
            />
          ) : null}
        </ul>
      </section>

      {/* Cancel — only allowed pre-receive */}
      {isCancellable ? (
        <section className="rounded-md border border-line bg-white p-6">
          {!showCancel ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-mono-label uppercase text-text-muted">Cancel return</h2>
                <p className="mt-1 text-body-sm text-text-muted">
                  Removes this RMA. Only possible before the box reaches our warehouse.
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
                If the customer has already shipped the box, this cancellation won&apos;t stop them —
                let support know if you need to redirect the inbound parcel.
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
                <Button variant="amber" loading={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                  {cancelMut.isPending ? "Cancelling…" : "Confirm cancel"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

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
