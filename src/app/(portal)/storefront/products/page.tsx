"use client";

/**
 * Vendor product listing management (Migration 0059 + 0066 variants). Toggle
 * which products appear on the storefront, set retail price + category, set each
 * product's size/colour, and group several products into ONE listing (variants).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductGalleryUploader } from "@/components/portal/product-gallery-uploader";
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
  optionSize: string | null;
  optionColor: string | null;
  variantGroupId: string | null;
  imageUrl: string | null;
  imageUrls: string[];
}

export default function StorefrontProductsPage() {
  const { bannerError, handle, clear } = useApiErrorHandler();
  const qc = useQueryClient();
  const products = useQuery({
    queryKey: ["storefront-products"],
    queryFn: () => api.get<VendorProduct[]>("/storefront/products"),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const group = useMutation({
    mutationFn: () =>
      api.post<{ variantGroupId: string }>("/storefront/products/variant-group", {
        productIds: [...selected],
      }),
    onSuccess: () => {
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ["storefront-products"] });
    },
    onError: handle,
  });

  const items = products.data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Storefront products"
        description="Choose what buyers can see and buy, set retail prices, and group size/colour variants into one listing."
      />
      <Link href="/storefront" className="mb-4 inline-block text-[13px] text-amber hover:underline">
        ← Back to storefront
      </Link>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} onAction={() => clear()} />
        </div>
      ) : null}

      {/* Group action bar — appears when 2+ products are selected. */}
      {selected.size >= 2 ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-ink bg-ink/5 px-4 py-3">
          <span className="text-body-sm text-ink">
            {selected.size} products selected — group them as one listing (size/colour variants).
          </span>
          <Button variant="primary" loading={group.isPending} onClick={() => { clear(); group.mutate(); }}>
            Group as one listing
          </Button>
        </div>
      ) : null}

      {products.isLoading ? (
        <div className="py-16 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-line bg-white px-6 py-16 text-center text-body-sm text-text-muted">
          No active products yet. Add products first, then list them here.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              selected={selected.has(p.id)}
              onToggleSelect={() => toggle(p.id)}
              onSaved={() => products.refetch()}
              onError={handle}
              clearError={clear}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product,
  selected,
  onToggleSelect,
  onSaved,
  onError,
  clearError,
}: {
  product: VendorProduct;
  selected: boolean;
  onToggleSelect: () => void;
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
  const [size, setSize] = useState(product.optionSize ?? "");
  const [color, setColor] = useState(product.optionColor ?? "");
  const [images, setImages] = useState<string[]>(product.imageUrls ?? []);
  const [saved, setSaved] = useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["storefront-products"] });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/storefront/products/${product.id}/listing`, {
        listed,
        retailPriceCents: price ? Math.round(Number(price) * 100) : undefined,
        category: category.trim() || null,
        optionSize: size.trim() || null,
        optionColor: color.trim() || null,
        imageUrls: images,
      }),
    onSuccess: () => {
      invalidate();
      onSaved();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    },
    onError,
  });
  const ungroup = useMutation({
    mutationFn: () => api.post(`/storefront/products/${product.id}/ungroup`, {}),
    onSuccess: invalidate,
    onError,
  });

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <label className="flex min-w-0 items-center gap-2">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`Select ${product.name}`} />
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-medium text-ink">{product.name}</span>
            <span className="block font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">{product.code}</span>
          </span>
        </label>
        <div className="flex items-center gap-2">
          {product.variantGroupId ? (
            <button type="button" onClick={() => { clearError(); ungroup.mutate(); }}
              className="rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-medium text-text-muted hover:border-ink">
              Grouped · ungroup
            </button>
          ) : null}
          <StatusPill tone={listed ? "success" : "neutral"}>{listed ? "Listed" : "Hidden"}</StatusPill>
        </div>
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
        <div className="text-[12px] text-text-muted">
          <span className="mb-1 block">Size</span>
          <Input aria-label="Size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="M" className="w-20" />
        </div>
        <div className="text-[12px] text-text-muted">
          <span className="mb-1 block">Colour</span>
          <Input aria-label="Colour" value={color} onChange={(e) => setColor(e.target.value)} placeholder="White" className="w-28" />
        </div>
        <Button variant="outline" loading={save.isPending} onClick={() => { clearError(); setSaved(false); save.mutate(); }}>
          Save
        </Button>
      </div>
      <div className="mt-3">
        <span className="mb-1 block text-[12px] text-text-muted">Images</span>
        <ProductGalleryUploader value={images} onChange={setImages} disabled={save.isPending} />
        {saved ? (
          <span role="status" className="text-[12px] font-medium text-emerald-600">
            Saved ✓
          </span>
        ) : null}
      </div>
    </div>
  );
}
