"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { BackButton } from "@/components/portal/back-button";
import { ProductForm } from "@/components/portal/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import type { CreateProductInput, PublicProduct } from "@/lib/schemas/products";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: product, isLoading, error } = useQuery({
    queryKey: ["products", params.id],
    queryFn: () => api.get<PublicProduct>(`/products/${params.id}`),
    enabled: !!params.id,
  });

  // The backend's GET /products/:id now returns a `locked` boolean computed
  // from `count(skus where productId)`. Once any stock has been received,
  // the entire product becomes immutable except for `status` (so vendors
  // can still archive). The form mirrors this — every input renders
  // disabled — and a backend patch that tries to change a lockable field
  // returns 400 `product_locked` regardless. Defence in depth.
  const locked = product?.locked ?? false;

  async function onSubmit(values: CreateProductInput): Promise<void> {
    // Strip code (immutable) before sending PATCH.
    const { code: _code, ...patch } = values;
    await api.patch<PublicProduct>(`/products/${params.id}`, patch);
    await qc.invalidateQueries({ queryKey: ["products"] });
    await qc.invalidateQueries({ queryKey: ["products", params.id] });
  }

  if (isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (error || !product) {
    return (
      <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
        {(error as { message?: string })?.message ?? "Product not found."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`[02] Catalogue / ${product.code}`}
        title={product.name}
        description={`Variant ${product.variant} · ${product.countryOfOrigin}`}
        actions={
          <div className="flex items-center gap-3">
            <BackButton fallback="/products" />
            <Link
              href={`/products/${params.id}/preview`}
              className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
            >
              Preview →
            </Link>
            <StatusPill tone={product.status === "ACTIVE" ? "success" : "neutral"}>{product.status}</StatusPill>
          </div>
        }
      />
      <div className="rounded-md border border-line bg-white p-8">
        <ProductForm
          showCode={false}
          locked={locked}
          initial={{
            name: product.name,
            variant: product.variant,
            hsCode: product.hsCode ?? "",
            countryOfOrigin: product.countryOfOrigin,
            declaredValueCents: product.declaredValueCents,
            weightOz: product.weightOz,
            // Dimensions are nullable in the API; CreateProductInput
            // expects `number | undefined`. Convert nulls so the form
            // gets a clean shape.
            lengthIn: product.lengthIn ?? undefined,
            widthIn: product.widthIn ?? undefined,
            heightIn: product.heightIn ?? undefined,
            storageTier: product.storageTier,
            code: product.code,
            imageUrl: product.imageUrl,
          }}
          submitLabel="Save changes"
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}
