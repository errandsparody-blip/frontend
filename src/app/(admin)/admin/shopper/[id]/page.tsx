"use client";

/**
 * Admin Shopper detail.
 *
 * One screen, three columns of work:
 *   1. Header — buyer, status, money snapshot (intake + reconciliation)
 *   2. Lines — per-line reconciliation (actual price + procurement status)
 *   3. Workflow rail — status-aware action buttons:
 *        PAID                  → Start procurement
 *        PROCURING             → Set shipping cost · Finalize reconciliation
 *        AWAITING_RECONCILIATION → Send follow-up (Checkout / Refund / Skip)
 *        READY_TO_SHIP         → Ship
 *        SHIPPED               → Mark delivered (manual override)
 *        any in-flight         → Cancel
 *   4. Chat panel — full thread, admin composer
 *
 * The page polls the thread every 12s while the tab is visible so a
 * buyer's reply lands without a manual refresh. Action mutations
 * invalidate `["admin", "shopper", id]` to keep the snapshot honest.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { AttachmentUploader } from "@/components/portal/attachment-uploader";
import { ReferenceDisplay } from "@/components/portal/reference-display";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import { linkify } from "@/lib/linkify";
import {
  SHOPPER_LINE_PROCUREMENT_STATUS,
  type ShopperLineProcurementStatus,
  type ShopperLineSnapshot,
  type ShopperMessageSnapshot,
  type ShopperRequestSnapshot,
  type ShopperRequestStatus,
} from "@/lib/schemas/shopper";

interface AdminShopperDetailResponse {
  request: ShopperRequestSnapshot;
  messages: ShopperMessageSnapshot[];
}

const TONE: Record<ShopperRequestStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  AWAITING_INTAKE_PAYMENT: "warning",
  PAID: "info",
  PROCURING: "info",
  AWAITING_RECONCILIATION: "warning",
  READY_TO_SHIP: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

function dollars(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminShopperDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["admin", "shopper", id],
    queryFn: () => api.get<AdminShopperDetailResponse>(`/admin/shopper/${id}`),
    enabled: !!id,
    refetchInterval: 12_000,
  });

  // Mark buyer messages as read whenever this view is open.
  useEffect(() => {
    if (!detailQ.data) return;
    void api.post(`/admin/shopper/${id}/read`).catch(() => undefined);
  }, [detailQ.data, id]);

  function refresh(): Promise<void> {
    return qc.invalidateQueries({ queryKey: ["admin", "shopper", id] }).then(() => undefined);
  }

  if (detailQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (detailQ.error) {
    return (
      <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
        {(detailQ.error as { message?: string }).message ?? "Failed to load request."}
      </div>
    );
  }
  if (!detailQ.data) return <div />;
  const { request, messages } = detailQ.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[08] Personal Shopper"
        title={`${request.lines.length} ${request.lines.length === 1 ? "item" : "items"} · ${request.buyerEmail}`}
        description={`Created ${fmtTime(request.createdAt)} · ${request.buyerName ?? "no buyer name"}`}
        actions={<StatusPill tone={TONE[request.status]}>{request.status.replace(/_/g, " ")}</StatusPill>}
      />

      {/* Reference panel — admins quote this to support / link from
          notes / paste into Slack threads. Keep it directly under the
          page header so it's the first thing they see. */}
      <section className="rounded-md border border-line bg-white p-6">
        <ReferenceDisplay
          reference={request.reference}
          parentReference={request.parentReference}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(360px,420px)]">
        <div className="flex flex-col gap-6">
          <MoneyPanel request={request} />
          <LinesPanel
            requestId={id}
            lines={request.lines}
            status={request.status}
            onChange={refresh}
          />
          <WorkflowPanel request={request} onChange={refresh} />
        </div>

        <ChatPanel
          requestId={id}
          messages={messages}
          onChange={refresh}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money snapshot
// ---------------------------------------------------------------------------

