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
  status: "AWAITING_RECEIPT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "DISCREPANCY" | "CANCELLED" | "SUBMITTED" | "DRAFT";
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
              Complete receiving
            </Button>
          ) : (
            <span className="font-mono text-mono-label uppercase text-text-muted">No actions remaining</span>
          )}
        </div>
      </section>
    </div>
  );
}

