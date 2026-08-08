"use client";

/**
 * Admin return detail — receive → inspect → finalize (Returns v2).
 *
 *   REQUESTED / AUTHORIZED / IN_TRANSIT → "Mark received": per-line qty.
 *   RECEIVED                            → "Inspect": upload photos of the
 *                                          received items + condition note,
 *                                          then ask the vendor for handling
 *                                          instructions.
 *   INSPECTED                           → waiting on the vendor's
 *                                          instructions (read-only), OR a
 *                                          legal/safety disposal override.
 *   INSTRUCTED                          → "Finalize": apply the vendor's
 *                                          restock/dispose/donate split and
 *                                          charge the processing fee (+ any
 *                                          handling). No refund is issued.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AttachmentUploader } from "@/components/portal/attachment-uploader";
import { ErrorBanner } from "@/components/errors/error-banner";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import {
  returnChargeCents,
  RETURN_REASON_LABEL,
  RETURN_STATUS_LABEL,
  type FinalizeReturnInput,
  type InspectReturnInput,
  type ReceiveReturnInput,
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

export default function AdminReturnDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();

  const returnQ = useQuery({
    queryKey: ["admin", "returns", params.id],
    queryFn: () => api.get<ReturnSnapshot>(`/admin/returns/${params.id}`),
    enabled: !!params.id,
  });

  // Exact processing fee from the live fee schedule so the finalize
  // preview matches what the server will charge (falls back to the $1.99
  // policy default).
  const configQ = useQuery({
    queryKey: ["admin", "returns", "config"],
    queryFn: () => api.get<{ processingFeeCents: number }>("/admin/returns/config"),
    staleTime: 5 * 60_000,
  });
  const processingFeeCents = configQ.data?.processingFeeCents ?? 199;

  const { bannerError, handle, clear } = useApiErrorHandler();

  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [conditionNotes, setConditionNotes] = useState("");
  const [handlingDollars, setHandlingDollars] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (!returnQ.data) return;
    const r = returnQ.data;
    const recv: Record<string, number> = {};
    for (const ln of r.lines) recv[ln.id] = ln.receivedQty || ln.requestedQty;
    setReceiveQty(recv);
    if (r.inspectorNotes) setConditionNotes(r.inspectorNotes);
    if (r.receivedPhotoUrls.length) setPhotos(r.receivedPhotoUrls);
  }, [returnQ.data]);

  const receiveMut = useMutation({
    mutationFn: (body: ReceiveReturnInput) =>
      api.post<ReturnSnapshot>(`/admin/returns/${params.id}/receive`, body),
    onMutate: clear,
    onSuccess: () => invalidate(),
    onError: (err) => handle(err),
  });
  const inspectMut = useMutation({
    mutationFn: (body: InspectReturnInput) =>
      api.post<ReturnSnapshot>(`/admin/returns/${params.id}/inspect`, body),
    onMutate: clear,
    onSuccess: () => invalidate(),
    onError: (err) => handle(err),
  });
  const finalizeMut = useMutation({
    mutationFn: (body: FinalizeReturnInput) =>
      api.post<ReturnSnapshot>(`/admin/returns/${params.id}/finalize`, body),
    onMutate: clear,
    onSuccess: () => invalidate(),
    onError: (err) => handle(err),
  });

  function invalidate() {
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "returns", params.id] }),
      qc.invalidateQueries({ queryKey: ["admin", "returns"] }),
    ]);
  }

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
          {normalized?.entry.body ?? "This RMA may not exist."}
        </p>
      </div>
    );
  }

  const r = returnQ.data;
  const canReceive = r.status === "REQUESTED" || r.status === "AUTHORIZED" || r.status === "IN_TRANSIT";
  const canInspect = r.status === "RECEIVED";
  const awaitingInstructions = r.status === "INSPECTED";
  const canFinalize = r.status === "INSTRUCTED";
  const canOverride = r.status === "RECEIVED" || r.status === "INSPECTED";
  const handlingCents = Math.max(0, Math.round(Number(handlingDollars || "0") * 100)) || 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`  Returns / ${r.rmaCode}`}
        title={r.rmaCode}
        description={`Vendor ${r.vendorId.slice(0, 8)} · Order ${r.orderId.slice(0, 8)} · ${RETURN_REASON_LABEL[r.reason]}`}
        actions={<BackButton fallback="/admin/returns" />}
      />

      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <StatusPill tone={TONE[r.status]}>{RETURN_STATUS_LABEL[r.status]}</StatusPill>
          <span className="font-mono text-body-sm text-text-muted">
            Opened {new Date(r.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Inbound shipment</div>
            <div className="mt-1 text-body text-text">{r.inboundCarrier ?? "Vendor's carrier"}</div>
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
                <dd className="text-right text-h3 font-semibold text-ink">
                  {formatCents(returnChargeCents(r))}
                </dd>
              </dl>
            ) : (
              <p className="mt-1 text-body-sm text-text-muted">
                The vendor is charged a processing fee plus any handling cost at finalize. No
                refund is issued.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Vendor evidence attached at RMA creation */}
      {r.attachmentUrls.length > 0 ? (
        <PhotoGrid title="Vendor evidence" urls={r.attachmentUrls} />
      ) : null}

      {/* Photos USA Errands already recorded */}
      {r.receivedPhotoUrls.length > 0 && !canInspect ? (
        <PhotoGrid title="Received items" urls={r.receivedPhotoUrls} />
      ) : null}

      <ErrorBanner
        error={bannerError}
        onAction={(handler) => {
          if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
        }}
      />

      {/* RECEIVE */}
      {canReceive ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="text-h3 font-semibold text-ink">Mark received</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Enter the actual quantity received per line. Defaults to the requested quantity.
          </p>
          <div className="mt-4">
            <DataTable>
              <THead>
                <Th>SKU</Th>
                <Th align="right">Requested</Th>
                <Th align="right">Received</Th>
              </THead>
              <TBody>
                {r.lines.map((l) => (
                  <TR key={l.id}>
                    <Td mono>{l.skuId}</Td>
                    <Td num>{l.requestedQty}</Td>
                    <Td align="right">
                      <Input
                        type="number"
                        min={0}
                        max={l.requestedQty}
                        value={String(receiveQty[l.id] ?? 0)}
                        onChange={(e) => {
                          const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setReceiveQty((prev) => ({ ...prev, [l.id]: n }));
                        }}
                        className="ml-auto h-9 w-24 text-right"
                      />
                    </Td>
                  </TR>
                ))}
              </TBody>
            </DataTable>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="amber"
              loading={receiveMut.isPending}
              onClick={() =>
                receiveMut.mutate({
                  lines: r.lines.map((l) => ({
                    returnLineId: l.id,
                    receivedQty: Math.max(0, Math.floor(receiveQty[l.id] ?? 0)),
                  })),
                })
              }
            >
              {receiveMut.isPending ? "Saving…" : "Mark received"}
            </Button>
          </div>
        </section>
      ) : null}

      {/* INSPECT — photos + condition */}
      {canInspect ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="text-h3 font-semibold text-ink">Inspect &amp; share photos</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Photograph the received items and describe their condition. Saving shares this with the
            vendor and asks them how to handle the inventory.
          </p>
          <div className="mt-4">
            <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
              Photos of received items
            </div>
            <AttachmentUploader
              value={photos}
              onChange={setPhotos}
              presignEndpoint={`/admin/returns/${r.id}/uploads`}
              disabled={inspectMut.isPending}
            />
          </div>
          <Field label="Condition notes" className="mt-4">
            <textarea
              rows={3}
              maxLength={2000}
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              placeholder="Describe the condition of what arrived (this is shared with the vendor)."
              className="w-full rounded-sm border border-line-strong bg-white p-3 font-sans text-body text-text outline-none focus:border-ink"
            />
          </Field>
          <div className="mt-4 flex justify-end">
            <Button
              variant="amber"
              loading={inspectMut.isPending}
              disabled={inspectMut.isPending || photos.length === 0 || conditionNotes.trim().length === 0}
              onClick={() =>
                inspectMut.mutate({
                  receivedPhotoUrls: photos,
                  conditionNotes: conditionNotes.trim(),
                })
              }
            >
              {inspectMut.isPending ? "Sharing…" : "Share & request instructions"}
            </Button>
          </div>
        </section>
      ) : null}

      {/* Awaiting vendor instructions */}
      {awaitingInstructions ? (
        <section className="rounded-md border border-amber/40 bg-amber/5 p-6">
          <h2 className="text-h3 font-semibold text-ink">Waiting on vendor instructions</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            The vendor has been asked how to handle these items (restock / dispose / donate). You
            can finalize once they respond.
          </p>
        </section>
      ) : null}

      {/* FINALIZE — apply the vendor's instructed split */}
      {canFinalize ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="text-h3 font-semibold text-ink">Finalize</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            The vendor&apos;s instructions are below. Finalizing restocks the restocked units, records
            the rest, and charges the vendor the {formatCents(processingFeeCents)} processing fee plus
            any handling cost.
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
                {r.lines.map((l) => (
                  <TR key={l.id}>
                    <Td mono>{l.skuId}</Td>
                    <Td num>{l.receivedQty}</Td>
                    <Td num>{l.restockedQty}</Td>
                    <Td num>{l.disposedQty}</Td>
                    <Td num>{l.donatedQty}</Td>
                  </TR>
                ))}
              </TBody>
            </DataTable>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Handling cost ($, optional)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={handlingDollars}
                onChange={(e) => setHandlingDollars(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <div>
              <div className="font-mono text-mono-label uppercase text-text-muted">Total charge</div>
              <div className="mt-2 font-mono text-h2 tabular-nums text-ink">
                {formatCents(processingFeeCents + handlingCents)}
              </div>
              <div className="text-body-sm text-text-muted">
                {formatCents(processingFeeCents)} processing fee + handling
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="amber"
              loading={finalizeMut.isPending}
              onClick={() => finalizeMut.mutate({ handlingCostCents: handlingCents })}
            >
              {finalizeMut.isPending ? "Finalizing…" : "Finalize & charge"}
            </Button>
          </div>
        </section>
      ) : null}

      {/* Legal/safety disposal override */}
      {canOverride ? (
        <section className="rounded-md border border-line bg-white p-6">
          {!showOverride ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-mono-label uppercase text-text-muted">
                  Legal / safety disposal
                </h2>
                <p className="mt-1 text-body-sm text-text-muted">
                  Dispose all received units without vendor instructions — only when required by
                  law, carrier rules, or safety.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setShowOverride(true)}>
                Dispose by law
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="text-h3 font-semibold text-ink">Dispose without instructions</h2>
              <Field label="Reason (required)">
                <Input
                  type="text"
                  maxLength={500}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. hazardous material — carrier prohibits return to vendor"
                />
              </Field>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowOverride(false)}>
                  Cancel
                </Button>
                <Button
                  variant="amber"
                  loading={finalizeMut.isPending}
                  disabled={finalizeMut.isPending || overrideReason.trim().length === 0}
                  onClick={() =>
                    finalizeMut.mutate({
                      handlingCostCents: handlingCents,
                      disposalOverrideReason: overrideReason.trim(),
                    })
                  }
                >
                  {finalizeMut.isPending ? "Disposing…" : "Confirm disposal"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* Read-only lines for terminal states */}
      {!canReceive && !canInspect && !canFinalize ? (
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
      ) : null}

      <div className="text-body-sm text-text-muted">
        Parent order:{" "}
        <Link href={`/admin/orders/${r.orderId}`} className="text-amber hover:text-amber-hi">
          {r.orderId.slice(0, 8)} →
        </Link>
      </div>
    </div>
  );
}

function PhotoGrid({ title, urls }: { title: string; urls: string[] }): JSX.Element {
  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="font-mono text-mono-label uppercase text-text-muted">{title}</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {urls.map((url) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-square overflow-hidden rounded-sm border border-line bg-cream-soft hover:border-ink"
              title={url}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={title} className="h-full w-full object-cover" loading="lazy" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
