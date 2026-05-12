"use client";

/**
 * Admin Shopper detail.
 *
 * Phase 2 redesign (Migration 0021) — the estimate-vs-actual reconciliation
 * flow has been retired. If a price/availability change in-store would
 * materially affect the total, admin uses the chat to ask the buyer to
 * cancel + rebook (parent-link supported) rather than mutating intake.
 *
 * One screen, three columns of work:
 *   1. Header — buyer, status, money snapshot
 *   2. Lines — per-line procurement status (no actuals capture)
 *   3. Workflow rail — status-aware action buttons:
 *        PAID                → Start procurement
 *        PROCURING           → Save shipping (method + weight + destination)
 *                              Auto → AWAITING_DELIVERY when every line is
 *                              marked purchased / unavailable.
 *        AWAITING_DELIVERY   → Mark items delivered to warehouse
 *        READY_TO_SHIP       → Ship (carrier + tracking)
 *        SHIPPED             → done
 *        any in-flight       → Cancel (footer danger zone)
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
import { BackButton } from "@/components/portal/back-button";
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
  // Migration 0021 — Phase 2 shopper redesign. Items purchased, waiting
  // for them to arrive at our warehouse before shipping onward.
  AWAITING_DELIVERY: "info",
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
        actions={
          <div className="flex items-center gap-3">
            <BackButton fallback="/admin/shopper" />
            <StatusPill tone={TONE[request.status]}>{request.status.replace(/_/g, " ")}</StatusPill>
          </div>
        }
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

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(360px,420px)] lg:items-start">
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

        {/*
          Sticky chat rail. Without this, the chat panel scrolls with
          the rest of the document — and because the left column is
          much taller (Money + Lines + Workflow + Danger zone) the
          chat would slide out of view long before the admin reaches
          the danger zone. With `lg:sticky` the panel stays glued to
          the viewport at `top-6` and gets its own height-clamp so
          the internal message scroller (inside ChatPanel) is what
          moves, not the whole page.
        */}
        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:max-h-[calc(100vh-3rem)]">
          <ChatPanel
            requestId={id}
            messages={messages}
            onChange={refresh}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money snapshot
// ---------------------------------------------------------------------------

