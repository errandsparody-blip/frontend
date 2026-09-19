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
  /** The product's inventory variant — the source of truth for its size. */
  variant: string;
  optionColor: string | null;
  variantGroupId: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  availableStock: number;
}

/** Size shown/merged for a product comes from its variant; "STD" = no size. */
function sizeOf(variant: string): string | null {
  return variant && variant.toUpperCase() !== "STD" ? variant : null;
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

  // Preview the sizes we'd merge — pulled straight from each selected product's
  // own Size field (vendors don't retype sizes; they come from the listing).
  const selectedProducts = items.filter((p) => selected.has(p.id));
  const mergeSizes = selectedProducts
    .map((p) => sizeOf(p.variant))
    .filter((s): s is string => Boolean(s));
  const missingSize = selectedProducts.some((p) => !sizeOf(p.variant));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Storefront products"
        description="Choose what buyers can see and buy, set retail prices, and merge same-product sizes into one marketplace listing."
      />
      <Link href="/storefront" className="mb-4 inline-block text-[13px] text-amber hover:underline">
        ← Back to storefront
      </Link>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} onAction={() => clear()} />
        </div>
      ) : null}

      {/* Merge action bar — appears when 2+ products are selected. The sizes are
          taken from each product's own Size field, not entered here. */}
      {selected.size >= 2 ? (
        <div className="mb-4 rounded-lg border border-ink bg-ink/5 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-body-sm text-ink">
              Merge {selected.size} products into one marketplace listing (size variants).
            </span>
            <Button variant="primary" loading={group.isPending} onClick={() => { clear(); group.mutate(); }}>
              Merge as one listing
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-text-muted">
            {mergeSizes.length > 0 ? (
              <>Buyers will pick a size: <span className="font-medium text-ink">{mergeSizes.join(", ")}</span>. </>
            ) : null}
            Sizes come from each product&apos;s Size field below.
            {missingSize ? (
              <span className="text-error"> Set a Size on every selected product first so shoppers can tell them apart.</span>
            ) : null}
          </p>
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
  const [images, setImages] = useState<string[]>(product.imageUrls ?? []);
  const [saved, setSaved] = useState(false);

  const size = sizeOf(product.variant);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["storefront-products"] });

  const save = useMutation({
    // Size/colour and rich details are NOT edited here — size derives from the
    // product's variant, and colour/details live on the Edit details page.
    // Omitting those fields leaves them untouched server-side.
    mutationFn: () =>
      api.patch(`/storefront/products/${product.id}/listing`, {
        listed,
        retailPriceCents: price ? Math.round(Number(price) * 100) : undefined,
        category: category.trim() || null,
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
          <StatusPill tone={product.availableStock > 0 ? "info" : "warning"}>
            {product.availableStock > 0 ? `${product.availableStock} in stock` : "Out of stock"}
          </StatusPill>
          {product.variantGroupId ? (
            <button type="button" onClick={() => { clearError(); ungroup.mutate(); }}
              className="rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-medium text-text-muted hover:border-ink">
              Merged · unmerge
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
          {/* Read-only — size comes from the product's variant (its listing). */}
          <div className="flex h-11 items-center rounded-sm border border-line bg-cream-soft px-3 text-body-sm text-ink">
            {size ?? <span className="text-text-subtle">One size</span>}
          </div>
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
      <div className="mt-3 border-t border-line pt-3">
        <Link
          href={`/storefront/products/${product.id}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-amber hover:underline"
        >
          Edit product details (description, colour, fit, material…)
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
