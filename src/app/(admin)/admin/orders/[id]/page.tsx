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
  EXCEPTION: "error",
  CANCELLED: "error",
};

const NEXT_ACTION: Record<string, { label: string; endpoint: string } | null> = {
  ALLOCATED: { label: "Buy carrier label", endpoint: "purchase-label" },
  LABEL_PURCHASED: { label: "Start picking", endpoint: "pick" },
  PICKING: { label: "Mark packed", endpoint: "pack" },
  PACKED: { label: "Hand to carrier (ship)", endpoint: "ship" },
};

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
  const next = NEXT_ACTION[o.status] ?? null;

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
          {o.carrierService ? <span className="font-mono text-body-sm text-text-muted">{o.carrierService}</span> : null}
          {o.trackingNumber ? (
            <span className="font-mono text-body-sm text-text">Tracking: {o.trackingNumber}</span>
          ) : null}
          {o.labelUrl ? <LabelLink labelUrl={o.labelUrl} /> : null}
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

      {next ? (
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
