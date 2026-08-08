"use client";

/**
 * Start a return from the Returns tab (Returns v2).
 *
 * Two steps on one page:
 *   1. Pick an eligible order — the vendor's order history filtered to
 *      orders that have shipped (see isOrderReturnable).
 *   2. Fill the return form — reason, lines + quantities, the customer's
 *      inbound tracking + expected delivery date, optional photos — and
 *      submit. On success we go to the new return's detail page.
 *
 * This mirrors the create flow on the order detail page; both post to
 * POST /returns.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AttachmentUploader } from "@/components/portal/attachment-uploader";
import { ErrorBanner } from "@/components/errors/error-banner";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import type { PublicOrder } from "@/lib/schemas/orders";
import {
  isOrderReturnable,
  RETURN_REASON,
  RETURN_REASON_LABEL,
  type CreateReturnInput,
  type ReturnReason,
  type ReturnSnapshot,
} from "@/lib/schemas/returns";

export default function NewReturnPage(): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Vendor order history → filtered to returnable (shipped) orders.
  const ordersQ = useQuery({
    queryKey: ["orders", "returnable"],
    queryFn: () =>
      api.get<{ items: PublicOrder[]; nextCursor: string | null }>("/orders?limit=100"),
    staleTime: 30_000,
  });
  const eligible = (ordersQ.data?.items ?? []).filter((o) =>
    isOrderReturnable(o.status, o.fulfillmentMode),
  );

  // Selected order detail (for its lines).
  const orderQ = useQuery({
    queryKey: ["orders", selectedId],
    queryFn: () => api.get<PublicOrder>(`/orders/${selectedId}`),
    enabled: selectedId !== null,
  });

  const [reason, setReason] = useState<ReturnReason>("DEFECTIVE");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);

  // Seed the qty map to 0 for each line when an order loads.
  useEffect(() => {
    const o = orderQ.data;
    if (!o) return;
    const seed: Record<string, number> = {};
    for (const l of o.lines) seed[l.id] = 0;
    setQty(seed);
  }, [orderQ.data]);

  const createMut = useMutation({
    mutationFn: (body: CreateReturnInput) => api.post<ReturnSnapshot>("/returns", body),
    onMutate: () => clear(),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["returns"] });
      router.push(`/returns/${created.id}`);
    },
    onError: (err) => handle(err),
  });

  function resetForm() {
    setReason("DEFECTIVE");
    setQty({});
    setCarrier("");
    setTracking("");
    setExpectedDate("");
    setAttachments([]);
    clear();
  }

  const order = orderQ.data;
  const totalUnits = Object.values(qty).reduce((s, n) => s + n, 0);
  const canSubmit =
    !!order &&
    tracking.trim().length > 0 &&
    expectedDate.trim().length > 0 &&
    totalUnits > 0 &&
    !createMut.isPending;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="  Returns"
        title="Start a return"
        description="Pick a shipped order, then tell us what's coming back."
        actions={<BackButton fallback="/returns" />}
      />

      {/* Step 1 — order picker */}
      {selectedId === null ? (
        <section className="rounded-md border border-line bg-white p-6">
          <h2 className="font-mono text-mono-label uppercase text-text-muted">
            Pick an order
          </h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Only orders that have shipped can be returned. Don&apos;t see one? It may not have shipped
            yet.
          </p>
          {ordersQ.isLoading ? (
            <div className="mt-4 text-body-sm text-text-muted">Loading your orders…</div>
          ) : eligible.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No returnable orders"
                description="Once an order ships (delivered, or handed to your carrier) it'll show up here."
              />
            </div>
          ) : (
            <div className="mt-4">
              <DataTable>
                <THead>
                  <Th>Order</Th>
                  <Th>Recipient</Th>
                  <Th>Status</Th>
                  <Th>Placed</Th>
                  <Th align="right">{""}</Th>
                </THead>
                <TBody>
                  {eligible.map((o) => (
                    <TR key={o.id}>
                      <Td mono>#{o.orderNumber}</Td>
                      <Td>{o.recipient.name}</Td>
                      <Td>
                        <StatusPill tone="success">{o.status.replace(/_/g, " ")}</StatusPill>
                      </Td>
                      <Td className="text-text-muted">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </Td>
                      <Td align="right">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            resetForm();
                            setSelectedId(o.id);
                          }}
                        >
                          Select
                        </Button>
                      </Td>
                    </TR>
                  ))}
                </TBody>
              </DataTable>
            </div>
          )}
        </section>
      ) : (
        /* Step 2 — return form for the selected order */
        <section className="flex flex-col gap-5 rounded-md border border-line bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-h3 font-semibold text-ink">
              Return for order{" "}
              <span className="font-mono">#{order?.orderNumber ?? "…"}</span>
            </h2>
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedId(null);
                resetForm();
              }}
            >
              ← Pick a different order
            </Button>
          </div>

          {orderQ.isLoading || !order ? (
            <div className="text-body-sm text-text-muted">Loading order…</div>
          ) : (
            <>
              <Field label="Reason">
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReturnReason)}
                  className="h-11 w-full rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
                >
                  {RETURN_REASON.map((r) => (
                    <option key={r} value={r}>
                      {RETURN_REASON_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Return carrier (optional)">
                  <Input
                    type="text"
                    placeholder="USPS, UPS, FedEx…"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                  />
                </Field>
                <Field label="Return tracking number">
                  <Input
                    type="text"
                    placeholder="e.g. 1Z999AA10123456784"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                  />
                </Field>
                <Field label="Expected delivery date">
                  <Input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                  />
                </Field>
              </div>

              <div>
                <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                  Pick lines
                </div>
                <p className="mb-3 text-body-sm text-text-muted">
                  Set the quantity to return for each line. Leave at 0 to skip.
                </p>
                <DataTable>
                  <THead>
                    <Th>SKU</Th>
                    <Th>Product</Th>
                    <Th align="right">Ordered</Th>
                    <Th align="right">Return qty</Th>
                  </THead>
                  <TBody>
                    {order.lines.map((l) => (
                      <TR key={l.id}>
                        <Td mono>{l.skuId}</Td>
                        <Td>
                          {l.productName} <span className="text-text-muted">({l.variant})</span>
                        </Td>
                        <Td num>{l.quantity}</Td>
                        <Td align="right">
                          <Input
                            type="number"
                            min={0}
                            max={l.quantity}
                            value={String(qty[l.id] ?? 0)}
                            onChange={(e) => {
                              const n = Math.max(
                                0,
                                Math.min(l.quantity, Math.floor(Number(e.target.value) || 0)),
                              );
                              setQty((prev) => ({ ...prev, [l.id]: n }));
                            }}
                            className="ml-auto h-9 w-24 text-right"
                          />
                        </Td>
                      </TR>
                    ))}
                  </TBody>
                </DataTable>
              </div>

              <div>
                <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                  Photo evidence (optional)
                </div>
                <AttachmentUploader
                  value={attachments}
                  onChange={setAttachments}
                  presignEndpoint="/returns/uploads"
                  disabled={createMut.isPending}
                />
              </div>

              <ErrorBanner error={bannerError} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-body-sm text-text-muted">
                  {totalUnits} unit(s) · a processing fee applies when we receive the return.
                </span>
                <Button
                  variant="amber"
                  loading={createMut.isPending}
                  disabled={!canSubmit}
                  onClick={() => {
                    const lines = order.lines
                      .map((l) => ({ orderLineId: l.id, requestedQty: qty[l.id] ?? 0 }))
                      .filter((line) => line.requestedQty > 0);
                    if (lines.length === 0) return;
                    createMut.mutate({
                      orderId: order.id,
                      reason,
                      lines,
                      inboundCarrier: carrier.trim() || undefined,
                      inboundTracking: tracking.trim(),
                      expectedDeliveryDate: expectedDate,
                      attachmentUrls: attachments,
                    });
                  }}
                >
                  {createMut.isPending ? "Opening RMA…" : "Open return"}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
