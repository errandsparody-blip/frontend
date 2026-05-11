"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";

interface AdminPsn {
  id: string;
  status:
    | "AWAITING_RECEIPT"
    | "PARTIALLY_RECEIVED"
    | "RECEIVED"
    | "DISCREPANCY"
    | "CANCELLED"
    | "SUBMITTED"
    | "DRAFT"
    | "HOLD"
    | "REJECTED"
    | "RETURN_REQUESTED";
  carrier: string | null;
  masterTracking: string | null;
  submittedAt: string | null;
  vendor: { id: string; businessName: string; country: string };
  lines: Array<{
    id: string;
    productId: string;
    skuId: string | null;
    declaredQty: number;
    receivedQty: number;
    acceptedQty: number;
    damagedQty: number;
    notes: string | null;
    product?: { code: string; name: string; variant: string };
  }>;
  exceptions: Array<{ id: string; resolution: string; notes: string | null }>;
}

/** Possible Hold reason codes — must match backend PSN_HOLD_REASON_CODES. */
const HOLD_REASON_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "WRONG_TIER", label: "Wrong storage tier — package is larger than declared" },
  { code: "PACKAGING_FEE", label: "Non-standard packaging requires repackaging fee" },
  { code: "DISCREPANCY_FEE", label: "Discrepancy handling fee" },
  { code: "ADDITIONAL_HANDLING", label: "Additional handling (oversize / fragile / hazardous)" },
  { code: "OTHER", label: "Other — explain below" },
];

type DialogKind = null | "hold" | "reject" | "returnRequest";

interface ReceivingState {
  acceptedQty: number;
  damagedQty: number;
  notes: string;
}

