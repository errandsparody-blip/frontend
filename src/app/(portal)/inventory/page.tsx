"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

interface PublicSku {
  id: string;
  productId: string;
  variant: string;
  quantityAvailable: number;
  quantityReserved: number;
  storageTier: "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE" | "PALLET";
  warehouseLocation: string | null;
  status: "ACTIVE" | "RESERVED" | "DAMAGED" | "QUARANTINED" | "OUT_OF_STOCK";
  createdAt: string;
  updatedAt: string;
}

const STATUS_TONE = {
  ACTIVE: "success",
  RESERVED: "info",
  DAMAGED: "error",
  QUARANTINED: "warning",
  OUT_OF_STOCK: "neutral",
} as const;

export default function InventoryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skus"],
    queryFn: () => api.get<{ items: PublicSku[]; nextCursor: string | null }>("/skus?limit=100"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[03] Inventory"
        title="Stock on hand"
        description="Real-time view of every SKU bucket. Counts update the moment an operator receives a shipment or an order ships."
        actions={
          <button
            type="button"
            onClick={() =>
              api.download("/exports/inventory.csv", `inventory_${new Date().toISOString().slice(0, 10)}.csv`).catch(() => undefined)
            }
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            Download CSV
          </button>
        }
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load inventory."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No SKUs yet"
          description="SKUs are generated automatically when an operator receives your inbound shipment. Submit a Pre-Shipment Notice to get started."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>SKU</Th>
            <Th>Variant</Th>
            <Th>Tier</Th>
            <Th>Location</Th>
            <Th align="right">Available</Th>
            <Th align="right">Reserved</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((s) => (
              <TR key={s.id}>
                <Td mono>{s.id}</Td>
                <Td mono className="text-text-muted">{s.variant}</Td>
                <Td mono>{s.storageTier.replace("_", "-")}</Td>
                <Td mono className="text-text-muted">{s.warehouseLocation ?? "—"}</Td>
                <Td num>{s.quantityAvailable}</Td>
                <Td num className="text-text-muted">{s.quantityReserved}</Td>
                <Td>
                  <StatusPill tone={STATUS_TONE[s.status]}>{s.status.replace("_", " ")}</StatusPill>
                </Td>
                <Td align="right">
                  <Link
                    href={`/inventory/${s.id}/label`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                  >
                    Print label →
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
