"use client";

/**
 * Vendor product listing management (Migration 0059). Toggle which products
 * appear on the storefront and set their public retail price + category.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

interface VendorProduct {
  id: string;
  code: string;
  name: string;
  listed: boolean;
  retailPriceCents: number | null;
  category: string | null;
}

export default function StorefrontProductsPage() {
  const { bannerError, handle, clear } = useApiErrorHandler();
  const products = useQuery({
    queryKey: ["storefront-products"],
    queryFn: () => api.get<VendorProduct[]>("/storefront/products"),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Storefront products"
        description="Choose what buyers can see and buy, and set retail prices."
      />
      <Link href="/storefront" className="mb-4 inline-block text-[13px] text-amber hover:underline">
        ← Back to storefront
      </Link>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} onAction={() => clear()} />
        </div>
      ) : null}

      {products.isLoading ? (
        <div className="py-16 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : (products.data ?? []).length === 0 ? (
        <div className="rounded-lg border border-line bg-white px-6 py-16 text-center text-body-sm text-text-muted">
          No active products yet. Add products first, then list them here.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(products.data ?? []).map((p) => (
            <ProductRow key={p.id} product={p} onSaved={() => products.refetch()} onError={handle} clearError={clear} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product,
  onSaved,
  onError,
  clearError,
}: {
  product: VendorProduct;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const qc = useQueryClient();
  const [listed, setListed] = useState(product.listed);
  const [price, setPrice] = useState(
    product.retailPriceCents != null ? (product.retailPriceCents / 100).toFixed(2) : "",
  );
  const [category, setCategory] = useState(product.category ?? "");
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/storefront/products/${product.id}/listing`, {
        listed,
        retailPriceCents: price ? Math.round(Number(price) * 100) : undefined,
        category: category.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["storefront-products"] });
      onSaved();
      // Brief confirmation so the vendor knows the change persisted.
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    },
    onError,
  });

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-body-sm font-medium text-ink">{product.name}</div>
          <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">{product.code}</div>
        </div>
        <StatusPill tone={listed ? "success" : "neutral"}>{listed ? "Listed" : "Hidden"}</StatusPill>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
          List on storefront
        </label>
        <div className="text-[12px] text-text-muted">
          <span className="mb-1 block">Retail price ($)</span>
          <Input aria-label="Retail price in dollars" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="w-28" />
        </div>
        <div className="text-[12px] text-text-muted">
          <span className="mb-1 block">Category</span>
          <Input aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Clothing" className="w-40" />
        </div>
        <Button variant="outline" loading={save.isPending} onClick={() => { clearError(); setSaved(false); save.mutate(); }}>
          Save
        </Button>
        {saved ? (
          <span role="status" className="text-[12px] font-medium text-emerald-600">
            Saved ✓
          </span>
        ) : null}
      </div>
    </div>
  );
}
