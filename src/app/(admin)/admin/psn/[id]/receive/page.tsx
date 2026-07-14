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
import { useAuth } from "@/lib/auth-context";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import { cn } from "@/lib/utils";

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
  // Vendor-declared box counts per tier — { SMALL: 3, MEDIUM: 1, ... }.
  // Used to render the box-summary block above the receiving table so
  // operators can eyeball the dock against the declaration before they
  // start counting line items.
  declaredBoxCounts: Record<string, number>;
  carrier: string | null;
  masterTracking: string | null;
  submittedAt: string | null;
  // Stamped on first receive (the single-shot Accept action) regardless
  // of outcome — RECEIVED, PARTIALLY_RECEIVED, and DISCREPANCY all set
  // this. Surfaced on the sealed banner so operators can see exactly
  // when the PSN was sealed.
  receivedAt: string | null;
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
      // Migration 0040 — product `id` is now surfaced so the admin
      // receive UI can PATCH shipping points against the specific
      // product from the inline editor without a second lookup.
      id?: string;
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
      /**
       * Migration 0040 — Fulfillment v2 shipping-cost proxy. Set by
       * super admin at receive time. `null` means unassigned, which
       * blocks Complete Receiving until every product on the PSN has
       * a value. Decimal at the DB layer; arrives here as a plain
       * number after Prisma's Decimal-to-number round trip.
       */
      shippingPoints?: number | null;
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

/**
 * Migration 0040 — inline shipping-points cell for the admin PSN
 * receive UI. Renders as one of three states:
 *
 *   1. SUPER_ADMIN, no value set → tight inline input + Save button.
 *   2. SUPER_ADMIN, value set → chip showing the current value +
 *      "Edit" affordance that swaps to the input.
 *   3. Non-super-admin, any state → read-only chip. If unset,
 *      shows an amber "Not set" state so the operator knows they
 *      can't finish the receive until a super admin fills it in.
 *
 * Controlled by the parent (edit buffer + onSave callback) so state
 * lives in one place — a per-cell useState would go stale on
 * refetch and desync from the persisted value.
 */
