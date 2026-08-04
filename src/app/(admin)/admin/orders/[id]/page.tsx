"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { ErrorBanner } from "@/components/errors/error-banner";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";

interface AdminOrderDetail {
  id: string;
  orderNumber: number;
  status: string;
  externalReference: string | null;
  recipientName: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  shipAddressLine1: string;
  shipAddressLine2: string | null;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
  carrier: string | null;
  carrierService: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  totalChargedCents: number;
  shippingFeeCents: number;
  fulfillmentFeeCents: number;
  insuranceFeeCents: number;
  vendor: { id: string; businessName: string };
  /**
   * Migration 0037 — branches the entire fulfillment workflow:
   *   - PLATFORM_SHIP: USA Errands buys the Shippo label, operator runs
   *     purchase-label → pick → pack → ship.
   *   - VENDOR_CARRIER: vendor supplies their own carrier + tracking +
   *     optional label URL. Operator skips purchase-label and finishes
   *     with markHandedOff instead of ship.
   * Server defaults to PLATFORM_SHIP for pre-migration rows so the
   * field is always present on the wire.
   */
  fulfillmentMode: "PLATFORM_SHIP" | "VENDOR_CARRIER";
  vendorCarrierName: string | null;
  vendorTrackingNumber: string | null;
  vendorLabelUrl: string | null;
  handedOffAt: string | null;
  // Phase T1 — surfaced from the backend admin projection so the
  // next-step panel can branch v1 vs v2. Every order gets this
  // field (DB default = 1); no null case to handle.
  workflowVersion: number;
  // Phase O + Phase P-E — vendor-visible packaging summary (also
  // useful on the admin detail page). All null until the warehouse
  // records pack. `packagingLabel` reads either the library preset's
  // label, the Shippo carrier template's friendly name, or null for
  // pure ad-hoc packaging.
  packedLengthIn: number | null;
  packedWidthIn: number | null;
  packedHeightIn: number | null;
  packedWeightOz: number | null;
  packedAt: string | null;
  packagingLabel: string | null;
  shippingCostCents: number;
  lines: Array<{
    id: string;
    skuId: string;
    productCode: string;
    productName: string;
    variant: string;
    quantity: number;
    declaredValueCents: number;
    allocationStatus: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    description: string;
    source: string;
    occurredAt: string;
  }>;
}

const TONE: Record<string, "neutral" | "info" | "success" | "warning" | "error"> = {
  ALLOCATED: "info",
  LABEL_PURCHASED: "info",
  PICKING: "warning",
  PACKED: "warning",
  SHIPPED: "info",
  IN_TRANSIT: "info",
  DELIVERED: "success",
  // Migration 0037 — terminal success state for VENDOR_CARRIER orders.
  HANDED_OFF: "success",
  EXCEPTION: "error",
  CANCELLED: "error",
};

/**
 * Migration 0037 + Phase T2 — pick the next operator action based on:
 *   - status
 *   - fulfillmentMode (Migration 0037 branch: PLATFORM_SHIP vs
 *     VENDOR_CARRIER)
 *   - workflowVersion (Phase T2 branch: v1 legacy ladder vs v2
 *     pack-before-label ladder)
 *
 * Two return shapes:
 *
 *   { kind: "primary", ... }  — a single required next step. Renders
 *                               as the amber CTA card with a large
 *                               button on the right.
 *
 *   { kind: "advisory", ... } — no required next click; the order has
 *                               already reached the state where the
 *                               operator's job is a physical action
 *                               (drop box at carrier) that the system
 *                               will observe via webhook. Optional
 *                               secondary button for "notify now
 *                               without waiting for the carrier scan."
 *
 *   null                      — nothing to show (order is terminal or
 *                               in a state the admin can't advance).
 *
 * The v2 branch matters because in v2 the box is already packed BEFORE
 * the label is bought (OrderPackService.recordPack runs during
 * PENDING_PACKING → PACKING_COMPLETED). Walking a v2 order through
 * LABEL_PURCHASED → PICKING → PACKED → SHIPPED with the legacy buttons
 * is ceremonial — those transitions succeed at the DB level but
 * describe work the warehouse already did.
 */
type NextAction =
  | { kind: "primary"; label: string; endpoint: string }
  | {
      kind: "advisory";
      title: string;
      body: string;
      secondary?: { label: string; endpoint: string; hint: string };
    };