function MoneyPanel({ request }: { request: ShopperRequestSnapshot }): JSX.Element {
  const r = request;
  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Money</h2>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Items estimate" value={dollars(r.itemsSubtotalCents)} />
        <Stat label="Service fee" value={dollars(r.commissionCents)} />
        <Stat
          label={
            r.effectiveTaxState
              ? `Est. ${r.effectiveTaxState} tax (${(r.estimatedTaxRateBps / 100).toFixed(2)}%)`
              : "Est. sales tax"
          }
          value={dollars(r.estimatedTaxCents)}
        />
        <Stat label="Intake total" value={dollars(r.intakeTotalCents)} emphasis />
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-4">
        <Stat label="Items actual" value={dollars(r.itemsActualSubtotalCents)} />
        <Stat label="Actual sales tax" value={dollars(r.actualTaxCents)} />
        <Stat label="Shipping cost" value={dollars(r.shippingCostCents)} />
        <Stat
          label={
            r.followupAmountCents == null
              ? "Follow-up"
              : r.followupAmountCents > 0
                ? "Buyer owes"
                : r.followupAmountCents < 0
                  ? "Refund to buyer"
                  : "Settled (zero delta)"
          }
          value={
            r.followupAmountCents == null
              ? "—"
              : dollars(Math.abs(r.followupAmountCents))
          }
          emphasis
          tone={
            r.followupAmountCents == null
              ? "neutral"
              : r.followupAmountCents > 0
                ? "amber"
                : r.followupAmountCents < 0
                  ? "success"
                  : "neutral"
          }
        />
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-3 font-mono text-mono-label uppercase text-text-muted">
        <span>Intake paid: {r.intakePaidAt ? fmtTime(r.intakePaidAt) : "—"}</span>
        <span>Follow-up resolved: {r.followupResolvedAt ? fmtTime(r.followupResolvedAt) : "—"}</span>
        <span>
          Tracking: {r.carrier && r.trackingNumber ? `${r.carrier} · ${r.trackingNumber}` : "—"}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Lines (per-line reconciliation)
// ---------------------------------------------------------------------------

function LinesPanel({
  requestId,
  lines,
  status,
  onChange,
}: {
  requestId: string;
  lines: ShopperLineSnapshot[];
  status: ShopperRequestStatus;
  onChange: () => void;
}): JSX.Element {
  // Editing is gated to PROCURING — once admin has finalized reconciliation
  // the actuals are snapshotted into the follow-up amount and shouldn't drift.
  const editable = status === "PROCURING";

  // Totals — derived purely from the lines on screen, no extra round trip.
  // Shown so the admin (and the warehouse) can sanity-check the parcel
  // weight against the sum-of-lines weight at pack time.
  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);
  const linesWithWeight = lines.filter((l) => l.actualWeightOz != null);
  const totalWeightOz = linesWithWeight.reduce(
    (sum, l) => sum + (l.actualWeightOz ?? 0) * l.quantity,
    0,
  );
  const allWeighed = linesWithWeight.length === lines.length && lines.length > 0;

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">
        Lines {editable ? "" : "(read-only — reconciliation finalized)"}
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {lines.map((line) => (
          <LineRow
            key={line.id}
            requestId={requestId}
            line={line}
            editable={editable}
            onChange={onChange}
          />
        ))}
      </ul>

      {/* Totals footer — quick reference at pack time. */}
      <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-3">
        <Stat label="Lines" value={String(lines.length)} />
        <Stat label="Total units" value={String(totalUnits)} />
        <Stat
          label={allWeighed ? "Total weight (oz)" : "Total weight (oz, partial)"}
          value={
            linesWithWeight.length === 0
              ? "—"
              : `${totalWeightOz.toFixed(2)}${allWeighed ? "" : " *"}`
          }
        />
      </div>
      {!allWeighed && linesWithWeight.length > 0 ? (
        <p className="mt-2 text-caption text-text-muted">
          * Some lines don&apos;t have an actual weight yet. The sum above only counts those that do.
        </p>
      ) : null}
    </section>
  );
}