function ShippingPointsCell({
  productId,
  currentValue,
  isSuperAdmin,
  editValue,
  onEditChange,
  onSave,
  saving,
}: {
  productId: string;
  currentValue: number | null;
  isSuperAdmin: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  onSave: (points: number) => void;
  saving: boolean;
}): JSX.Element {
  const [editing, setEditing] = useState(currentValue === null);

  // Value the input starts at when the super admin clicks Edit —
  // the current value formatted as a bare decimal string. Falls
  // back to the local edit buffer if the user has already typed.
  const seedString =
    editValue || (currentValue !== null ? String(currentValue) : "");

  // Non-super-admin view — read-only chip. Amber when unset so the
  // gap is visible.
  if (!isSuperAdmin) {
    return currentValue !== null ? (
      <div
        className="mt-1 inline-flex items-center gap-1 rounded-sm border border-line bg-cream-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted"
        title="Shipping points assigned by super admin. Used for the vendor-facing estimate at order submit."
      >
        SP · {currentValue}
      </div>
    ) : (
      <div
        className="mt-1 inline-flex items-center gap-1 rounded-sm border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-amber"
        title="Super admin has not set shipping points for this product yet. Receive cannot complete."
      >
        SP · Not set
      </div>
    );
  }

  // Super-admin, viewing a saved value — chip with an Edit affordance.
  if (!editing) {
    return (
      <div className="mt-1 flex items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-sm border border-line bg-cream-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
          SP · {currentValue}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-mono text-[10px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
        >
          Edit
        </button>
      </div>
    );
  }

  // Super-admin, editing — input + Save. Parses on save so a bad
  // string doesn't submit a NaN through the API.
  return (
    <div className="mt-1 flex items-center gap-2">
      <Input
        type="number"
        step="0.25"
        min={0}
        max={100}
        placeholder="e.g. 1.5"
        value={seedString}
        onChange={(e) => onEditChange(e.target.value)}
        className="h-7 w-20 py-0 font-mono text-[11px]"
        aria-label={`Shipping points for product ${productId}`}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          const n = Number(seedString);
          if (!Number.isFinite(n) || n < 0) return;
          onSave(n);
          setEditing(false);
        }}
        className="font-mono text-[10px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {currentValue !== null ? (
        <button
          type="button"
          onClick={() => {
            onEditChange("");
            setEditing(false);
          }}
          className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted hover:text-text"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
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
        // Initialise the form from the LINE'S CURRENT STATE on the
        // server, not from zeros. On a fresh PSN these are all 0 so
        // behaviour matches the original "blank form" intent. On a
        // re-open of a PARTIALLY_RECEIVED / DISCREPANCY PSN, the
        // operator immediately sees the missing / damaged counts they
        // recorded earlier, instead of an empty form that makes it
        // look like they have to start over. Without this, the Accept
        // column showed nonsense numbers (e.g. "2" when the operator
        // had previously declared 2 missing on a 100-unit line) because
        // the math treated each session as "what's still arriving"
        // rather than "what is the final state of this shipment".
        seed[l.id] = {
          damagedQty: l.damagedQty ?? 0,
          missingQty: l.missingQty ?? 0,
          notes: l.notes ?? "",
        };
      }
      return seed;
    });
  }, [psn]);

  /**
   * Compute the accepted quantity for a line as the CUMULATIVE total
   * for the whole PSN line, not a per-session delta:
   *
   *   accepted = max(0, declared − missing − damaged)
   *
   * The previous version subtracted the already-received quantity
   * first and treated input as "how much more this session" — that
   * worked on a first receive but broke on every re-receive because
   * `remaining` shrank with each prior submission and the operator
   * couldn't see their previous declarations. Now the form always
   * shows the final-state numbers; my SkuService delta logic on the
   * backend handles the bucket math correctly when the cumulative
   * value changes between sessions.
   *
   * `clamp(0)` is defensive — if an operator overshoots Missing or
   * Damaged we render 0 rather than a negative count, and a banner
   * tells them to dial back. The submit math relies on the same
   * function so the wire payload and the on-screen total never
   * disagree.
   */
  function deriveAccepted(line: AdminPsn["lines"][number]): number {
    const r = rows[line.id] ?? { damagedQty: 0, missingQty: 0, notes: "" };
    return Math.max(
      0,
      line.declaredQty - (Number(r.damagedQty) || 0) - (Number(r.missingQty) || 0),
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

  // Migration 0040 — Fulfillment v2. Per-product shipping-points
  // editor. Only SUPER_ADMIN can save; every other admin role sees
  // the current value as read-only. The receive completion is
  // gated (backend AND frontend) on every product having a
  // non-null value.
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Local edit buffer per product id — populated when a super admin
  // types into the inline input; cleared after a successful save so
  // the row reflects the freshly-persisted value from the refetched
  // PSN. Keyed by productId (not lineId) because two PSN lines could
  // point at the same product — one edit updates both rows.
  const [shippingPointsEdits, setShippingPointsEdits] = useState<
    Record<string, string>
  >({});

  const savePointsMut = useMutation({
    mutationFn: async (input: { productId: string; points: number }) =>
      api.patch<{ id: string; shippingPoints: number }>(
        `/admin/products/${input.productId}/shipping-points`,
        { shippingPoints: input.points },
      ),
    onSuccess: async (_res, vars) => {
      // Clear the local edit for this product; the row re-reads its
      // current value from the refetched PSN payload.
      setShippingPointsEdits((prev) => {
        const next = { ...prev };
        delete next[vars.productId];
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["admin", "psns", params.id] });
    },
    onError: (err) => handle(err),
  });

  // Which lines are still blocking receive completion? Read straight
  // from the PSN payload so no stale local state can hide a gate.
  const unassignedPointsLines = psn
    ? psn.lines.filter((l) => {
        const val = l.product?.shippingPoints;
        return val === undefined || val === null;
      })
    : [];
  const hasUnassignedPoints = unassignedPointsLines.length > 0;

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

  // Under the single-shot receive policy, DISCREPANCY is a terminal
  // state — no resolve action exists on the receive page anymore.
  // The /admin/psns/:id/resolve-discrepancy endpoint is retained
  // server-side so legacy DISCREPANCY rows from before the policy
  // change can still be cleaned up manually via API if anyone needs
  // to, but the UI no longer surfaces it.

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "retry") void submitMut.mutate();
    else if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
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

  // Single-shot receive policy: clicking Accept seals the PSN no matter
  // the outcome. RECEIVED, PARTIALLY_RECEIVED, and DISCREPANCY are all
  // terminal — the form is read-only, no further actions remain.
  // REJECTED, RETURN_REQUESTED, and CANCELLED are likewise terminal
  // from other workflow paths. HOLD is excluded because it's a
  // pre-receive state with its own resolution path elsewhere.
  const isFinal = [
    "RECEIVED",
    "PARTIALLY_RECEIVED",
    "DISCREPANCY",
    "CANCELLED",
    "REJECTED",
    "RETURN_REQUESTED",
  ].includes(psn.status);

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
  // types cumulative missing + damaged that exceeds the declared count
  // for the line we highlight it, disable submit, and show a banner.
  // Accept is derived so it can never itself overshoot; this gate
  // catches the upstream typo. Compared against `declaredQty` directly
  // because the form now operates on cumulative totals — see the
  // deriveAccepted comment above for why.
  const overReceiveLines = psn.lines.filter((l) => {
    const r = rows[l.id];
    if (!r) return false;
    return (Number(r.missingQty) || 0) + (Number(r.damagedQty) || 0) > l.declaredQty;
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
        eyebrow={` Receiving / ${psn.id.slice(0, 8)}`}
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

      {/* Single-shot receive policy seal banner. Shown whenever the PSN
          is in a terminal state so operators (and anyone reviewing the
          history record) see immediately that the shipment has been
          sealed, what the outcome was, and when it happened. The form
          below is rendered read-only in that case, so this banner is
          the primary at-a-glance status indicator. */}
      {isFinal ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-md border-l-4 px-5 py-4",
            psn.status === "RECEIVED"
              ? "border-success bg-success/10"
              : psn.status === "CANCELLED" ||
                  psn.status === "REJECTED" ||
                  psn.status === "RETURN_REQUESTED"
                ? "border-error bg-error/10"
                : "border-amber bg-amber/10",
          )}
        >
          <div
            className={cn(
              "font-mono text-mono-label uppercase tracking-[1.4px]",
              psn.status === "RECEIVED"
                ? "text-success"
                : psn.status === "CANCELLED" ||
                    psn.status === "REJECTED" ||
                    psn.status === "RETURN_REQUESTED"
                  ? "text-error"
                  : "text-amber",
            )}
          >
            Sealed — {psn.status.replace(/_/g, " ").toLowerCase()}
          </div>
          <p className="mt-1 text-body-sm text-text">
            This Pre-Shipment Notice was sealed on{" "}
            <strong>
              {psn.receivedAt
                ? new Date(psn.receivedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "—"}
            </strong>
            . Under the single-shot receive policy, receiving is a one-time
            action and this record is locked. Damaged, missing, and accepted
            counts below reflect what was recorded at sealing. Any
            late-arriving boxes should be received on a fresh PSN.
          </p>
        </div>
      ) : null}

      {/* Vendor-declared box manifest — the answer to "how many boxes
          and what sizes did they ship?". Sourced from PSN.declaredBoxCounts
          which the vendor filled in at PSN creation. The total count and
          per-tier breakdown are surfaced so the dock operator can match
          the declaration against what's physically on the floor before
          they start receiving line items. */}
      <DeclaredBoxesPanel counts={psn.declaredBoxCounts} />

      {/* Migration 0040 — banner surfaces the shipping-points gate.
          Renders whenever any product on the PSN lacks points. For
          SUPER_ADMIN: reminder to fill in the inline inputs below.
          For everyone else: a nudge to escalate — they can't set the
          value themselves. Kept above the table so it's the first
          thing an operator sees when they realise Accept is
          disabled. */}
      {hasUnassignedPoints ? (
        <div
          role="note"
          className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4"
        >
          <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
            Shipping points required
          </div>
          <p className="mt-1 text-body-sm text-text">
            {isSuperAdmin ? (
              <>
                {unassignedPointsLines.length} product
                {unassignedPointsLines.length === 1 ? " needs" : "s need"} a
                shipping-points value before this PSN can be sealed. Use the
                inline editor on each row below.
              </>
            ) : (
              <>
                {unassignedPointsLines.length} product
                {unassignedPointsLines.length === 1 ? " is" : "s are"} missing
                a shipping-points value. Only a super admin can set this —
                please escalate before completing this receive.
              </>
            )}
          </p>
        </div>
      ) : null}

      {/* Per-line entry table */}
      <DataTable>
        <THead>
          <Th>Product</Th>
          {/* This column shows the PRODUCT's stored tier (the tier
              admin chose when the product was created or last
              corrected via the admin product edit page). It is NOT
              the size of the box being shipped on this PSN — that
              Renders the vendor-declared box manifest for this
              shipment — the same chips on every row because the
              manifest is per PSN, not per product line. This is the
              column operators actually need at the dock: "what
              boxes should be on the floor right now?". */}
          <Th>Boxes shipped</Th>
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
                        {/* Migration 0040 — Fulfillment v2 shipping-cost
                            proxy. Read-only chip for non-super-admin;
                            inline editor for super admin. Kept inside
                            the Product cell so the value is
                            colocated with what it applies to and
                            operators can eyeball it while entering
                            counts. */}
                        <ShippingPointsCell
                          productId={l.product.id ?? l.productId}
                          currentValue={l.product.shippingPoints ?? null}
                          isSuperAdmin={isSuperAdmin}
                          editValue={
                            shippingPointsEdits[l.product.id ?? l.productId] ?? ""
                          }
                          onEditChange={(v) =>
                            setShippingPointsEdits((prev) => ({
                              ...prev,
                              [l.product!.id ?? l.productId]: v,
                            }))
                          }
                          onSave={(points) =>
                            savePointsMut.mutate({
                              productId: l.product!.id ?? l.productId,
                              points,
                            })
                          }
                          saving={
                            savePointsMut.isPending &&
                            savePointsMut.variables?.productId ===
                              (l.product.id ?? l.productId)
                          }
                        />
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
                  {/* Vendor-declared box manifest for THIS shipment.
                      Same chips on every row because the manifest is
                      a PSN-level value, not per product. */}
                  <BoxChips counts={psn.declaredBoxCounts} />
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
              // Migration 0040 — receive completion is gated on every
              // product having shipping points. Backend enforces the
              // same rule; disabling here surfaces the block up-front
              // instead of after the click. The inline banner up top
              // explains WHY the button is disabled.
              disabled={hasOverReceive || !hasAnyEntry || hasUnassignedPoints}
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
// Declared boxes panel — sits above the line-entry table so the dock
// operator can confirm the manifest matches what's physically on the
// floor before they start counting line items. Renders one chip per
// box tier with the vendor-declared count, plus a total in the header.
// ---------------------------------------------------------------------------

// Stable tier order so chips read smallest → largest left-to-right.
const BOX_TIER_ORDER = ["SMALL", "MEDIUM", "LARGE", "X_LARGE", "PALLET"] as const;

function boxTierLabel(tier: string): string {
  switch (tier) {
    case "SMALL":
      return "Small box";
    case "MEDIUM":
      return "Medium box";
    case "LARGE":
      return "Large box";
    case "X_LARGE":
      return "Extra-large box";
    case "PALLET":
      return "Pallet";
    default:
      return tier;
  }
}

function readBoxEntries(
  counts: Record<string, number>,
): Array<{ tier: string; count: number }> {
  return BOX_TIER_ORDER.map((tier) => ({
    tier,
    count: Number(counts?.[tier] ?? 0),
  })).filter((e) => e.count > 0);
}

function BoxChips({ counts }: { counts: Record<string, number> }): JSX.Element {
  const entries = readBoxEntries(counts);
  if (entries.length === 0) {
    return <span className="font-mono text-[11px] text-text-muted">—</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map((e) => (
        <li
          key={e.tier}
          className="inline-flex items-baseline gap-1.5 rounded-sm border border-line-strong bg-cream-soft px-2 py-1 font-mono text-[11px]"
        >
          <span className="text-text">{boxTierLabel(e.tier)}</span>
          <span className="font-semibold tabular-nums text-ink">×{e.count}</span>
        </li>
      ))}
    </ul>
  );
}

function DeclaredBoxesPanel({ counts }: { counts: Record<string, number> }): JSX.Element {
  const entries = readBoxEntries(counts);
  const total = entries.reduce((acc, e) => acc + e.count, 0);
  return (
    <section className="rounded-md border border-line bg-white p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
            Vendor declared
          </div>
          <h2 className="mt-0.5 text-h3 font-semibold text-ink">
            {total} box{total === 1 ? "" : "es"} on this shipment
          </h2>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
          Match the manifest against the dock before receiving
        </span>
      </header>
      {entries.length === 0 ? (
        <p className="mt-3 text-body-sm text-text-muted">
          The vendor did not declare any boxes for this shipment.
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {entries.map((e) => (
            <li
              key={e.tier}
              className="inline-flex items-baseline gap-2 rounded-sm border border-line-strong bg-cream-soft px-3 py-1.5 font-mono text-body-sm"
            >
              <span className="text-text">{boxTierLabel(e.tier)}</span>
              <span className="font-semibold tabular-nums text-ink">×{e.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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

