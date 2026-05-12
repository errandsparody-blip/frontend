"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { StorageTierGuide } from "@/components/portal/storage-tier-guide";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { PsnStatus, PublicPsn } from "@/lib/schemas/psn";

const TONE: Record<PsnStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  AWAITING_RECEIPT: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  DISCREPANCY: "warning",
  CANCELLED: "error",
  HOLD: "warning",
  REJECTED: "error",
  RETURN_REQUESTED: "error",
};

export default function PsnListPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["psns"],
    queryFn: () => api.get<{ items: PublicPsn[]; nextCursor: string | null }>("/psns?limit=50"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[04] Pre-Shipment Notices"
        title="Inbound shipments"
        description="Declare each shipment before it arrives. The onboarding fee is locked in at submit time and the PSN moves to 'awaiting receipt'."
        actions={
          <Link href="/psn/new">
            <Button variant="amber" withArrow>
              New PSN
            </Button>
          </Link>
        }
      />

      {/* Boxes by tier — prominent reference card. The button opens the
          full pricing modal (live-from-admin-config data: dimensions,
          cubic in/ft, stocking, first-month + monthly storage, total).
          Sitting right under the page header makes the pricing one
          click away from a vendor about to submit a PSN. */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-cream-soft px-6 py-5">
        <div>
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
            Boxes by tier
          </div>
          <h2 className="mt-1 text-h3 font-semibold text-ink">
            Look up storage tier pricing
          </h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Dimensions, cubic volume, stocking fee, and monthly storage for each
            tier — sourced live from the admin pricing config, so what you see
            is exactly what your wallet is debited at submit.
          </p>
        </div>
        <StorageTierGuide triggerLabel="Open storage tier guide" />
      </section>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load PSNs."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No Pre-Shipment Notices yet"
          description="Submit a PSN once you've created the products you'll be sending us."
          action={
            <Link href="/psn/new">
              <Button variant="primary" withArrow>
                Create your first PSN
              </Button>
            </Link>
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Reference</Th>
            <Th>Status</Th>
            <Th align="right">Lines</Th>
            <Th align="right">Onboarding fee</Th>
            <Th>Submitted</Th>
            <Th>Received</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((p) => (
              <TR key={p.id}>
                <Td mono>{p.id.slice(0, 8)}</Td>
                <Td>
                  <StatusPill tone={TONE[p.status]}>{p.status.replace(/_/g, " ")}</StatusPill>
                </Td>
                <Td num>{p.lines.length}</Td>
                <Td num>{p.onboardingFeeCents !== null ? `$${(p.onboardingFeeCents / 100).toFixed(2)}` : "—"}</Td>
                <Td mono className="text-text-muted">
                  {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : "—"}
                </Td>
                <Td mono className="text-text-muted">
                  {p.receivedAt ? new Date(p.receivedAt).toLocaleDateString() : "—"}
                </Td>
                <Td align="right">
                  <Link
                    href={`/psn/${p.id}`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                  >
                    Open →
                  </Link>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
