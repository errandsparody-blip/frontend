"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { ProductForm } from "@/components/portal/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import type { CreateProductInput, PublicProduct } from "@/lib/schemas/products";

export default function NewProductPage() {
  const router = useRouter();
  const qc = useQueryClient();

  async function onSubmit(values: CreateProductInput): Promise<void> {
    const created = await api.post<PublicProduct>("/products", values);
    await qc.invalidateQueries({ queryKey: ["products"] });
    // Land on the preview page — it has a distinctly different layout
    // from the form (hero image + readonly stats), so the vendor
    // immediately sees they're past the create step. Sending them to
    // the edit page made the form look unchanged and led to repeated
    // Save clicks.
    router.push(`/products/${created.id}/preview`);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="  Catalogue / New"
        title="Create a product"
        description="The product code is part of the SKU id. Make it short, uppercase, and stable — once products are received against it, the code is locked."
      />
      <div className="rounded-md border border-line bg-white p-8">
        <ProductForm submitLabel="Create product" onSubmit={onSubmit} />
      </div>
    </div>
  );
}
