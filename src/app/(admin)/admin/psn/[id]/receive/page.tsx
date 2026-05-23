"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { PsnChatPanel } from "@/components/portal/psn-chat-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import {
  FALLBACK_TIERS,
  formatDimensionsLabel,
  type StorageTierKey,
  type StorageTiersResponse,
} from "@/lib/storage-tiers";

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
  // Migration 0033 — shipping mode is surfaced so the operator can route
  // ADD_TO_PALLET PSNs to the right physical pallet (boxes get placed on
  // the vendor's existing pallet, not landed loose).
  shippingMode: "LOOSE" | "PALLET" | "ADD_TO_PALLET";
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
    // Migration 0024 — items declared but absent from the box.
    missingQty: number;
    notes: string | null;
    // Migration 0024 — product include now returns the storage tier so we
    // can render a "Tier size" column. Older PSNs missing it default to
    // SMALL on the Product side, so this is always defined at runtime.
    product?: {
      code: string;
      name: string;
      variant: string;
      storageTier?: "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE" | "PALLET";
      /**
       * Locked product image URL — surfaced so the dock operator can
       * visually match what's in the box against what the vendor
       * catalogued. Null when the vendor never uploaded one.
       */
      imageUrl?: string | null;
    };
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

// Migration 0024 — Accept is no longer typed by the operator. They
// enter Missing + Damaged; Accept is computed as
//   remaining = declaredQty - receivedQty
//   accepted  = remaining - missing - damaged   (clamped at zero)
// This eliminates the over-receive class of mistake entirely — the
// math always reconciles because Accept can never exceed what's
// physically possible.
interface ReceivingState {
  damagedQty: number;
  missingQty: number;
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

