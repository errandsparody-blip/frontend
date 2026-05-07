"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api, type ApiError } from "@/lib/api-client";
import type { PublicProduct } from "@/lib/schemas/products";
import type { PsnStatus, PublicPsn } from "@/lib/schemas/psn";

const TONE: Record<PsnStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  AWAITING_RECEIPT: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  DISCREPANCY: "warning",
  CANCELLED: "error",
};

export default function PsnDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: psn, isLoading, error } = useQuery({
    queryKey: ["psns", params.id],
    queryFn: () => api.get<PublicPsn>(`/psns/${params.id}`),
    enabled: !!params.id,
  });

  // Pull products for human-readable line labels.
  const productsQ = useQuery({
    queryKey: ["products", { all: true }],
    queryFn: () =>
      api.get<{ items: PublicProduct[]; nextCursor: string | null }>("/products?limit=200"),
    enabled: !!psn,
  });
  const productById = new Map((productsQ.data?.items ?? []).map((p) => [p.id, p]));

  const submitMut = useMutation({
    mutationFn: () => {
      // PSN submit debits the wallet — Idempotency-Key required by the API.
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return api.post<PublicPsn>(`/psns/${params.id}/submit`, undefined, { idempotencyKey });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["psns"] });
      await qc.invalidateQueries({ queryKey: ["psns", params.id] });
    },
    onError: (err) => setActionError((err as ApiError).message),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post<PublicPsn>(`/psns/${params.id}/cancel`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["psns"] });
      await qc.invalidateQueries({ queryKey: ["psns", params.id] });
    },
    onError: (err) => setActionError((err as ApiError).message),
  });

  if (isLoading) return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  if (error || !psn) {
    return (
      <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
        {(error as { message?: string })?.message ?? "PSN not found."}
      </div>
    );
  }

  const isDraft = psn.status === "DRAFT";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`[04] PSN / ${psn.id.slice(0, 8)}`}
        title={`Pre-Shipment Notice ${psn.id.slice(0, 8)}`}
        description={
          psn.submittedAt
            ? `Submitted ${new Date(psn.submittedAt).toLocaleDateString()}.`
            : "Saved as draft."
        }
        actions={<StatusPill tone={TONE[psn.status]}>{psn.status.replace(/_/g, " ")}</StatusPill>}
      />

      {actionError ? (
        <div role="alert" className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error">
          {actionError}
        </div>
      ) : null}

      {/* Summary panel */}
      <section className="grid gap-6 rounded-md border border-line bg-white p-6 md:grid-cols-3">
        <Stat label="Carrier" value={psn.carrier ?? "—"} />
        <Stat label="Master tracking" value={psn.masterTracking ?? "—"} mono />
        <Stat
          label="Expected"
          value={psn.expectedArrivalDate ? new Date(psn.expectedArrivalDate).toLocaleDateString() : "—"}
        />
        <Stat
          label="Onboarding fee"
          value={
            psn.onboardingFeeCents !== null ? `$${(psn.onboardingFeeCents / 100).toFixed(2)}` : "—"
          }
          highlight
        />
        <Stat label="Submitted" value={psn.submittedAt ? new Date(psn.submittedAt).toLocaleString() : "—"} />
        <Stat label="Received" value={psn.receivedAt ? new Date(psn.receivedAt).toLocaleString() : "—"} />
      </section>

      {/* Box counts */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Declared boxes</h2>
        <div className="flex flex-wrap gap-4">
          {Object.entries(psn.declaredBoxCounts).map(([tier, count]) =>
            count && count > 0 ? (
              <div key={tier} className="flex items-baseline gap-2">
                <span className="font-mono text-h2 tabular-nums text-ink">{count}</span>
                <span className="font-mono text-mono-label uppercase text-text-muted">
                  {tier.replace("_", "-")}
                </span>
              </div>
            ) : null,
          )}
        </div>
      </section>

      {/* Lines */}
      <DataTable>
        <THead>
          <Th>Product</Th>
          <Th>SKU (after receipt)</Th>
          <Th align="right">Declared</Th>
          <Th align="right">Received</Th>
          <Th align="right">Accepted</Th>
          <Th align="right">Damaged</Th>
        </THead>
        <TBody>
          {psn.lines.map((l) => {
            const product = productById.get(l.productId);
            return (
              <TR key={l.id}>
                <Td>
                  <div className="font-medium text-ink">{product?.name ?? l.productId}</div>
                  <div className="font-mono text-[11px] text-text-muted">
                    {product?.code ?? "—"} · {product?.variant ?? "—"}
                  </div>
                </Td>
                <Td mono>{l.skuId ?? "—"}</Td>
                <Td num>{l.declaredQty}</Td>
                <Td num>{l.receivedQty}</Td>
                <Td num className="text-success">{l.acceptedQty}</Td>
                <Td num className="text-error">{l.damagedQty}</Td>
              </TR>
            );
          })}
        </TBody>
      </DataTable>

      {isDraft ? (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => cancelMut.mutate()} loading={cancelMut.isPending}>
            Cancel PSN
          </Button>
          <Button variant="primary" size="lg" withArrow onClick={() => submitMut.mutate()} loading={submitMut.isPending}>
            Submit for receiving
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div
        className={
          (mono ? "font-mono " : "") +
          (highlight ? "text-h2 tabular-nums text-ink" : "text-body text-text") +
          " mt-2"
        }
      >
        {value}
      </div>
    </div>
  );
}
