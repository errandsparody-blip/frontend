"use client";

/**
 * Storefront product details editor (Migration 0070). A dedicated page where a
 * vendor writes the buyer-facing details for one product — description, colour,
 * fit, gender, material, care, brand, ships-from — shown ASOS-style in the
 * "Product details" section on the public product page.
 *
 * Size is deliberately NOT edited here: it comes from the product's variant
 * (its inventory listing) and is shown read-only.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

interface VendorProductDetail {
  id: string;
  code: string;
  name: string;
  variant: string;
  listed: boolean;
  retailPriceCents: number | null;
  category: string | null;
  optionColor: string | null;
  imageUrls: string[];
  availableStock: number;
  description: string | null;
  fit: string | null;
  gender: string | null;
  material: string | null;
  careInstructions: string | null;
  brand: string | null;
}

const GENDERS = ["", "For Her", "For Him", "Unisex", "Kids"] as const;

function sizeLabel(variant: string): string {
  return variant && variant.toUpperCase() !== "STD" ? variant : "One size";
}

export default function StorefrontProductDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const product = useQuery({
    queryKey: ["storefront-product", params.id],
    queryFn: () => api.get<VendorProductDetail>(`/storefront/products/${params.id}`),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/storefront/products" label="Back to products" />
      <PageHeader
        title="Product details"
        description="Describe this product so shoppers know exactly what they're getting. Shown in the Product details section on the marketplace."
      />

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} onAction={() => clear()} />
        </div>
      ) : null}

      {product.isLoading || !product.data ? (
        <div className="py-16 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : (
        <DetailForm
          product={product.data}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["storefront-product", params.id] });
            void qc.invalidateQueries({ queryKey: ["storefront-products"] });
          }}
          onError={handle}
          clearError={clear}
        />
      )}
    </div>
  );
}

function DetailForm({
  product,
  onSaved,
  onError,
  clearError,
}: {
  product: VendorProductDetail;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const [color, setColor] = useState(product.optionColor ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [fit, setFit] = useState(product.fit ?? "");
  const [gender, setGender] = useState(product.gender ?? "");
  const [material, setMaterial] = useState(product.material ?? "");
  const [care, setCare] = useState(product.careInstructions ?? "");
  const [brand, setBrand] = useState(product.brand ?? "");
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/storefront/products/${product.id}/listing`, {
        // listed is required by the listing endpoint — carry the current value
        // through unchanged so saving details never flips a product's visibility.
        listed: product.listed,
        optionColor: color.trim() || null,
        description: description.trim() || null,
        fit: fit.trim() || null,
        gender: gender.trim() || null,
        material: material.trim() || null,
        careInstructions: care.trim() || null,
        brand: brand.trim() || null,
      }),
    onSuccess: () => {
      onSaved();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    },
    onError,
  });

  const textareaCls =
    "w-full rounded-md border border-line-strong bg-white px-3 py-2 text-body-sm outline-none focus:border-ink";

  return (
    <div className="flex flex-col gap-6">
      {/* Product summary — the fixed facts from inventory (read-only). */}
      <section className="rounded-lg border border-line bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-body font-semibold text-ink">{product.name}</h2>
            <p className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
              {product.code}
            </p>
          </div>
          <StatusPill tone={product.availableStock > 0 ? "info" : "warning"}>
            {product.availableStock > 0 ? `${product.availableStock} in stock` : "Out of stock"}
          </StatusPill>
        </div>
        <div className="mt-3 text-[12px] text-text-muted">
          Size: <span className="font-medium text-ink">{sizeLabel(product.variant)}</span>
          <span className="text-text-subtle"> · from this product&apos;s variant</span>
        </div>
      </section>

      {/* Editable details. */}
      <section className="rounded-lg border border-line bg-white p-6">
        <h2 className="mb-4 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
          Details
        </h2>
        <div className="flex flex-col gap-4">
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Describe the product — what it is, what makes it special, sizing notes…"
              className={textareaCls}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Colour">
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Red" />
            </Field>
            <Field label="Fit">
              <Input value={fit} onChange={(e) => setFit(e.target.value)} placeholder="Regular, Slim, Oversized…" />
            </Field>
            <Field label="Gender">
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                aria-label="Gender"
                className="h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 text-body-sm outline-none focus:border-ink"
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g === "" ? "—" : g}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Material">
              <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Aso Oke, Cotton…" />
            </Field>
            <Field label="Brand">
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand name" />
            </Field>
          </div>

          <Field label="Care instructions">
            <Input value={care} onChange={(e) => setCare(e.target.value)} placeholder="Hand wash cold, dry flat" />
          </Field>

          <div className="flex items-center gap-3">
            <Button variant="primary" loading={save.isPending} onClick={() => { clearError(); setSaved(false); save.mutate(); }}>
              Save details
            </Button>
            {saved ? (
              <span role="status" className="text-[12px] font-medium text-emerald-600">
                Saved ✓
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
