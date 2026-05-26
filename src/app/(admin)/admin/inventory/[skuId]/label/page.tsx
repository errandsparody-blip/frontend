"use client";

/**
 * Admin-side printable SKU labels.
 *
 * Mirrors the vendor flow at /inventory/[skuId]/label, but uses the
 * admin-scoped /admin/skus/:id endpoint which (a) accepts any tenant's
 * SKU id (no TenantGuard scoping) and (b) returns the product fields
 * inlined on the SKU response — so a single fetch is enough, no
 * separate /products call needed.
 *
 * Why this exists: when staff are picking or relabelling stock on the
 * warehouse floor they need to be able to print the SKU's barcode label
 * without context-switching to a vendor login. Putting the action under
 * /admin/inventory keeps it in the same surface they're already using
 * to look at quantities and movements.
 *
 * All print layout and barcode rendering is delegated to the shared
 * <SkuLabelPrintView /> component so admin and vendor flows produce
 * byte-identical output on Avery 5160 sheets.
 */

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { SkuLabelPrintView, type SkuLabelData } from "@/components/inventory/sku-label-print";
import { api } from "@/lib/api-client";

/** Minimal projection of the admin SKU response — we only need the
 * fields the label needs, but the endpoint returns more (vendor name,
 * movements, etc.) which we intentionally ignore here. */
interface AdminSkuLabelProjection {
  id: string;
  productCode: string;
  productName: string;
  variant: string;
  storageTier: string;
}

export default function AdminSkuLabelPage(): JSX.Element {
  const params = useParams<{ skuId: string }>();

  const skuQ = useQuery({
    queryKey: ["admin", "skus", params.skuId, "label"],
    queryFn: () =>
      api.get<AdminSkuLabelProjection>(`/admin/skus/${encodeURIComponent(params.skuId)}`),
    enabled: !!params.skuId,
  });

  const data: SkuLabelData | null = skuQ.data
    ? {
        id: skuQ.data.id,
        productCode: skuQ.data.productCode,
        productName: skuQ.data.productName,
        variant: skuQ.data.variant,
        storageTier: skuQ.data.storageTier,
      }
    : null;

  return <SkuLabelPrintView sku={data} />;
}
