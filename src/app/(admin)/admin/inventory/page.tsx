/**
 * Admin inventory list — cross-vendor SKU buckets.
 *
 * Hits GET /v1/admin/skus, which returns vendor + product context
 * already joined so the table can render without N+1. Filters: vendor,
 * tier, status, zero-only, free-text. Cursor pagination matches the
 * other admin list pages.
 *
 * For one-off corrections, drill into a row → /admin/inventory/[skuId]
 * → Adjust form. The Adjust write goes through `POST
 * /admin/skus/:id/adjust` and is audit-logged.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

/** Minimal shape of an admin vendor row — only the bits the picker needs. */
interface VendorOption {
  id: string;
  businessName: string;
}

type Tier = "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE" | "PALLET";
type Status = "ACTIVE" | "RESERVED" | "DAMAGED" | "QUARANTINED" | "OUT_OF_STOCK";

interface AdminSkuRow {
  id: string;
  vendorId: string;
  vendorBusinessName: string;
  productId: string;
  productCode: string;
  productName: string;
  variant: string;
  /**
   * Locked product image (R2 URL) — surfaced so warehouse staff can
   * visually match incoming/outgoing stock without drilling into the
   * SKU detail page. `null` when the vendor never uploaded one.
   */
  productImageUrl: string | null;
  quantityAvailable: number;
  quantityReserved: number;
  storageTier: Tier;
  warehouseLocation: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: AdminSkuRow[];
  nextCursor: string | null;
}

const TIERS: Tier[] = ["SMALL", "MEDIUM", "LARGE", "X_LARGE", "PALLET"];
const STATUSES: Status[] = ["ACTIVE", "RESERVED", "DAMAGED", "QUARANTINED", "OUT_OF_STOCK"];

const STATUS_TONE: Record<Status, "neutral" | "info" | "success" | "warning" | "error"> = {
  ACTIVE: "success",
  RESERVED: "info",
  DAMAGED: "error",
  QUARANTINED: "warning",
  OUT_OF_STOCK: "neutral",
};