function getNextAction(
  status: string,
  fulfillmentMode: AdminOrderDetail["fulfillmentMode"],
  workflowVersion: number,
): NextAction | null {
  if (fulfillmentMode === "VENDOR_CARRIER") {
    if (status === "ALLOCATED")
      return { kind: "primary", label: "Start picking", endpoint: "pick" };
    if (status === "PICKING")
      return { kind: "primary", label: "Mark packed", endpoint: "pack" };
    if (status === "PACKED")
      return { kind: "primary", label: "Mark handed off", endpoint: "handed-off" };
    return null;
  }

  // v2 (workflowVersion=2) — pack happens BEFORE label buy, so once
  // we reach LABEL_PURCHASED the only remaining physical step is
  // handing the box to the carrier. The Shippo tracking webhook
  // auto-advances to IN_TRANSIT the moment the carrier first scans;
  // no operator click is required. The optional "Mark handed off
  // now" button fires the legacy ship() endpoint (still wired) so
  // the vendor gets the shipped notification immediately instead of
  // waiting up to a few hours for the carrier scan.
  if (workflowVersion === 2 && status === "LABEL_PURCHASED") {
    return {
      kind: "advisory",
      title: "Ready for carrier hand-off",
      body: "Take the packed box to the carrier. The order will auto-advance to In transit when they scan it, and the vendor will be notified automatically. No click required.",
      secondary: {
        label: "Mark handed off now",
        endpoint: "ship",
        hint: "Sends the vendor a shipped notification immediately instead of waiting for the carrier's first scan.",
      },
    };
  }

  // Legacy v1 ladder — retained for historical / replay orders. Zero
  // v1 orders exist in production right now (per Phase I abolition),
  // but the code stays so a dev-mode replay of an archived v1 order
  // still walks through the operator UI predictably.
  if (status === "ALLOCATED")
    return { kind: "primary", label: "Buy carrier label", endpoint: "purchase-label" };
  if (status === "LABEL_PURCHASED")
    return { kind: "primary", label: "Start picking", endpoint: "pick" };
  if (status === "PICKING")
    return { kind: "primary", label: "Mark packed", endpoint: "pack" };
  if (status === "PACKED")
    return { kind: "primary", label: "Hand to carrier (ship)", endpoint: "ship" };
  return null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();

  const orderQ = useQuery({
    queryKey: ["admin", "orders", params.id],
    queryFn: () => api.get<AdminOrderDetail>(`/admin/orders/${params.id}`),
    enabled: !!params.id,
  });

  const { bannerError, handle, clear } = useApiErrorHandler();

  const action = useMutation({
    mutationFn: (endpoint: string) => api.post<AdminOrderDetail>(`/admin/orders/${params.id}/${endpoint}`, {}),
    onMutate: clear,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
  }

  if (orderQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (orderQ.error || !orderQ.data) {
    const normalized = orderQ.error ? normalizeError(orderQ.error) : null;
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "Order not found"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "The order may have been deleted or you don't have access."}
        </p>
      </div>
    );
  }
  const o = orderQ.data;
  const next = getNextAction(o.status, o.fulfillmentMode, o.workflowVersion);
  const isVendorCarrier = o.fulfillmentMode === "VENDOR_CARRIER";

  // Migration 0037 — the meta row (under the status pill) needs to render
  // the right "carrier" string per branch. For VENDOR_CARRIER we prefer
  // the vendor-typed name; for PLATFORM_SHIP we keep using the Shippo
  // carrier service. Tracking number falls through the same hierarchy
  // because `order.service.ts` mirrors vendorTrackingNumber onto the
  // canonical `trackingNumber` column at create time.
  const displayCarrier = isVendorCarrier
    ? (o.vendorCarrierName?.trim() || o.carrier || o.carrierService || "Vendor label")
    : o.carrierService;
  const displayTracking = isVendorCarrier
    ? (o.vendorTrackingNumber?.trim() || o.trackingNumber)
    : o.trackingNumber;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`  Fulfillment / #${o.orderNumber}`}
        title={`Order #${o.orderNumber}`}
        description={[
          `${o.vendor.businessName} → ${o.recipientName}, ${o.shipCity}, ${o.shipState}`,
          o.externalReference ? `vendor ref: ${o.externalReference}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={<BackButton fallback="/admin/orders" label="← Queue" />}
      />

      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <StatusPill tone={TONE[o.status] ?? "neutral"}>{o.status.replace(/_/g, " ")}</StatusPill>
          {isVendorCarrier ? (
            // Migration 0037 — make the branch unmistakable at the top of
            // the page so operators don't go looking for a Shippo label
            // that doesn't exist.
            <span
              className="inline-flex items-center rounded-sm border border-amber/30 bg-amber/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-amber"
              title="Vendor brought their own carrier label — no Shippo label was bought for this order."
            >
              Fulfillment only · vendor carrier
            </span>
          ) : null}
          {displayCarrier ? (
            <span className="font-mono text-body-sm text-text-muted">{displayCarrier}</span>
          ) : null}
          {displayTracking ? (
            <span className="font-mono text-body-sm text-text">Tracking: {displayTracking}</span>
          ) : null}
          {/* Label link branches: VENDOR_CARRIER orders may carry a
              vendor-supplied URL (uploaded PDF); PLATFORM_SHIP orders
              carry a Shippo-issued labelUrl. The two are mutually
              exclusive at the DB layer (different columns) but rendered
              by the same primitive. */}
          {isVendorCarrier && o.vendorLabelUrl ? (
            <VendorLabelLink labelUrl={o.vendorLabelUrl} />
          ) : null}
          {!isVendorCarrier && o.labelUrl ? <LabelLink labelUrl={o.labelUrl} /> : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">Ship to</div>
            <div className="mt-1 text-body text-text">{o.recipientName}</div>
            <div className="font-mono text-body-sm text-text-muted">
              {o.shipAddressLine1}
              {o.shipAddressLine2 ? ` · ${o.shipAddressLine2}` : ""}
              <br />
              {o.shipCity}, {o.shipState} {o.shipPostalCode} · {o.shipCountry}
            </div>
            {o.recipientPhone ? <div className="font-mono text-body-sm text-text-muted">{o.recipientPhone}</div> : null}
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
              <dt className="text-h3 font-semibold text-ink">Total charged</dt>
              <dd className="text-right text-h3 font-semibold text-ink">{formatCents(o.totalChargedCents)}</dd>
            </dl>
          </div>
        </div>
      </section>

      {/* Phase P-E — packaging summary for admin. Renders only after
          the warehouse recorded the pack. Read-only. Same data
          exposed to vendors on their own /orders/[id] page. Sits
          BETWEEN header/money and the action bar so an admin looking
          up a past order sees box + carrier + shipping cost without
          scrolling. */}
      {o.packedAt ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="font-mono text-mono-label uppercase text-text-muted">
            Packaging &amp; shipment
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 font-mono text-body-sm md:grid-cols-4">
            <dt className="text-text-muted">Packaging</dt>
            <dd className="text-text md:col-span-3">
              {o.packagingLabel ?? "Custom (no preset)"}
            </dd>
            {o.packedLengthIn !== null &&
            o.packedWidthIn !== null &&
            o.packedHeightIn !== null ? (
              <>
                <dt className="text-text-muted">Box (L × W × H)</dt>
                <dd className="text-text">
                  {o.packedLengthIn} × {o.packedWidthIn} × {o.packedHeightIn} in
                </dd>
              </>
            ) : null}
            {o.packedWeightOz !== null ? (
              <>
                <dt className="text-text-muted">Weight</dt>
                <dd className="text-text">
                  {o.packedWeightOz} oz
                  {o.packedWeightOz >= 16
                    ? ` (~${(o.packedWeightOz / 16).toFixed(1)} lb)`
                    : ""}
                </dd>
              </>
            ) : null}
            {o.carrier ? (
              <>
                <dt className="text-text-muted">Carrier</dt>
                <dd className="text-text">
                  {o.carrier}
                  {o.carrierService ? ` · ${o.carrierService}` : ""}
                </dd>
              </>
            ) : null}
            {o.shippingCostCents > 0 ? (
              <>
                <dt className="text-text-muted">Shipping charged</dt>
                <dd className="text-text">
                  {formatCents(o.shippingCostCents)}
                </dd>
              </>
            ) : null}
            {o.trackingNumber ? (
              <>
                <dt className="text-text-muted">Tracking</dt>
                <dd className="text-text">
                  <span className="font-mono">{o.trackingNumber}</span>
                  {o.labelUrl ? (
                    <>
                      {" · "}
                      <a
                        href={o.labelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Open label →
                      </a>
                    </>
                  ) : null}
                </dd>
              </>
            ) : null}
            {/* Phase T1 — force "Packed at" onto its own row starting
                at column 1. Without `md:col-start-1` the label gets
                pushed into column 3 by the preceding Tracking dd,
                and its own `md:col-span-3` dd wraps to the next line
                — the visible bug in the earlier screenshot where the
                timestamp appeared unattached to any label. */}
            <dt className="text-text-muted md:col-start-1">Packed at</dt>
            <dd className="text-text-muted md:col-span-3">
              {new Date(o.packedAt).toLocaleString()}
            </dd>
          </dl>
        </section>
      ) : null}

      {next ? (
        next.kind === "primary" ? (
          <section className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-mono text-mono-label uppercase text-amber">Next step</div>
                <div className="mt-1 text-body text-text">{next.label}</div>
              </div>
              <Button
                variant="amber"
                loading={action.isPending}
                onClick={() => action.mutate(next.endpoint)}
                withArrow
              >
                {next.label}
              </Button>
            </div>
            <div className="mt-3">
              <ErrorBanner error={bannerError} onAction={onAction} />
            </div>
          </section>
        ) : (
          // Phase T2 — advisory card. Renders instead of the amber CTA
          // when the order has reached a state where the operator has
          // no required click. Keeps the same left-border color for
          // visual continuity so the operator's eye still lands on
          // this region when scanning the page.
          <section className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="font-mono text-mono-label uppercase text-amber">
                  {next.title}
                </div>
                <p className="mt-1 text-body text-text">{next.body}</p>
              </div>
              {next.secondary ? (
                <div className="flex flex-col items-end gap-1">
                  <Button
                    variant="outline"
                    loading={action.isPending}
                    onClick={() =>
                      next.secondary
                        ? action.mutate(next.secondary.endpoint)
                        : undefined
                    }
                  >
                    {next.secondary.label}
                  </Button>
                  <span
                    className="text-body-sm text-text-muted"
                    title={next.secondary.hint}
                  >
                    optional
                  </span>
                </div>
              ) : null}
            </div>
            <div className="mt-3">
              <ErrorBanner error={bannerError} onAction={onAction} />
            </div>
          </section>
        )
      ) : null}

      {!next ? <ErrorBanner error={bannerError} onAction={onAction} /> : null}

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
          {o.events.length === 0 ? (
            <li className="text-text-subtle">No events yet.</li>
          ) : (
            o.events.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3">
                <span className="text-text-subtle">{new Date(e.occurredAt).toLocaleString()}</span>
                <span className="text-text">· [{e.source}] {e.description}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

/**
 * The EasyPost integration is currently in stub mode (see
 * `easypost.service.ts:purchaseLabel`). It synthesizes a labelUrl pointing
 * at `https://stub.easypost.local/...` which doesn't resolve in any
 * browser — clicking it makes the tab hang on DNS lookup forever, exactly
 * the symptom you reported.
 *
 * Until real EasyPost credentials are wired in, we render a clearly-marked
 * "Stub mode" pill instead of a broken external link. Real labelUrls
 * (carrier-issued PDFs over https) still open in a new tab the normal way.
 */
function LabelLink({ labelUrl }: { labelUrl: string }): JSX.Element {
  const isStub = labelUrl.includes("stub.easypost.local");
  if (isStub) {
    return (
      <span
        className="rounded-sm border border-amber bg-amber/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-amber"
        title="Carrier integration is in stub mode. Real label PDFs appear here once EasyPost credentials are configured in the API environment."
      >
        Stub label · no PDF in dev
      </span>
    );
  }
  return (
    <a
      href={labelUrl}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
    >
      Open label PDF →
    </a>
  );
}

/**
 * Migration 0037 — renders the vendor-supplied label URL for VENDOR_CARRIER
 * orders. The URL is collected at order creation (a Cloudflare R2 upload
 * routed through the same AttachmentUploader the rest of the app uses),
 * so we can safely use it as `href`. We still defend with rel="noreferrer"
 * + target="_blank" to keep the admin session boundary intact.
 *
 * No stub-host check needed here — the value originates from our own R2
 * bucket and the upload endpoint already rejects anything else. If a row
 * somehow has an off-domain URL (data migration / manual SQL), we render
 * a non-clickable badge instead of letting the operator follow it blind.
 */
function VendorLabelLink({ labelUrl }: { labelUrl: string }): JSX.Element {
  let host: string | null = null;
  try {
    host = new URL(labelUrl).host;
  } catch {
    host = null;
  }
  // Defence in depth: the upload endpoint stores R2-issued URLs only, so
  // anything not on a recognized hostname is suspicious and should not
  // become a one-click link from the admin console.
  const looksTrusted =
    !!host &&
    (host.endsWith(".r2.cloudflarestorage.com") ||
      host.endsWith(".r2.dev") ||
      host.endsWith("myusaerrands.com"));
  if (!looksTrusted) {
    return (
      <span
        className="rounded-sm border border-amber bg-amber/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-amber"
        title="Label URL is outside the platform's storage bucket — open it from the vendor's own systems if needed."
      >
        Vendor label · external URL
      </span>
    );
  }
  return (
    <a
      href={labelUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
    >
      Open vendor label →
    </a>
  );
}