function LineRow({
  requestId,
  line,
  editable,
  onChange,
}: {
  requestId: string;
  line: ShopperLineSnapshot;
  editable: boolean;
  onChange: () => void;
}): JSX.Element {
  const [actualDollars, setActualDollars] = useState<string>(
    line.actualUnitPriceCents != null ? (line.actualUnitPriceCents / 100).toFixed(2) : "",
  );
  const [procStatus, setProcStatus] = useState<ShopperLineProcurementStatus>(
    (line.procurementStatus as ShopperLineProcurementStatus) ?? "pending",
  );
  const [productTitle, setProductTitle] = useState<string>(line.productTitle ?? "");
  const [notes, setNotes] = useState<string>("");
  // Per-line actual weight (oz, per unit — multiplied by quantity for the
  // total). Float string so warehouse can enter fractional ounces.
  const [actualWeight, setActualWeight] = useState<string>(
    line.actualWeightOz != null ? line.actualWeightOz.toString() : "",
  );
  const { bannerError, handle, clear } = useApiErrorHandler();

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { procurementStatus: procStatus };
      const trimmedDollars = actualDollars.trim();
      if (trimmedDollars.length > 0) {
        const cents = Math.round(Number(trimmedDollars) * 100);
        if (Number.isFinite(cents) && cents >= 0) {
          body.actualUnitPriceCents = cents;
        }
      } else if (line.actualUnitPriceCents != null) {
        // Explicit clear back to null.
        body.actualUnitPriceCents = null;
      }
      if (productTitle.trim() !== (line.productTitle ?? "")) {
        body.productTitle = productTitle.trim();
      }
      if (notes.trim().length > 0) {
        body.procurementNotes = notes.trim();
      }
      const trimmedWeight = actualWeight.trim();
      if (trimmedWeight.length > 0) {
        const oz = Number(trimmedWeight);
        if (Number.isFinite(oz) && oz >= 0) {
          body.actualWeightOz = oz;
        }
      } else if (line.actualWeightOz != null) {
        body.actualWeightOz = null;
      }
      return api.patch<ShopperLineSnapshot>(`/admin/shopper/${requestId}/lines/${line.id}`, body);
    },
    onSuccess: () => {
      setNotes("");
      onChange();
    },
    onError: (err) => handle(err),
  });

  return (
    <li className="grid gap-3 py-4 md:grid-cols-[2fr_80px_120px_140px_120px_160px_auto]">
      <div className="min-w-0">
        <a
          href={line.productUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block truncate text-body text-ink underline-offset-2 hover:underline"
        >
          {line.productTitle ?? line.productUrl}
        </a>
        {line.productNotes ? (
          <p className="mt-1 text-body-sm text-text-muted">Buyer note: {line.productNotes}</p>
        ) : null}
        {editable ? (
          <Field label="Title (optional override)" className="mt-2">
            <Input
              type="text"
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
              placeholder="Friendly name"
            />
          </Field>
        ) : null}
      </div>

      <div className="font-mono text-body text-text-muted">×{line.quantity}</div>

      <div>
        <Field label="Estimated">
          <Input
            type="text"
            value={dollars(line.estimatedUnitPriceCents)}
            disabled
            className="bg-cream text-text-muted"
          />
        </Field>
      </div>

      <div>
        <Field label="Actual ($)">
          <Input
            type="number"
            step="0.01"
            min={0}
            value={actualDollars}
            disabled={!editable}
            onChange={(e) => setActualDollars(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>

      <div>
        <Field label="Weight (oz, per unit)">
          <Input
            type="number"
            step="0.01"
            min={0}
            value={actualWeight}
            disabled={!editable}
            onChange={(e) => setActualWeight(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <Field label="Status">
          <select
            value={procStatus}
            disabled={!editable}
            onChange={(e) => setProcStatus(e.target.value as ShopperLineProcurementStatus)}
            className="h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          >
            {SHOPPER_LINE_PROCUREMENT_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {editable ? (
          <Field label="Note for this update (optional)">
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Substitution, etc."
            />
          </Field>
        ) : null}
        {editable ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={save.isPending}
            loading={save.isPending}
            onClick={() => {
              clear();
              save.mutate();
            }}
          >
            Save line
          </Button>
        ) : null}
        {bannerError ? (
          <div className="mt-2">
            <ErrorBanner error={bannerError} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Workflow rail (status-aware actions)
// ---------------------------------------------------------------------------

function WorkflowPanel({
  request,
  onChange,
}: {
  request: ShopperRequestSnapshot;
  onChange: () => void;
}): JSX.Element {
  const r = request;
  const id = r.id;
  const { bannerError, handle, clear } = useApiErrorHandler();

  // Live action mutations. Each invalidates the parent query to repaint.
  const post = useMutation({
    mutationFn: (args: { path: string; body?: unknown }) =>
      api.post<unknown>(`/admin/shopper/${id}${args.path}`, args.body),
    onSuccess: (data, vars) => {
      // Surface the Stripe Checkout URL when finalize→send-followup returns one.
      if (vars.path === "/followup/send" && isCheckoutBranch(data)) {
        if (typeof window !== "undefined" && data.payUrl?.startsWith("https://")) {
          window.open(data.payUrl, "_blank", "noopener,noreferrer");
        }
      }
      onChange();
    },
    onError: (err) => handle(err),
  });

  // Per-status workflow buttons
  const actions = useMemo(() => statusActions(r.status), [r.status]);

  // Freight rates — used to live-calculate the system shipping cost as
  // the operator changes weight or method. Same map the backend uses at
  // save time, so frontend preview and persisted number agree.
  const freightRatesQuery = useQuery({
    queryKey: ["admin", "shopper", "freight-rates"],
    queryFn: () =>
      api.get<{ rates: Record<string, number>; methods: ReadonlyArray<string> }>(
        "/admin/shopper/freight-rates",
      ),
    // Rates change at most a few times per quarter; an hour of cache
    // saves a query per detail-page open without making the calc stale.
    staleTime: 60 * 60 * 1000,
  });
  const freightRates = freightRatesQuery.data?.rates ?? {};

  // Local form state (shipping cost, ship action carrier+tracking, cancel reason)
  const [shippingDollars, setShippingDollars] = useState("");
  // Default the method picker to whatever's already saved on the row so
  // the operator doesn't have to re-pick on every save (and so the live
  // calc has a method to multiply against on first render).
  const [shippingMethod, setShippingMethod] = useState<"" | "PLATFORM_FREIGHT" | "BUYER_FORWARDER" | "PICKUP">(
    (r.shippingMethod as "" | "PLATFORM_FREIGHT" | "BUYER_FORWARDER" | "PICKUP") ?? "",
  );
  // Migration 0017 — admin can either trust the system calc or override
  // it with a manual cost. Default to "use calculated" so the new flow
  // is the path of least resistance.
  const [useCalculated, setUseCalculated] = useState(true);
  // Pre-populate the actual-tax input with whatever's already on the row,
  // so an admin who's editing a previously-saved value sees it.
  const [actualTaxDollars, setActualTaxDollars] = useState(
    r.actualTaxCents != null ? (r.actualTaxCents / 100).toFixed(2) : "",
  );
  // Parcel dimensions + total weight — pre-populated from the row so an
  // admin who's editing a previously-saved value sees them.
  const [parcelLength, setParcelLength] = useState(
    r.parcelLengthIn != null ? r.parcelLengthIn.toString() : "",
  );
  const [parcelWidth, setParcelWidth] = useState(
    r.parcelWidthIn != null ? r.parcelWidthIn.toString() : "",
  );
  const [parcelHeight, setParcelHeight] = useState(
    r.parcelHeightIn != null ? r.parcelHeightIn.toString() : "",
  );
  const [parcelWeight, setParcelWeight] = useState(
    r.parcelWeightOz != null ? r.parcelWeightOz.toString() : "",
  );
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [issueRefund, setIssueRefund] = useState(true);
  const [followupNote, setFollowupNote] = useState("");

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Workflow</h2>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner
            error={bannerError}
            onAction={(handler) => {
              if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
              else if (handler === "retry") clear();
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {actions.includes("start") ? (
          <Action
            title="Start procurement"
            description="Locks the request into PROCURING. Reconciliation editing opens."
            cta="Start"
            disabled={post.isPending}
            onClick={() => {
              clear();
              post.mutate({ path: "/start" });
            }}
          />
        ) : null}

        {actions.includes("shipping") ? (
          (() => {
            // Live freight calculation. Mirrors the backend formula:
            //   cost (cents) = (weight_oz / 16) × rate_cents_per_lb
            // Re-runs every render as the operator types weight or
            // changes method, so the displayed preview always tracks
            // what the server will actually charge.
            const liveWeightOz = (() => {
              const n = Number(parcelWeight);
              return Number.isFinite(n) && n >= 0 ? n : 0;
            })();
            const liveRateCentsPerLb = shippingMethod
              ? freightRates[shippingMethod] ?? 0
              : 0;
            const liveCalculatedCents =
              liveWeightOz > 0
                ? Math.round((liveWeightOz / 16) * liveRateCentsPerLb)
                : 0;
            return (
              <Action
                title="Set shipping cost, sales tax &amp; parcel"
                description={`Pick a method, enter the parcel weight, and the system computes the shipping cost from the per-lb rate. Override below if a real-world surcharge applies — the receipt shows both numbers. Tax estimate at intake: ${dollars(r.estimatedTaxCents)} (${r.effectiveTaxState ?? "unknown state"}, ${(r.estimatedTaxRateBps / 100).toFixed(2)}%).`}
                disabled={post.isPending}
                cta="Save shipping, tax &amp; parcel"
                onClick={() => {
                  clear();
                  const body: Record<string, unknown> = {
                    shippingMethod: shippingMethod || undefined,
                    useCalculated,
                  };
                  if (!useCalculated) {
                    const cents = Math.round(Number(shippingDollars) * 100);
                    if (!Number.isFinite(cents) || cents < 0) return;
                    body.shippingCostCents = cents;
                  }
                  const trimmedTax = actualTaxDollars.trim();
                  if (trimmedTax.length > 0) {
                    const taxCents = Math.round(Number(trimmedTax) * 100);
                    if (Number.isFinite(taxCents) && taxCents >= 0) {
                      body.actualTaxCents = taxCents;
                    }
                  }
                  // Parcel dimensions — each one independently. Empty stays
                  // unset; a number sets; a typo (NaN) is silently dropped.
                  for (const [key, raw] of [
                    ["parcelLengthIn", parcelLength],
                    ["parcelWidthIn", parcelWidth],
                    ["parcelHeightIn", parcelHeight],
                    ["parcelWeightOz", parcelWeight],
                  ] as const) {
                    const v = raw.trim();
                    if (v.length === 0) continue;
                    const n = Number(v);
                    if (Number.isFinite(n) && n >= 0) body[key] = n;
                  }
                  post.mutate({ path: "/shipping", body });
                }}
              >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
              <Field label="Method">
                <select
                  value={shippingMethod}
                  onChange={(e) =>
                    setShippingMethod(e.target.value as typeof shippingMethod)
                  }
                  className="h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
                >
                  <option value="">— pick a method —</option>
                  <option value="PLATFORM_FREIGHT">
                    Platform freight {liveRateCentsPerLb || freightRates.PLATFORM_FREIGHT
                      ? `(${dollars(freightRates.PLATFORM_FREIGHT ?? 0)}/lb)`
                      : ""}
                  </option>
                  <option value="BUYER_FORWARDER">
                    Buyer forwarder {freightRates.BUYER_FORWARDER != null
                      ? `(${dollars(freightRates.BUYER_FORWARDER)}/lb)`
                      : ""}
                  </option>
                  <option value="PICKUP">
                    Pickup {freightRates.PICKUP != null ? `(${dollars(freightRates.PICKUP)}/lb)` : ""}
                  </option>
                </select>
              </Field>
              <Field label="Total weight (oz)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={parcelWeight}
                  onChange={(e) => setParcelWeight(e.target.value)}
                  placeholder={r.parcelWeightOz != null ? r.parcelWeightOz.toString() : "0"}
                />
              </Field>
              <Field label="Calculated cost">
                <div className="flex h-11 items-center justify-between rounded-sm border border-line bg-cream-soft px-3 font-mono text-body tabular-nums text-ink">
                  <span>{dollars(liveCalculatedCents)}</span>
                  <span className="font-mono text-mono-label uppercase text-text-muted">
                    {liveWeightOz > 0 && liveRateCentsPerLb > 0
                      ? `${(liveWeightOz / 16).toFixed(2)} lb × ${dollars(liveRateCentsPerLb)}/lb`
                      : shippingMethod
                        ? "enter weight"
                        : "pick a method"}
                  </span>
                </div>
              </Field>
            </div>

            {/* Override toggle. Default is ON — admin trusts the system
                calc. Flipping it OFF reveals a manual cost input that
                lands in shippingCostCents instead. */}
            <div className="mt-4 flex items-start gap-3 rounded-sm border border-line bg-cream-soft p-3">
              <input
                type="checkbox"
                checked={useCalculated}
                onChange={(e) => setUseCalculated(e.target.checked)}
                id={`use-calc-${id}`}
                className="mt-1 h-4 w-4 accent-amber"
              />
              <label htmlFor={`use-calc-${id}`} className="flex-1 text-body-sm text-text">
                <span className="font-medium text-ink">Charge the calculated amount</span>
                <span className="block text-text-muted">
                  Uncheck to override with a manual cost (carrier surcharge, partner pricing, etc.).
                  Receipt always shows both numbers so the buyer sees any adjustment.
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {!useCalculated ? (
                <Field label="Override cost ($)">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={shippingDollars}
                    onChange={(e) => setShippingDollars(e.target.value)}
                    placeholder={(liveCalculatedCents / 100).toFixed(2)}
                  />
                </Field>
              ) : null}
              <Field label="Actual sales tax ($)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={actualTaxDollars}
                  onChange={(e) => setActualTaxDollars(e.target.value)}
                  placeholder={(r.estimatedTaxCents / 100).toFixed(2)}
                />
              </Field>
            </div>

            {/* Packed-parcel dimensions — captured at pack time. Used by
                the warehouse to sanity-check the carrier rate and by the
                buyer thread to show the box that's actually shipping.
                Total weight lives in the top row above so the live calc
                can reference it. */}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field label="Length (in)">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={parcelLength}
                  onChange={(e) => setParcelLength(e.target.value)}
                  placeholder="—"
                />
              </Field>
              <Field label="Width (in)">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={parcelWidth}
                  onChange={(e) => setParcelWidth(e.target.value)}
                  placeholder="—"
                />
              </Field>
              <Field label="Height (in)">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={parcelHeight}
                  onChange={(e) => setParcelHeight(e.target.value)}
                  placeholder="—"
                />
              </Field>
            </div>
          </Action>
            );
          })()
        ) : null}

        {actions.includes("finalize") ? (
          <Action
            title="Finalize reconciliation"
            description="Locks line actuals + computes the follow-up amount. Requires every line to have an actual price (or be marked unavailable with $0) and a shipping cost."
            cta="Finalize"
            disabled={post.isPending || r.shippingCostCents == null}
            onClick={() => {
              clear();
              post.mutate({ path: "/finalize" });
            }}
          />
        ) : null}

        {actions.includes("followup") ? (
          <Action
            title="Send follow-up"
            description={
              r.followupAmountCents == null
                ? "Run finalize first."
                : r.followupAmountCents > 0
                  ? "Issues a Stripe Checkout link for the buyer to pay the difference + shipping."
                  : r.followupAmountCents < 0
                    ? "Issues a Stripe refund for the difference. Caps at the original intake amount."
                    : "No money moves — short-circuits to READY_TO_SHIP."
            }
            cta={
              r.followupAmountCents == null
                ? "—"
                : r.followupAmountCents > 0
                  ? "Send checkout"
                  : r.followupAmountCents < 0
                    ? "Issue refund"
                    : "Skip (zero delta)"
            }
            disabled={post.isPending || r.followupAmountCents == null}
            onClick={() => {
              clear();
              post.mutate({
                path: "/followup/send",
                body: { message: followupNote.trim() ? followupNote.trim() : undefined },
              });
            }}
          >
            <Field label="Optional message to buyer (chat)">
              <Input
                type="text"
                value={followupNote}
                onChange={(e) => setFollowupNote(e.target.value)}
                placeholder="Anything to add to the chat with the invoice"
              />
            </Field>
          </Action>
        ) : null}

        {actions.includes("ship") ? (
          <Action
            title="Ship"
            description="Mark shipped and email the buyer with tracking."
            cta="Mark shipped"
            disabled={post.isPending || !carrier.trim() || !trackingNumber.trim()}
            onClick={() => {
              clear();
              post.mutate({
                path: "/ship",
                body: { carrier: carrier.trim(), trackingNumber: trackingNumber.trim() },
              });
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Carrier">
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="USPS" />
              </Field>
              <Field label="Tracking number">
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="9400…"
                />
              </Field>
            </div>
          </Action>
        ) : null}

        {actions.includes("cancel") ? (
          <Action
            title="Cancel"
            description="Stops the workflow. Optional refund of intake (positive amount only — partial follow-up refunds are TBD)."
            cta="Cancel request"
            danger
            disabled={post.isPending || cancelReason.trim().length < 2}
            onClick={() => {
              clear();
              post.mutate({
                path: "/cancel",
                body: { reason: cancelReason.trim(), issueRefund },
              });
            }}
          >
            <Field label="Reason (audit log)">
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this being cancelled?"
              />
            </Field>
            <label className="mt-3 flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={issueRefund}
                onChange={(e) => setIssueRefund(e.target.checked)}
                className="h-4 w-4 accent-amber"
              />
              Refund the buyer&apos;s intake payment ({dollars(r.intakeTotalCents)})
            </label>
          </Action>
        ) : null}

        {actions.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            No further admin actions for this status.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Action({
  title,
  description,
  cta,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-sm border border-line bg-cream-soft p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-body font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-body-sm text-text-muted">{description}</p>
        </div>
        <Button
          type="button"
          variant={danger ? "danger" : "primary"}
          size="sm"
          onClick={onClick}
          disabled={disabled}
        >
          {cta}
        </Button>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function statusActions(status: ShopperRequestStatus): Array<
  "start" | "shipping" | "finalize" | "followup" | "ship" | "cancel"
> {
  switch (status) {
    case "AWAITING_INTAKE_PAYMENT":
      return ["cancel"];
    case "PAID":
      return ["start", "cancel"];
    case "PROCURING":
      return ["shipping", "finalize", "cancel"];
    case "AWAITING_RECONCILIATION":
      return ["followup", "cancel"];
    case "READY_TO_SHIP":
      return ["ship", "cancel"];
    case "SHIPPED":
      return ["cancel"];
    default:
      return [];
  }
}

function isCheckoutBranch(data: unknown): data is { branch: "checkout"; payUrl: string } {
  if (!data || typeof data !== "object") return false;
  const d = data as { branch?: string; payUrl?: string };
  return d.branch === "checkout" && typeof d.payUrl === "string";
}

// ---------------------------------------------------------------------------
// Chat panel (admin side)
// ---------------------------------------------------------------------------

function ChatPanel({
  requestId,
  messages,
  onChange,
}: {
  requestId: string;
  messages: ShopperMessageSnapshot[];
  onChange: () => void;
}): JSX.Element {
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const { bannerError, handle, clear } = useApiErrorHandler();

  const post = useMutation({
    mutationFn: () =>
      api.post<ShopperMessageSnapshot>(`/admin/shopper/${requestId}/messages`, {
        body: composer.trim(),
        attachmentUrls: attachments,
      }),
    onSuccess: () => {
      setComposer("");
      setAttachments([]);
      onChange();
    },
    onError: (err) => handle(err),
  });

  return (
    <section className="flex h-full flex-col rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Conversation</h2>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      <ol className="flex max-h-[640px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <li className="text-body-sm text-text-muted">No messages yet.</li>
        ) : (
          messages.map((m) => (
            <li
              key={m.id}
              className={
                m.sender === "ADMIN"
                  ? "ml-auto max-w-[85%] rounded-sm border border-amber/40 bg-amber/5 px-4 py-3"
                  : "mr-auto max-w-[85%] rounded-sm border border-line-strong bg-cream-soft px-4 py-3"
              }
            >
              <div className="font-mono text-mono-label uppercase text-text-muted">
                {m.sender === "ADMIN" ? "You" : "Buyer"} · {fmtTime(m.createdAt)}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-body text-text">{linkify(m.body)}</p>
              {m.attachmentUrls.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {m.attachmentUrls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="font-mono text-mono-label uppercase text-amber underline-offset-2 hover:underline"
                      >
                        attachment
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))
        )}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          clear();
          // Body is required by the API schema even when attachments exist
          // — keep them aligned so the user gets a synchronous "type a
          // message" rather than a 400 round-trip.
          if (composer.trim().length === 0) return;
          post.mutate();
        }}
        className="mt-4 flex flex-col gap-3"
      >
        <textarea
          rows={3}
          maxLength={10000}
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder="Reply to buyer…"
          className="w-full rounded-sm border border-line-strong bg-cream-soft px-4 py-3 text-body text-text outline-none placeholder:text-text-subtle focus:border-ink focus:ring-2 focus:ring-ink/10"
        />
        <AttachmentUploader
          value={attachments}
          onChange={setAttachments}
          presignEndpoint={`/admin/shopper/${requestId}/uploads`}
          disabled={post.isPending}
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-mono-label uppercase text-text-muted">
            {composer.length}/10000
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={
              (composer.trim().length === 0 && attachments.length === 0) || post.isPending
            }
            loading={post.isPending}
          >
            Send message
          </Button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "amber" | "success" | "neutral";
}): JSX.Element {
  const toneClass =
    tone === "amber" ? "text-amber" : tone === "success" ? "text-success" : "text-ink";
  return (
    <div>
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div
        className={
          (emphasis ? "text-h2 font-semibold " : "text-body ") +
          "mt-1 font-mono tabular-nums " +
          toneClass
        }
      >
        {value}
      </div>
    </div>
  );
}
