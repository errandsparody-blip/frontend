"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

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

  // Products are always locked from the vendor's POV once they're
  // created — the backend `update()` rejects any change to the
  // identity / shipping / customs / image fields, and the response
  // always reports `locked: true`. The form mirrors this by rendering
  // every input (image uploader included) disabled. Archive stays
  // available outside this gate as the only lifecycle action.
  const locked = product?.locked ?? true;

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
            {/* Hard-link to the list rather than the smart back-button.
                Vendors who reach this page right after creating a
                product would otherwise pop to `/products/new` because
                that's the same-origin referrer immediately after the
                create + preview hand-off, which feels broken. The list
                is always the right "back" from a product detail. */}
            <Link
              href="/products"
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
            >
              ← All products
            </Link>
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
      {/* Locked notice — products are immutable once created. The form
          below already renders every input as read-only via `locked`,
          but vendors deserve a clear, non-error explanation of why,
          plus the escape hatch ("archive + recreate") rather than
          guessing why the inputs are greyed out. */}
      {locked ? (
        <div
          role="note"
          className="flex items-start gap-3 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4"
        >
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
          <div>
            <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
              Product locked
            </div>
            <div className="mt-0.5 text-body font-semibold text-ink">
              Products can&apos;t be edited after they&apos;re created
            </div>
            <p className="mt-1 max-w-prose text-body-sm text-text">
              Identity, customs, weight, dimensions, storage tier, and the
              product image are all fixed at creation so we can guarantee
              the same values on every PSN, order, and customs declaration
              tied to this product. If something needs to change, archive
              this product and create a new one with the corrected details
              — the new one will get its own SKU and historical records
              stay clean.
            </p>
            <p className="mt-2 text-body-sm text-text-muted">
              The only action available from this page is archiving the
              product.
            </p>
          </div>
        </div>
      ) : null}

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