export default function ReceivePsnPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: psn, isLoading, error } = useQuery({
    queryKey: ["admin", "psns", params.id],
    queryFn: () => api.get<AdminPsn>(`/admin/psns/${params.id}`),
    enabled: !!params.id,
  });

  const [rows, setRows] = useState<Record<string, ReceivingState>>({});

  const { bannerError, handle, clear } = useApiErrorHandler();

  useEffect(() => {
    if (!psn) return;
    setRows((prev) => {
      if (Object.keys(prev).length > 0) return prev; // preserve operator entries
      const seed: Record<string, ReceivingState> = {};
      for (const l of psn.lines) {
        seed[l.id] = {
          acceptedQty: l.declaredQty - l.receivedQty,
          damagedQty: 0,
          notes: l.notes ?? "",
        };
      }
      return seed;
    });
  }, [psn]);

  const submitMut = useMutation({
    mutationFn: () =>
      api.post<{ status: string; psnId: string }>(`/admin/psns/${params.id}/receive`, {
        lines: Object.entries(rows).map(([lineId, r]) => ({
          lineId,
          acceptedQty: r.acceptedQty,
          damagedQty: r.damagedQty,
          notes: r.notes || undefined,
        })),
      }),
    onMutate: clear,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "psns"] });
      await qc.invalidateQueries({ queryKey: ["admin", "psns", params.id] });
      await qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      router.push("/admin/psn");
    },
    onError: (err) => handle(err),
  });

  // Phase 2 — alternative outcomes. Each dialog has its own simple form
  // wrapped in a mutation; on success we invalidate the same query keys
  // and bounce back to the queue.
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [holdReasonCode, setHoldReasonCode] = useState("WRONG_TIER");
  const [holdReasonNote, setHoldReasonNote] = useState("");
  const [holdAmountDollars, setHoldAmountDollars] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnShippingDollars, setReturnShippingDollars] = useState("");

  function closeDialog(): void {
    setDialog(null);
    // Don't clear field values — operator may have made a typo and want to
    // re-open. They'll naturally clear when the action succeeds (page nav).
  }

  function onActionSuccess(): Promise<void> {
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "psns"] }),
      qc.invalidateQueries({ queryKey: ["admin", "psns", params.id] }),
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
    ]).then(() => {
      router.push("/admin/psn");
    });
  }

  const holdMut = useMutation({
    mutationFn: () =>
      api.post(`/admin/psns/${params.id}/hold`, {
        extraChargeCents: Math.round(Number(holdAmountDollars) * 100),
        reasonCode: holdReasonCode,
        reasonNote: holdReasonNote.trim(),
      }),
    onMutate: clear,
    onSuccess: () => onActionSuccess(),
    onError: (err) => handle(err),
  });

  const rejectMut = useMutation({
    mutationFn: () =>
      api.post(`/admin/psns/${params.id}/reject`, { reason: rejectReason.trim() }),
    onMutate: clear,
    onSuccess: () => onActionSuccess(),
    onError: (err) => handle(err),
  });

  const returnMut = useMutation({
    mutationFn: () =>
      api.post(`/admin/psns/${params.id}/request-return`, {
        reason: returnReason.trim(),
        returnShippingCents: Math.round(Number(returnShippingDollars || "0") * 100),
      }),
    onMutate: clear,
    onSuccess: () => onActionSuccess(),
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "retry") void submitMut.mutate();
    else if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  if (isLoading) return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  if (error || !psn) {
    const normalized = error ? normalizeError(error) : null;
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "PSN not found"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "The PSN may have been deleted or you don't have access."}
        </p>
      </div>
    );
  }

  const isFinal = ["RECEIVED", "CANCELLED", "DISCREPANCY"].includes(psn.status);

  // Summary derived from operator entries.
  const summary = Object.values(rows).reduce(
    (acc, r) => ({
      accepted: acc.accepted + Number(r.acceptedQty || 0),
      damaged: acc.damaged + Number(r.damagedQty || 0),
    }),
    { accepted: 0, damaged: 0 },
  );

  // Detect over-receive at the client so the operator gets immediate feedback
  // instead of relying on a backend 400. The row tint already highlights which
  // line is wrong; this flag also disables the submit button + shows a banner.
  const overReceiveLines = psn.lines.filter((l) => {
    const remaining = l.declaredQty - l.receivedQty;
    const r = rows[l.id];
    if (!r) return false;
    return Number(r.acceptedQty || 0) + Number(r.damagedQty || 0) > remaining;
  });
  const hasOverReceive = overReceiveLines.length > 0;
  const hasAnyEntry = summary.accepted > 0 || summary.damaged > 0;

  function setRow(lineId: string, patch: Partial<ReceivingState>): void {
    setRows((prev) => ({ ...prev, [lineId]: { ...prev[lineId]!, ...patch } }));
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`[02] Receiving / ${psn.id.slice(0, 8)}`}
        title={`Receiving — ${psn.vendor.businessName}`}
        description={`Carrier: ${psn.carrier ?? "—"} · Tracking: ${psn.masterTracking ?? "—"}`}
        actions={
          <StatusPill tone={psn.status === "AWAITING_RECEIPT" ? "info" : psn.status === "RECEIVED" ? "success" : "warning"}>
            {psn.status.replace(/_/g, " ")}
          </StatusPill>
        }
      />

      <ErrorBanner error={bannerError} onAction={onAction} />

      {/* Per-line entry table */}
      <DataTable>
        <THead>
          <Th>Product</Th>
          <Th align="right">Declared</Th>
          <Th align="right">Already received</Th>
          <Th align="right">Accept</Th>
          <Th align="right">Damaged</Th>
          <Th>Notes</Th>
        </THead>
        <TBody>
          {psn.lines.map((l) => {
            const remaining = l.declaredQty - l.receivedQty;
            const r = rows[l.id] ?? { acceptedQty: 0, damagedQty: 0, notes: "" };
            const total = Number(r.acceptedQty || 0) + Number(r.damagedQty || 0);
            const overReceive = total > remaining;
            return (
              <TR key={l.id} className={overReceive ? "bg-error/5" : ""}>
                <Td>
                  <div className="font-medium text-ink">{l.product?.name ?? l.productId}</div>
                  <div className="font-mono text-[11px] text-text-muted">
                    {l.product?.code ?? "—"} · {l.product?.variant ?? "STD"}
                  </div>
                </Td>
                <Td num>{l.declaredQty}</Td>
                <Td num className="text-text-muted">{l.receivedQty}</Td>
                <Td align="right">
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step={1}
                    className="w-20 text-right"
                    invalid={overReceive}
                    disabled={isFinal}
                    value={r.acceptedQty}
                    onChange={(e) => setRow(l.id, { acceptedQty: Number(e.target.value) })}
                  />
                </Td>
                <Td align="right">
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step={1}
                    className="w-20 text-right"
                    invalid={overReceive}
                    disabled={isFinal}
                    value={r.damagedQty}
                    onChange={(e) => setRow(l.id, { damagedQty: Number(e.target.value) })}
                  />
                </Td>
                <Td>
                  <Input
                    type="text"
                    placeholder="Optional"
                    disabled={isFinal}
                    value={r.notes}
                    onChange={(e) => setRow(l.id, { notes: e.target.value })}
                  />
                </Td>
              </TR>
            );
          })}
        </TBody>
      </DataTable>

      {hasOverReceive ? (
        <div
          role="alert"
          className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
        >
          <div className="font-mono text-mono-label uppercase text-error">Over-received</div>
          <p className="mt-1 text-body-sm text-text">
            {overReceiveLines.length} line(s) have accepted + damaged quantities greater than
            the remaining declared count. Reduce them before submitting — a discrepancy
            should go through the exceptions workflow, not be quietly absorbed here.
          </p>
        </div>
      ) : null}

      {/* Summary + submit */}
      <section className="grid gap-6 rounded-md border border-line bg-white p-6 md:grid-cols-3">
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">Total accepting</div>
          <div className="mt-2 text-h1 font-medium tabular-nums text-success">{summary.accepted}</div>
        </div>
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">Total damaged</div>
          <div className="mt-2 text-h1 font-medium tabular-nums text-error">{summary.damaged}</div>
        </div>
        <div className="flex items-end justify-end">
          {!isFinal ? (
            <Button
              variant="amber"
              size="lg"
              withArrow
              onClick={() => {
                clear();
                submitMut.mutate();
              }}
              loading={submitMut.isPending}
              disabled={hasOverReceive || !hasAnyEntry}
            >
              <CheckCircle2 className="h-4 w-4" />
              {hasAnyEntry ? "Edit & accept" : "Accept declared"}
            </Button>
          ) : (
            <span className="font-mono text-mono-label uppercase text-text-muted">No actions remaining</span>
          )}
        </div>
      </section>

      {/* Phase 2 — alternative outcomes. These three buttons sit BELOW the
          primary accept flow so the most common action (just accept what
          arrived) stays at the top. Each opens a small inline form. */}
      {!isFinal ? (
        <section className="rounded-md border border-line bg-cream-soft p-6">
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
            Other outcomes
          </div>
          <p className="mt-2 text-body-sm text-text-muted">
            Use these when the package can&#39;t be accepted as-is: hold pending
            extra payment, refuse outright, or ship back to the vendor.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setDialog("hold")}>
              Hold for payment
            </Button>
            <Button variant="outline" onClick={() => setDialog("reject")}>
              Reject
            </Button>
            <Button variant="outline" onClick={() => setDialog("returnRequest")}>
              Request return
            </Button>
          </div>

          {/* Hold form */}
          {dialog === "hold" ? (
            <div className="mt-6 flex flex-col gap-4 rounded-md border border-line-strong bg-white p-5">
              <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-ink">
                Place package on hold
              </div>
              <div>
                <div className="block font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                  Reason
                </div>
                <select
                  aria-label="Hold reason"
                  value={holdReasonCode}
                  onChange={(e) => setHoldReasonCode(e.target.value)}
                  className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text focus:border-ink"
                >
                  {HOLD_REASON_OPTIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="block font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                  Note shown to vendor
                </div>
                <Input
                  type="text"
                  value={holdReasonNote}
                  onChange={(e) => setHoldReasonNote(e.target.value)}
                  placeholder="e.g. Package weighed 28 lb — needs LARGE tier surcharge"
                />
              </div>
              <div>
                <div className="block font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                  Extra charge (USD)
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0.50"
                  value={holdAmountDollars}
                  onChange={(e) => setHoldAmountDollars(e.target.value)}
                  placeholder="12.00"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => holdMut.mutate()}
                  loading={holdMut.isPending}
                  disabled={
                    holdReasonNote.trim().length < 10 ||
                    !holdAmountDollars ||
                    Number(holdAmountDollars) < 0.5
                  }
                >
                  Place hold
                </Button>
              </div>
            </div>
          ) : null}

          {/* Reject form */}
          {dialog === "reject" ? (
            <div className="mt-6 flex flex-col gap-4 rounded-md border border-error bg-error/5 p-5">
              <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-error">
                Reject this PSN
              </div>
              <p className="text-body-sm text-text">
                Inventory will not be created. The vendor&#39;s onboarding fee
                stays debited (Finance can refund separately if appropriate).
              </p>
              <div>
                <div className="block font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                  Reason shown to vendor
                </div>
                <Input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Counterfeit goods detected on inspection"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => rejectMut.mutate()}
                  loading={rejectMut.isPending}
                  disabled={rejectReason.trim().length < 10}
                >
                  Reject PSN
                </Button>
              </div>
            </div>
          ) : null}

          {/* Return Request form */}
          {dialog === "returnRequest" ? (
            <div className="mt-6 flex flex-col gap-4 rounded-md border border-line-strong bg-white p-5">
              <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-ink">
                Request return shipment
              </div>
              <p className="text-body-sm text-text">
                The unopened package will ship back to the vendor&#39;s return
                address. Vendor&#39;s wallet is debited for the return shipping
                amount you enter below.
              </p>
              <div>
                <div className="block font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                  Reason
                </div>
                <Input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Vendor refused to pay the hold within 7 days"
                />
              </div>
              <div>
                <div className="block font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                  Return shipping (USD) — debited from wallet
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={returnShippingDollars}
                  onChange={(e) => setReturnShippingDollars(e.target.value)}
                  placeholder="15.00"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => returnMut.mutate()}
                  loading={returnMut.isPending}
                  disabled={returnReason.trim().length < 10}
                >
                  Request return
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