function MoneyPanel({ request }: { request: ShopperRequestSnapshot }): JSX.Element {
  const r = request;
  // Phase 2 redesign — the row of "actuals" disappeared because intake is
  // the final cost the buyer pays. We still surface shipping cost separately
  // because it's set during procurement (after intake) and admins need to
  // know whether they've assigned a method yet.
  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Money</h2>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Items" value={dollars(r.itemsSubtotalCents)} />
        <Stat label="Service fee" value={dollars(r.commissionCents)} />
        <Stat
          label={
            r.effectiveTaxState
              ? `${r.effectiveTaxState} tax (${(r.estimatedTaxRateBps / 100).toFixed(2)}%)`
              : "Sales tax"
          }
          value={dollars(r.estimatedTaxCents)}
        />
        <Stat label="Intake total" value={dollars(r.intakeTotalCents)} emphasis />
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-3 font-mono text-mono-label uppercase text-text-muted">
        <span>Intake paid: {r.intakePaidAt ? fmtTime(r.intakePaidAt) : "—"}</span>
        <span>Shipping: {dollars(r.shippingCostCents)}</span>
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
  // Editing is gated to PROCURING — once admin has moved the request past
  // procurement (AWAITING_DELIVERY onwards) the line statuses are locked.
  // If price/availability changes after this point, admin cancels + rebooks
  // rather than mutating in place.
  const editable = status === "PROCURING";

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">
        Lines {editable ? "" : "(read-only)"}
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

      <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
        <Stat label="Lines" value={String(lines.length)} />
        <Stat label="Total units" value={String(totalUnits)} />
      </div>
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
  // Phase 2 shopper redesign — actuals reconciliation is retired. If the
  // price admin sees at the store differs from the buyer's estimate,
  // admin uses the chat to ask the buyer to cancel + rebook rather than
  // capturing actuals. So this row only carries: status, title override,
  // optional note. The Save Line button persists those three and triggers
  // the per-status notification email.
  const [procStatus, setProcStatus] = useState<ShopperLineProcurementStatus>(
    (line.procurementStatus as ShopperLineProcurementStatus) ?? "pending",
  );
  const [productTitle, setProductTitle] = useState<string>(line.productTitle ?? "");
  const [notes, setNotes] = useState<string>("");
  const { bannerError, handle, clear } = useApiErrorHandler();

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { procurementStatus: procStatus };
      if (productTitle.trim() !== (line.productTitle ?? "")) {
        body.productTitle = productTitle.trim();
      }
      if (notes.trim().length > 0) {
        body.procurementNotes = notes.trim();
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
    <li className="grid gap-3 py-4 md:grid-cols-[2fr_80px_120px_minmax(220px,1fr)]">
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
    onSuccess: () => {
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

  // Phase 2 redesign — actuals reconciliation + manual-override are retired.
  // The setShipping action accepts: method, parcel weight (pounds), optional
  // parcel dimensions, and the destination address. The receipt always
  // shows weight × rate so the buyer can see exactly what was charged.
  const [shippingMethod, setShippingMethod] = useState<"" | "PLATFORM_FREIGHT" | "BUYER_FORWARDER" | "PICKUP">(
    (r.shippingMethod as "" | "PLATFORM_FREIGHT" | "BUYER_FORWARDER" | "PICKUP") ?? "",
  );
  // Weight is captured in pounds (LB). The backend persists ounces so the
  // receipt and rate-card math line up, so we convert at submit time:
  //     pounds × 16 = ounces.
  const [parcelWeightLb, setParcelWeightLb] = useState(
    r.parcelWeightOz != null ? (r.parcelWeightOz / 16).toFixed(2) : "",
  );
  const [parcelLength, setParcelLength] = useState(
    r.parcelLengthIn != null ? r.parcelLengthIn.toString() : "",
  );
  const [parcelWidth, setParcelWidth] = useState(
    r.parcelWidthIn != null ? r.parcelWidthIn.toString() : "",
  );
  const [parcelHeight, setParcelHeight] = useState(
    r.parcelHeightIn != null ? r.parcelHeightIn.toString() : "",
  );
  // Destination address — pre-populated from the request if intake captured
  // it, otherwise blank so admin can paste from the chat. Saved alongside
  // shipping so the label/receipt always have the latest version.
  const [destRecipientName, setDestRecipientName] = useState(
    r.shippingAddress?.recipientName ?? r.buyerName ?? "",
  );
  const [destLine1, setDestLine1] = useState(r.shippingAddress?.line1 ?? "");
  const [destLine2, setDestLine2] = useState(r.shippingAddress?.line2 ?? "");
  const [destCity, setDestCity] = useState(r.shippingAddress?.city ?? "");
  const [destState, setDestState] = useState(r.shippingAddress?.state ?? "");
  const [destPostalCode, setDestPostalCode] = useState(r.shippingAddress?.postalCode ?? "");
  const [destCountry, setDestCountry] = useState(r.shippingAddress?.country ?? "US");

  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [issueRefund, setIssueRefund] = useState(true);

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Workflow</h2>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner
            error={bannerError}
            onAction={(handler) => {
              if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
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
            //   cost (cents) = pounds × rate_cents_per_lb
            // We display the result so the operator can sanity-check
            // before saving. The server recomputes from the same map so
            // the number on screen is the number the buyer is charged.
            const liveWeightLb = (() => {
              const n = Number(parcelWeightLb);
              return Number.isFinite(n) && n >= 0 ? n : 0;
            })();
            const liveRateCentsPerLb = shippingMethod
              ? freightRates[shippingMethod] ?? 0
              : 0;
            const liveCalculatedCents =
              liveWeightLb > 0
                ? Math.round(liveWeightLb * liveRateCentsPerLb)
                : 0;
            // Save is disabled unless every required field is filled —
            // destination + method + a positive weight. Dimensions stay
            // optional.
            const destReady =
              destRecipientName.trim().length > 0 &&
              destLine1.trim().length > 0 &&
              destCity.trim().length > 0 &&
              /^[A-Za-z]{2}$/.test(destState.trim()) &&
              destPostalCode.trim().length > 0;
            const shipReady = !!shippingMethod && liveWeightLb > 0 && destReady;
            return (
              <Action
                title="Save shipping"
                description="Pick a method, enter parcel weight in pounds, and the destination. The system multiplies pounds × per-lb rate to compute shipping; the receipt always shows both numbers so the buyer can audit. Parcel dimensions are optional but recommended for the warehouse."
                disabled={post.isPending || !shipReady}
                cta="Yes, save"
                onClick={() => {
                  clear();
                  const body: Record<string, unknown> = {
                    shippingMethod: shippingMethod || undefined,
                    // Phase 2 redesign — admin no longer overrides the
                    // calculated cost. Always opt into the server's
                    // weight × rate math.
                    useCalculated: true,
                  };
                  // Backend persists ounces — convert pounds at the wire.
                  body.parcelWeightOz = Math.round(liveWeightLb * 16 * 100) / 100;
                  for (const [key, raw] of [
                    ["parcelLengthIn", parcelLength],
                    ["parcelWidthIn", parcelWidth],
                    ["parcelHeightIn", parcelHeight],
                  ] as const) {
                    const v = raw.trim();
                    if (v.length === 0) continue;
                    const n = Number(v);
                    if (Number.isFinite(n) && n >= 0) body[key] = n;
                  }
                  body.shippingAddress = {
                    recipientName: destRecipientName.trim(),
                    line1: destLine1.trim(),
                    line2: destLine2.trim() || undefined,
                    city: destCity.trim(),
                    state: destState.trim().toUpperCase(),
                    postalCode: destPostalCode.trim(),
                    country: (destCountry.trim() || "US").toUpperCase(),
                  };
                  post.mutate({ path: "/shipping", body });
                }}
              >
                <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr]">
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
                        Platform freight {freightRates.PLATFORM_FREIGHT != null
                          ? `(${dollars(freightRates.PLATFORM_FREIGHT)}/lb)`
                          : ""}
                      </option>
                      <option value="BUYER_FORWARDER">
                        Buyer forwarder {freightRates.BUYER_FORWARDER != null
                          ? `(${dollars(freightRates.BUYER_FORWARDER)}/lb)`
                          : ""}
                      </option>
                      <option value="PICKUP">
                        Pickup {freightRates.PICKUP != null
                          ? `(${dollars(freightRates.PICKUP)}/lb)`
                          : ""}
                      </option>
                    </select>
                  </Field>
                  <Field label="Total weight (lb)">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={parcelWeightLb}
                      onChange={(e) => setParcelWeightLb(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Calculated cost">
                    <div className="flex h-11 items-center justify-between rounded-sm border border-line bg-cream-soft px-3 font-mono text-body tabular-nums text-ink">
                      <span>{dollars(liveCalculatedCents)}</span>
                      <span className="font-mono text-mono-label uppercase text-text-muted">
                        {liveWeightLb > 0 && liveRateCentsPerLb > 0
                          ? `${liveWeightLb.toFixed(2)} lb × ${dollars(liveRateCentsPerLb)}/lb`
                          : shippingMethod
                            ? "enter weight"
                            : "pick a method"}
                      </span>
                    </div>
                  </Field>
                </div>

                <div className="mt-4">
                  <h4 className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                    Destination address
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Recipient name">
                      <Input
                        type="text"
                        value={destRecipientName}
                        onChange={(e) => setDestRecipientName(e.target.value)}
                        placeholder="Jane Doe"
                      />
                    </Field>
                    <Field label="Country (ISO 2)">
                      <Input
                        type="text"
                        maxLength={2}
                        value={destCountry}
                        onChange={(e) => setDestCountry(e.target.value.toUpperCase())}
                        placeholder="US"
                      />
                    </Field>
                    <Field label="Address line 1" className="md:col-span-2">
                      <Input
                        type="text"
                        value={destLine1}
                        onChange={(e) => setDestLine1(e.target.value)}
                        placeholder="123 Main St"
                      />
                    </Field>
                    <Field label="Address line 2 (optional)" className="md:col-span-2">
                      <Input
                        type="text"
                        value={destLine2}
                        onChange={(e) => setDestLine2(e.target.value)}
                        placeholder="Apt, suite, unit…"
                      />
                    </Field>
                    <Field label="City">
                      <Input
                        type="text"
                        value={destCity}
                        onChange={(e) => setDestCity(e.target.value)}
                        placeholder="Brooklyn"
                      />
                    </Field>
                    <Field label="State (2-letter)">
                      <Input
                        type="text"
                        maxLength={2}
                        value={destState}
                        onChange={(e) => setDestState(e.target.value.toUpperCase())}
                        placeholder="NY"
                      />
                    </Field>
                    <Field label="Postal code">
                      <Input
                        type="text"
                        value={destPostalCode}
                        onChange={(e) => setDestPostalCode(e.target.value)}
                        placeholder="11201"
                      />
                    </Field>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                    Parcel dimensions (optional)
                  </h4>
                  <div className="grid gap-3 md:grid-cols-3">
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
                </div>
              </Action>
            );
          })()
        ) : null}

        {actions.includes("delivered_to_warehouse") ? (
          <Action
            title="Items delivered to warehouse"
            description="Use this once every line has physically arrived and is ready to pack. Moves the request to READY_TO_SHIP so you can buy a label."
            cta="Mark delivered to warehouse"
            disabled={post.isPending}
            onClick={() => {
              clear();
              post.mutate({ path: "/delivered-to-warehouse" });
            }}
          />
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

        {actions.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            No further admin actions for this status.
          </p>
        ) : null}

        {/* Danger zone footer — cancel is always last and visually
            separated so it isn't reached for accidentally. */}
        {actions.includes("cancel") ? (
          <div className="mt-2 rounded-sm border border-error/30 bg-error/5 p-4">
            <h3 className="font-mono text-mono-label uppercase text-error">Danger zone</h3>
            <p className="mt-1 text-body-sm text-text-muted">
              Cancelling stops the workflow. Optionally refund the buyer&apos;s intake payment
              ({dollars(r.intakeTotalCents)}).
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="Reason (audit log)">
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Why is this being cancelled?"
                />
              </Field>
              <div className="flex items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  id={`refund-toggle-${id}`}
                  checked={issueRefund}
                  onChange={(e) => setIssueRefund(e.target.checked)}
                  className="h-4 w-4 accent-amber"
                />
                <label htmlFor={`refund-toggle-${id}`}>
                  Refund the buyer&apos;s intake payment ({dollars(r.intakeTotalCents)})
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={post.isPending || cancelReason.trim().length < 2}
                  onClick={() => {
                    clear();
                    post.mutate({
                      path: "/cancel",
                      body: { reason: cancelReason.trim(), issueRefund },
                    });
                  }}
                >
                  Cancel request
                </Button>
              </div>
            </div>
          </div>
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
  "start" | "shipping" | "delivered_to_warehouse" | "ship" | "cancel"
> {
  switch (status) {
    case "AWAITING_INTAKE_PAYMENT":
      return ["cancel"];
    case "PAID":
      return ["start", "cancel"];
    case "PROCURING":
      // Phase 2 redesign — shipping form is always visible during
      // procurement. Auto-transition to AWAITING_DELIVERY happens
      // server-side when every line is purchased / unavailable.
      return ["shipping", "cancel"];
    case "AWAITING_DELIVERY":
      return ["shipping", "delivered_to_warehouse", "cancel"];
    case "AWAITING_RECONCILIATION":
      // Legacy bucket from before the redesign — pre-migration rows that
      // landed here can still be moved forward by editing shipping and
      // marking shipped.
      return ["shipping", "ship", "cancel"];
    case "READY_TO_SHIP":
      return ["ship", "cancel"];
    case "SHIPPED":
      return ["cancel"];
    default:
      return [];
  }
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
    // The wrapper sets the height-clamp; this section just fills it. We
    // also need `min-h-0` so flex children can shrink — without it the
    // child message list can't trigger overflow because its computed
    // min-content height pushes the form out of the box.
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Conversation</h2>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
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
