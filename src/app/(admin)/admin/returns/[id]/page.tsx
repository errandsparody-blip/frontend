"use client";

/**
 * Admin return detail — receive + inspect.
 *
 * Two action sections gated by status:
 *
 *   AUTHORIZED / IN_TRANSIT  → "Mark received" form: per-line received qty.
 *                              Posts /admin/returns/:id/receive.
 *   RECEIVED                 → "Inspect + refund" form: per-line restocked /
 *                              damaged / disposed qty + gross refund + restock
 *                              fee + inspector notes. Posts /admin/returns/:id/inspect.
 *   Anything else            → read-only.
 *
 * The same per-line table is reused across both forms. Receive starts
 * with received_qty = requested_qty as a sensible default. Inspect
 * starts with restocked_qty = received_qty (assume operator restocks
 * everything unless they mark some damaged/disposed).
 *
 * Wallet-affecting fields (refund, restock fee) live in the Inspect
 * form. The wallet credit happens server-side via REVERSAL ledger
 * postings — UI just sends the cents the operator chose.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import {
  netRefundCents,
  RETURN_REASON_LABEL,
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

interface InspectLineState {
  restockedQty: number;
  damagedQty: number;
  disposedQty: number;
  notes: string;
}

export default function AdminReturnDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const returnQ = useQuery({
    queryKey: ["admin", "returns", params.id],
    queryFn: () => api.get<ReturnSnapshot>(`/admin/returns/${params.id}`),
    enabled: !!params.id,
  });

  const { bannerError, handle, clear } = useApiErrorHandler();

  // Receive form state — per-line received qty.
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  // Inspect form state — per-line + global refund/fee/notes.
  const [inspectLines, setInspectLines] = useState<Record<string, InspectLineState>>({});
  const [refundDollars, setRefundDollars] = useState("");
  const [restockFeeDollars, setRestockFeeDollars] = useState("");
  const [inspectorNotes, setInspectorNotes] = useState("");

  // Re-seed both forms whenever the loaded return changes. We use the
  // currently-saved per-line numbers as defaults so an operator who
  // re-opens the page sees their last input.
  useEffect(() => {
    if (!returnQ.data) return;
    const r = returnQ.data;
    const recv: Record<string, number> = {};
    const insp: Record<string, InspectLineState> = {};
    for (const ln of r.lines) {
      recv[ln.id] = ln.receivedQty || ln.requestedQty;
      insp[ln.id] = {
        restockedQty: ln.restockedQty || ln.receivedQty,
        damagedQty: ln.damagedQty || 0,
        disposedQty: ln.disposedQty || 0,
        notes: ln.notes ?? "",
      };
    }
    setReceiveQty(recv);
    setInspectLines(insp);
    if (r.refundAmountCents) setRefundDollars((r.refundAmountCents / 100).toFixed(2));
    if (r.restockFeeCents) setRestockFeeDollars((r.restockFeeCents / 100).toFixed(2));
    if (r.inspectorNotes) setInspectorNotes(r.inspectorNotes);
  }, [returnQ.data]);

  const receiveMut = useMutation({
    mutationFn: (body: ReceiveReturnInput) =>
      api.post<ReturnSnapshot>(`/admin/returns/${params.id}/receive`, body),
    onMutate: clear,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "returns", params.id] }),
        qc.invalidateQueries({ queryKey: ["admin", "returns"] }),
      ]);
    },
    onError: (err) => handle(err),
  });

  const inspectMut = useMutation({
    mutationFn: (body: InspectReturnInput) =>
      api.post<ReturnSnapshot>(`/admin/returns/${params.id}/inspect`, body),
    onMutate: clear,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "returns", params.id] }),
        qc.invalidateQueries({ queryKey: ["admin", "returns"] }),
      ]);
    },
    onError: (err) => handle(err),
  });

  const liveNet = useMemo(() => {
    const refund = Math.round(Number(refundDollars || "0") * 100);
    const fee = Math.round(Number(restockFeeDollars || "0") * 100);
    if (!Number.isFinite(refund) || !Number.isFinite(fee)) return 0;
    return Math.max(0, refund - fee);
  }, [refundDollars, restockFeeDollars]);

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
  const canReceive = r.status === "AUTHORIZED" || r.status === "IN_TRANSIT";
  const canInspect = r.status === "RECEIVED";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`[06] Returns / ${r.rmaCode}`}
        title={r.rmaCode}
        description={`Vendor ${r.vendorId.slice(0, 8)} · Order ${r.orderId.slice(0, 8)} · ${RETURN_REASON_LABEL[r.reason]}`}
        actions={
          <button
            type="button"
            onClick={() => router.push("/admin/returns")}
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back
          </button>
        }
      />

      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <StatusPill tone={TONE[r.status]}>{r.status.replace(/_/g, " ")}</StatusPill>
          <span className="font-mono text-body-sm text-text-muted">
            Opened {new Date(r.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">
              Inbound shipment
            </div>
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
              <div className="mt-1 text-body-sm text-text-muted">No inbound label attached.</div>
            )}
          </div>

          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Settled refund</div>
            <dl className="mt-1 grid grid-cols-2 gap-y-1 font-mono text-body-sm">
              <dt className="text-text-muted">Refund (gross)</dt>
              <dd className="text-right text-text">{formatCents(r.refundAmountCents)}</dd>
              <dt className="text-text-muted">Restock fee</dt>
              <dd className="text-right text-text">−{formatCents(r.restockFeeCents)}</dd>
              <dt className="text-h3 font-semibold text-ink">Net to vendor wallet</dt>
              <dd className="text-right text-h3 font-semibold text-ink">
                {formatCents(netRefundCents(r))}
              </dd>
            </dl>
          </div>
        </div>
      </section>

      {/* Photo evidence the vendor attached at RMA-creation. Inspectors
          should review these before deciding refund vs reject. */}
      {r.attachmentUrls.length > 0 ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="font-mono text-mono-label uppercase text-text-muted">
            Vendor evidence
          </h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Attached when the vendor opened this RMA. Compare against the inbound box before
            settling the refund.
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

      <ErrorBanner
        error={bannerError}
        onAction={(handler) => {
          if (handler === "retry") {
            if (canReceive) void receiveMut.mutate({ lines: buildReceivePayload(r, receiveQty) });
            else if (canInspect)
              void inspectMut.mutate(buildInspectPayload(r, inspectLines, refundDollars, restockFeeDollars, inspectorNotes));
          } else if (handler === "support") {
            window.location.href = "mailto:support@usa-errands.com";
          }
        }}
      />

      {/* RECEIVE form */}
      {canReceive ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="text-h3 font-semibold text-ink">Mark received</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Enter the actual quantity received per line. Defaults to the requested quantity.
            Saving moves the RMA into RECEIVED so the inspect form opens.
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
                        step={1}
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
                receiveMut.mutate({ lines: buildReceivePayload(r, receiveQty) })
              }
            >
              {receiveMut.isPending ? "Saving…" : "Mark received"}
            </Button>
          </div>
        </section>
      ) : null}

      {/* INSPECT form */}
      {canInspect ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="text-h3 font-semibold text-ink">Inspect &amp; refund</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Allocate each received unit to restocked / damaged / disposed. Restocked units flow
            back into inventory automatically. The net refund (gross − restock fee) is credited
            to the vendor&apos;s wallet as a REVERSAL ledger entry.
          </p>

          <div className="mt-4">
            <DataTable>
              <THead>
                <Th>SKU</Th>
                <Th align="right">Received</Th>
                <Th align="right">Restocked</Th>
                <Th align="right">Damaged</Th>
                <Th align="right">Disposed</Th>
                <Th>Notes</Th>
              </THead>
              <TBody>
                {r.lines.map((l) => {
                  const state = inspectLines[l.id] ?? {
                    restockedQty: 0,
                    damagedQty: 0,
                    disposedQty: 0,
                    notes: "",
                  };
                  const allocated = state.restockedQty + state.damagedQty + state.disposedQty;
                  const overAllocated = allocated > l.receivedQty;
                  return (
                    <TR key={l.id}>
                      <Td mono>{l.skuId}</Td>
                      <Td num>{l.receivedQty}</Td>
                      <Td align="right">
                        <Input
                          type="number"
                          min={0}
                          max={l.receivedQty}
                          step={1}
                          value={String(state.restockedQty)}
                          onChange={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setInspectLines((prev) => ({
                              ...prev,
                              [l.id]: { ...state, restockedQty: n },
                            }));
                          }}
                          className={`ml-auto h-9 w-20 text-right ${overAllocated ? "border-error" : ""}`}
                        />
                      </Td>
                      <Td align="right">
                        <Input
                          type="number"
                          min={0}
                          max={l.receivedQty}
                          step={1}
                          value={String(state.damagedQty)}
                          onChange={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setInspectLines((prev) => ({
                              ...prev,
                              [l.id]: { ...state, damagedQty: n },
                            }));
                          }}
                          className={`ml-auto h-9 w-20 text-right ${overAllocated ? "border-error" : ""}`}
                        />
                      </Td>
                      <Td align="right">
                        <Input
                          type="number"
                          min={0}
                          max={l.receivedQty}
                          step={1}
                          value={String(state.disposedQty)}
                          onChange={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setInspectLines((prev) => ({
                              ...prev,
                              [l.id]: { ...state, disposedQty: n },
                            }));
                          }}
                          className={`ml-auto h-9 w-20 text-right ${overAllocated ? "border-error" : ""}`}
                        />
                      </Td>
                      <Td>
                        <Input
                          type="text"
                          maxLength={500}
                          value={state.notes}
                          onChange={(e) =>
                            setInspectLines((prev) => ({
                              ...prev,
                              [l.id]: { ...state, notes: e.target.value },
                            }))
                          }
                          className="h-9 w-full"
                          placeholder="Optional"
                        />
                      </Td>
                    </TR>
                  );
                })}
              </TBody>
            </DataTable>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Field label="Refund (gross $)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={refundDollars}
                onChange={(e) => setRefundDollars(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Restock fee ($)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={restockFeeDollars}
                onChange={(e) => setRestockFeeDollars(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <div>
              <div className="font-mono text-mono-label uppercase text-text-muted">
                Net to wallet
              </div>
              <div className="mt-2 font-mono text-h2 tabular-nums text-ink">
                {formatCents(liveNet)}
              </div>
            </div>
          </div>

          <Field label="Inspector notes (optional)" className="mt-4">
            <textarea
              rows={3}
              maxLength={2000}
              value={inspectorNotes}
              onChange={(e) => setInspectorNotes(e.target.value)}
              placeholder="Anything the vendor or finance team should see in the audit log."
              className="w-full rounded-sm border border-line-strong bg-white p-3 font-sans text-body text-text outline-none focus:border-ink"
            />
          </Field>

          <div className="mt-4 flex justify-end">
            <Button
              variant="amber"
              loading={inspectMut.isPending}
              onClick={() =>
                inspectMut.mutate(
                  buildInspectPayload(r, inspectLines, refundDollars, restockFeeDollars, inspectorNotes),
                )
              }
            >
              {inspectMut.isPending ? "Posting refund…" : "Confirm inspection"}
            </Button>
          </div>
        </section>
      ) : null}

      {/* Read-only line table for terminal states */}
      {!canReceive && !canInspect ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="font-mono text-mono-label uppercase text-text-muted">Lines</h2>
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
      ) : null}

      <div className="text-body-sm text-text-muted">
        Parent order:{" "}
        <Link
          href={`/admin/orders/${r.orderId}`}
          className="text-amber hover:text-amber-hi"
        >
          {r.orderId.slice(0, 8)} →
        </Link>
      </div>
    </div>
  );
}