export default function AdminInventoryPage(): JSX.Element {
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<Tier | "">("");
  const [status, setStatus] = useState<Status | "">("");
  const [zeroOnly, setZeroOnly] = useState(false);
  const [vendorId, setVendorId] = useState<string>("");

  // Pull the vendor list once for the dropdown. 100 is plenty for v1 — when
  // the vendor count grows past that we'll swap to a searchable combobox.
  // Failure is tolerable; if vendors fail to load the picker just stays
  // empty (the "All vendors" option still works as a no-filter default).
  const vendorsQ = useQuery({
    queryKey: ["admin", "vendors", "picker"],
    queryFn: () =>
      api.get<{ items: VendorOption[] }>(`/admin/vendors?limit=100`),
    staleTime: 60_000,
  });
  const vendorOptions = useMemo(() => {
    const items = vendorsQ.data?.items ?? [];
    // Alphabetical so the dropdown is scannable.
    return [...items].sort((a, b) =>
      a.businessName.localeCompare(b.businessName, "en", { sensitivity: "base" }),
    );
  }, [vendorsQ.data]);

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (search.trim()) params.set("search", search.trim());
  if (tier) params.set("storageTier", tier);
  if (status) params.set("status", status);
  if (zeroOnly) params.set("zeroOnly", "true");
  if (vendorId) params.set("vendorId", vendorId);

  const listQ = useQuery({
    queryKey: ["admin", "skus", { search, tier, status, zeroOnly, vendorId }],
    queryFn: () => api.get<ListResponse>(`/admin/skus?${params.toString()}`),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Inventory"
        title="SKU buckets"
        description="Cross-vendor view of every SKU. Available + reserved counts come straight from the SKU table; movement history per SKU is one click away."
      />

      <section className="rounded-md border border-line bg-white p-5">
        {/* Filter grid: search takes the remaining flex, vendor + tier + status
            + zero-only are fixed-width pickers. On mobile they stack. */}
        <div className="grid gap-4 md:grid-cols-[1fr_220px_180px_180px_140px]">
          <Field label="Search" hint="By SKU id, product, or vendor name">
            <Input
              type="search"
              placeholder="UER-… / Adela / WRTF"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Vendor">
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="h-11 w-full rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
              disabled={vendorsQ.isLoading}
              aria-label="Filter by vendor"
            >
              <option value="">All vendors</option>
              {vendorOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.businessName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Storage tier">
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier | "")}
              className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
            >
              <option value="">All tiers</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", "-")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status | "")}
              className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Zero stock">
            <label className="flex h-11 items-center gap-2 rounded-sm border border-line-strong bg-white px-3 text-body-sm text-text">
              <input
                type="checkbox"
                checked={zeroOnly}
                onChange={(e) => setZeroOnly(e.target.checked)}
                className="h-4 w-4"
              />
              Show zero-only
            </label>
          </Field>
        </div>
      </section>

      {listQ.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : listQ.error ? (
        <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
          <div className="font-mono text-mono-label uppercase text-error">
            Couldn&apos;t load inventory
          </div>
          <p className="mt-1 text-body-sm text-text">
            Try refreshing. If it keeps failing, check the API logs and Sentry.
          </p>
        </div>
      ) : !listQ.data || listQ.data.items.length === 0 ? (
        <EmptyState
          title="No SKUs match those filters"
          description={
            search || tier || status || zeroOnly || vendorId
              ? "Loosen the filters or clear the search."
              : "Once a vendor's PSN is received, SKUs will appear here automatically."
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>SKU</Th>
            <Th>Vendor</Th>
            <Th>Image</Th>
            <Th>Product</Th>
            <Th>Tier</Th>
            <Th align="right">Available</Th>
            <Th align="right">Reserved</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {listQ.data.items.map((s) => (
              <TR key={s.id}>
                <Td mono strong>
                  {s.id}
                </Td>
                <Td>{s.vendorBusinessName}</Td>
                <Td>
                  {/* 40×40 thumbnail anchored to the row — gives staff
                      an at-a-glance visual ID without a click. When the
                      vendor never uploaded a photo we still render a
                      neutral placeholder so the column stays aligned. */}
                  {s.productImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={s.productImageUrl}
                      alt={`${s.productName} thumbnail`}
                      className="h-10 w-10 shrink-0 rounded-sm border border-line object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        // Hide the <img> if R2 returns 404 (vendor cleared
                        // out-of-band, R2 transient outage, etc.) so we
                        // don't render the browser's broken-image glyph.
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-dashed border-line bg-cream-soft font-mono text-[10px] uppercase tracking-[1px] text-text-subtle"
                    >
                      —
                    </div>
                  )}
                </Td>
                <Td>
                  <div className="font-medium text-ink">{s.productName}</div>
                  <div className="font-mono text-[11px] text-text-muted">
                    {s.productCode} · {s.variant}
                  </div>
                </Td>
                <Td mono>{s.storageTier.replace("_", "-")}</Td>
                <Td num>{s.quantityAvailable}</Td>
                <Td num className="text-text-muted">
                  {s.quantityReserved}
                </Td>
                <Td>
                  <StatusPill tone={STATUS_TONE[s.status]}>
                    {s.status.replace(/_/g, " ")}
                  </StatusPill>
                </Td>
                <Td align="right">
                  {/* Two operator actions on the same row. "Open" goes
                      to the SKU detail (counts, movements, manual
                      adjust). "Print label" jumps straight to the
                      Avery 5160 sheet — same component the vendor uses,
                      so labels printed admin-side scan identically. */}
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/admin/inventory/${encodeURIComponent(s.id)}/label`}
                      className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                    >
                      Print label →
                    </Link>
                    <Link
                      href={`/admin/inventory/${encodeURIComponent(s.id)}`}
                      className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                    >
                      Open →
                    </Link>
                  </div>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
