"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageSizeSelect, Pagination, useCursorPagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

interface PublicSku {
  id: string;
  productId: string;
  productName: string | null;
  productImageUrl: string | null;
  country: string;
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
  const page = useCursorPagination();
  const { reset: resetPage } = page;
  // Search by product name / SKU, and filter by country (USA / Canada).
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<"" | "US" | "CA">("");
  const trimmed = search.trim();
  useEffect(() => {
    resetPage();
  }, [trimmed, country, resetPage]);

  const params = new URLSearchParams();
  params.set("limit", String(page.pageSize));
  if (trimmed) params.set("search", trimmed);
  if (country) params.set("country", country);
  if (page.cursor) params.set("cursor", page.cursor);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["skus", { search: trimmed, country, cursor: page.cursor, pageSize: page.pageSize }],
    queryFn: () =>
      api.get<{ items: PublicSku[]; nextCursor: string | null }>(`/skus?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Inventory"
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

      <section className="rounded-md border border-line bg-white p-5">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_200px]">
          <Field label="Search" hint="By product name or SKU id">
            <Input
              type="search"
              placeholder="e.g. Body Oil / UER-…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white"
            />
          </Field>
          <Field label="Country">
            <div className="relative">
              <select
                aria-label="Country"
                value={country}
                onChange={(e) => setCountry(e.target.value as "" | "US" | "CA")}
                className="h-11 w-full appearance-none rounded-sm border border-line-strong bg-white pl-3 pr-9 text-body text-text outline-none focus:border-ink"
              >
                <option value="">USA &amp; Canada</option>
                <option value="US">USA</option>
                <option value="CA">Canada</option>
              </select>
            </div>
          </Field>
        </div>
      </section>

      <div className="mb-3 flex justify-end"><PageSizeSelect value={page.pageSize} onChange={page.setPageSize} /></div>
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
            <Th>Product</Th>
            <Th>Variant</Th>
            <Th>Country</Th>
            <Th>Tier</Th>
            <Th align="right">Available</Th>
            <Th align="right">Reserved</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((s) => (
              <TR key={s.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    {s.productImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.productImageUrl}
                        alt={s.productName ?? "product"}
                        className="h-9 w-9 shrink-0 rounded-sm border border-line object-cover"
                      />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-sm border border-line bg-cream-soft" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{s.productName ?? "—"}</div>
                      <div className="truncate font-mono text-[11px] text-text-muted">{s.id}</div>
                    </div>
                  </div>
                </Td>
                <Td mono className="text-text-muted">{s.variant}</Td>
                <Td>
                  <span
                    className={`inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1px] ${
                      s.country === "CA" ? "bg-amber/20 text-amber" : "bg-ink/5 text-text-muted"
                    }`}
                  >
                    {s.country === "CA" ? "Canada" : "USA"}
                  </span>
                </Td>
                <Td mono>{s.storageTier.replace("_", "-")}</Td>
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

      {!isLoading && !error && data && data.items.length > 0 ? (
        <Pagination
          page={page.page}
          hasPrev={page.hasPrev}
          hasNext={Boolean(data.nextCursor)}
          loading={isFetching}
          onPrev={page.prev}
          onNext={() => page.next(data.nextCursor)}
        />
      ) : null}
    </div>
  );
}