function buildReceivePayload(
  r: ReturnSnapshot,
  qty: Record<string, number>,
): ReceiveReturnInput["lines"] {
  return r.lines.map((l) => ({
    returnLineId: l.id,
    receivedQty: Math.max(0, Math.floor(qty[l.id] ?? 0)),
  }));
}

function buildInspectPayload(
  r: ReturnSnapshot,
  inspectLines: Record<string, InspectLineState>,
  refundDollars: string,
  restockFeeDollars: string,
  inspectorNotes: string,
): InspectReturnInput {
  const refundCents = Math.max(0, Math.round(Number(refundDollars || "0") * 100));
  const feeCents = Math.max(0, Math.round(Number(restockFeeDollars || "0") * 100));
  return {
    refundAmountCents: Number.isFinite(refundCents) ? refundCents : 0,
    restockFeeCents: Number.isFinite(feeCents) ? feeCents : 0,
    inspectorNotes: inspectorNotes.trim() ? inspectorNotes.trim() : undefined,
    lines: r.lines.map((l) => {
      const s = inspectLines[l.id] ?? { restockedQty: 0, damagedQty: 0, disposedQty: 0, notes: "" };
      return {
        returnLineId: l.id,
        restockedQty: Math.max(0, Math.floor(s.restockedQty)),
        damagedQty: Math.max(0, Math.floor(s.damagedQty)),
        disposedQty: Math.max(0, Math.floor(s.disposedQty)),
        notes: s.notes.trim() ? s.notes.trim() : undefined,
      };
    }),
  };
}