  // Live tier-size data. Same endpoint the vendor PSN pricing card pulls
  // from — we render the configured dimensions for each declared tier
  // so the operator can verify the box at receive without leaving the
  // page. Falls back to seed defaults if the API errors.
  const tiersQ = useQuery({
    queryKey: ["fees", "storage-tiers"],
    queryFn: () => api.get<StorageTiersResponse>("/fees/storage-tiers"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const tiers = tiersQ.data ?? FALLBACK_TIERS;

  const [rows, setRows] = useState<Record<string, ReceivingState>>({});

  const { bannerError, handle, clear } = useApiErrorHandler();

  useEffect(() => {
    if (!psn) return;
    setRows((prev) => {
      if (Object.keys(prev).length > 0) return prev; // preserve operator entries
      const seed: Record<string, ReceivingState> = {};
      for (const l of psn.lines) {
        seed[l.id] = {
          damagedQty: 0,
          missingQty: 0,
          notes: l.notes ?? "",
        };
      }
      return seed;
    });
  }, [psn]);

  /**
   * Compute the accepted quantity for a line from its current
   * receiving-state entries. Always:
   *   remaining = declared − already-received
   *   accepted  = max(0, remaining − missing − damaged)
   * `clamp(0)` is defensive — if an operator overshoots Missing or
   * Damaged we render 0 rather than a negative count, and a banner
   * tells them to dial back. The submit math relies on the same
   * function so the wire payload and the on-screen total never
   * disagree.
   */
  function deriveAccepted(line: AdminPsn["lines"][number]): number {
    const r = rows[line.id] ?? { damagedQty: 0, missingQty: 0, notes: "" };
    const remaining = line.declaredQty - line.receivedQty;
    return Math.max(
      0,
      remaining - (Number(r.damagedQty) || 0) - (Number(r.missingQty) || 0),
    );
  }

  const submitMut = useMutation({
    mutationFn: () =>
      api.post<{ status: string; psnId: string }>(`/admin/psns/${params.id}/receive`, {
        lines: psn!.lines.map((l) => {
          const r = rows[l.id] ?? { damagedQty: 0, missingQty: 0, notes: "" };
          return {
            lineId: l.id,
            // Accept is derived, not typed — see deriveAccepted.
            acceptedQty: deriveAccepted(l),
            damagedQty: Number(r.damagedQty) || 0,
            missingQty: Number(r.missingQty) || 0,
            notes: r.notes || undefined,
          };
        }),
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

  // Summary — accepted is derived from each line via deriveAccepted, so
  // it stays in lockstep with Missing + Damaged without an operator
  // touching it. Missing gets its own summary box too so the dock has
  // a single-glance view of all three buckets.
  const summary = psn.lines.reduce(
    (acc, l) => {
      const r = rows[l.id] ?? { damagedQty: 0, missingQty: 0, notes: "" };
      return {
        accepted: acc.accepted + deriveAccepted(l),
        damaged: acc.damaged + (Number(r.damagedQty) || 0),
        missing: acc.missing + (Number(r.missingQty) || 0),
      };
    },
    { accepted: 0, damaged: 0, missing: 0 },
  );

  // Detect over-receive on the missing/damaged inputs — if the operator
  // types more missing+damaged than physically possible (i.e. > remaining)
  // we highlight the line, disable submit, and show a banner. Accept is
  // derived so it can never itself overshoot; this gate catches the
  // upstream typo.
  const overReceiveLines = psn.lines.filter((l) => {
    const remaining = l.declaredQty - l.receivedQty;
    const r = rows[l.id];
    if (!r) return false;
    return (Number(r.missingQty) || 0) + (Number(r.damagedQty) || 0) > remaining;
  });
  const hasOverReceive = overReceiveLines.length > 0;
  const hasAnyEntry =
    summary.accepted > 0 || summary.damaged > 0 || summary.missing > 0;

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
          <div className="flex flex-wrap items-center gap-2">
            <ShippingModeBadge mode={psn.shippingMode} />
            <StatusPill tone={psn.status === "AWAITING_RECEIPT" ? "info" : psn.status === "RECEIVED" ? "success" : "warning"}>
              {psn.status.replace(/_/g, " ")}
            </StatusPill>
          </div>
        }
      />

      {/* Mode-specific operator banner. ADD_TO_PALLET gets the loudest
          treatment because it's the only mode where the operator has to
          physically route boxes to a specific pallet on the floor — and
          where mismatched tier / over-capacity is a vendor-side mistake
          that has to be caught here, before SKUs land. */}
      {psn.shippingMode === "ADD_TO_PALLET" ? (
        <div
          role="alert"
          className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4"
        >
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
            Add-to-pallet shipment
          </div>
          <p className="mt-1 text-body-sm text-text">
            Boxes on this PSN are top-ups for an existing pallet of{" "}
            <strong>{psn.vendor.businessName}</strong>. Confirm the target pallet
            with the vendor over the PSN chat before placement. Reject the PSN if
            the boxes don&apos;t match the pallet&apos;s tier, exceed its remaining
            capacity, or arrive in non-standard packaging.
          </p>
        </div>
      ) : null}

      <ErrorBanner error={bannerError} onAction={onAction} />

      {/* Per-line entry table */}
      <DataTable>
        <THead>
          <Th>Product</Th>
          {/* Migration 0024 — declared tier + its physical dimensions,
              sourced live from /v1/fees/storage-tiers. Operators can
              eyeball whether the box on the dock matches the tier the
              vendor claimed. */}
          <Th>Tier size</Th>
          <Th align="right">Declared</Th>
          <Th align="right">Already received</Th>
          <Th align="right">Accept</Th>
          {/* Migration 0024 — missing column sits BEFORE Damaged so the
              eye moves left-to-right through the negative outcomes in
              order of severity (nothing → not in the box → broken). */}
          <Th align="right">Missing</Th>
          <Th align="right">Damaged</Th>
          <Th>Notes</Th>
        </THead>
        <TBody>
          {psn.lines.map((l) => {
            const remaining = l.declaredQty - l.receivedQty;
            const r = rows[l.id] ?? { damagedQty: 0, missingQty: 0, notes: "" };
            // Missing + Damaged can't exceed what's left to receive —
            // when they do, this line tints red and submit is blocked
            // upstream.
            const overReceive =
              (Number(r.missingQty) || 0) + (Number(r.damagedQty) || 0) > remaining;
            // Auto-derived accept count for this line. Lives in a const
            // here so both the Accept cell and any future reference
            // (e.g. labels) read off the same value.
            const accepted = deriveAccepted(l);
            const tierKey = l.product?.storageTier as StorageTierKey | undefined;
            const dims = tierKey ? tiers.dimensions?.[tierKey] : undefined;
            return (
              <TR key={l.id} className={overReceive ? "bg-error/5" : ""}>
                <Td>
                  {/* Product thumbnail + name + code/variant. The backend
                      join always returns `product` (FK is ON DELETE
                      RESTRICT), so the fallback below should never fire in
                      practice — but we render a friendly placeholder
                      instead of the raw UUID when it does, so operators
                      never have to read a hex string off the receiving
                      sheet. The thumbnail is the locked product image —
                      letting dock staff confirm "this is the right thing"
                      at a glance before they start counting. */}
                  {l.product ? (
                    <div className="flex items-start gap-3">
                      {l.product.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={l.product.imageUrl}
                          alt={`${l.product.name} thumbnail`}
                          className="h-12 w-12 shrink-0 rounded-sm border border-line object-cover"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          aria-hidden
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-dashed border-line bg-cream-soft font-mono text-[10px] uppercase tracking-[1px] text-text-subtle"
                        >
                          —
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-ink">{l.product.name}</div>
                        <div className="font-mono text-[11px] text-text-muted">
                          {l.product.code} · {l.product.variant || "STD"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="font-medium text-text-muted italic">
                        Unknown product
                      </div>
                      <div className="font-mono text-[11px] text-text-subtle">
                        Ref: {l.productId.slice(0, 8)}
                      </div>
                    </div>
                  )}
                </Td>
                <Td>
                  {tierKey ? (
                    <div>
                      <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text">
                        {tierKey.replace("_", "-")}
                      </div>
                      <div className="font-mono text-[11px] text-text-muted">
                        {formatDimensionsLabel(dims)}
                      </div>
                    </div>
                  ) : (
                    <span className="font-mono text-[11px] text-text-muted">—</span>
                  )}
                </Td>
                <Td num>{l.declaredQty}</Td>
                <Td num className="text-text-muted">{l.receivedQty}</Td>
                <Td align="right">
                  {/* Accept is now AUTO-COMPUTED from
                      remaining − missing − damaged. Displayed in
                      green so the eye treats it as "the outcome",
                      not "an input". An operator who needs to
                      override would adjust Missing / Damaged. */}
                  <div
                    className="inline-flex h-9 min-w-[80px] items-center justify-end rounded-sm border border-line bg-cream-soft px-3 font-mono text-body tabular-nums text-success"
                    aria-label="Accept (auto-computed from declared minus missing minus damaged)"
                  >
                    {accepted}
                  </div>
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
                    value={r.missingQty}
                    onChange={(e) => setRow(l.id, { missingQty: Number(e.target.value) })}
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

      {/* Chat panel — opens a per-PSN thread so admin and vendor can
          coordinate about discrepancies in-app (and via email). Mounted
          right below the line table so the operator can ask a question
          while staring at the line that prompted it. */}
      <PsnChatPanel psnId={psn.id} viewer="admin" />

      {hasOverReceive ? (
        <div
          role="alert"
          className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
        >
          <div className="font-mono text-mono-label uppercase text-error">Over-received</div>
          <p className="mt-1 text-body-sm text-text">
            {overReceiveLines.length} line(s) have missing + damaged quantities greater than
            the remaining declared count. Reduce them before submitting — a discrepancy
            should go through the exceptions workflow, not be quietly absorbed here.
          </p>
        </div>
      ) : null}

      {/* Summary + submit. Total Accepting is derived live from
          declared − missing − damaged — operators see it update the
          instant they type into Missing or Damaged. Total Missing is
          its own bucket so the dock has a single-glance view of every
          outcome without doing mental subtraction. */}
      <section className="grid gap-6 rounded-md border border-line bg-white p-6 md:grid-cols-4">
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">
            Total accepting
          </div>
          <div className="mt-2 text-h1 font-medium tabular-nums text-success">
            {summary.accepted}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[1.2px] text-text-subtle">
            Auto from declared − missing − damaged
          </div>
        </div>
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">Total missing</div>
          <div className="mt-2 text-h1 font-medium tabular-nums text-amber">{summary.missing}</div>
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

// ---------------------------------------------------------------------------
// Shipping-mode badge — sits next to the status pill in the page header so
// the operator's first look at a PSN tells them whether to land boxes on
// a fresh pallet (PALLET), into loose receiving (LOOSE), or onto an
// already-billed pallet (ADD_TO_PALLET). The colour ramp matches the
// vendor-side tile so a returning operator builds the same mental model.
// ---------------------------------------------------------------------------

function ShippingModeBadge({
  mode,
}: {
  mode: "LOOSE" | "PALLET" | "ADD_TO_PALLET";
}): JSX.Element {
  const config = {
    LOOSE: { label: "LOOSE", className: "border-line-strong bg-cream-soft text-text" },
    PALLET: { label: "PALLET", className: "border-line-strong bg-cream-soft text-ink" },
    ADD_TO_PALLET: { label: "ADD-TO-PALLET", className: "border-amber bg-amber/15 text-amber" },
  }[mode];
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[1.4px] " +
        config.className
      }
    >
      {config.label}
    </span>
  );
}

