"use client";

/**
 * Vendor-side printable SKU labels.
 *
 * Fetches SKU + product via the vendor-scoped endpoints (TenantGuard
 * enforces ownership at the API layer; an attempt to print labels for
 * another vendor's SKU would 404 here). All layout and barcode-rendering
 * logic lives in <SkuLabelPrintView /> so this page and the parallel
 * admin page at /admin/inventory/[skuId]/label produce byte-identical
 * output — important because the same SKU may be relabelled by either
 * side and scanners need to read both formats interchangeably.
 */

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { SkuLabelPrintView, type SkuLabelData } from "@/components/inventory/sku-label-print";
import { api } from "@/lib/api-client";
import type { PublicProduct } from "@/lib/schemas/products";

interface PublicSku {
  id: string;
  productId: string;
  variant: string;
  storageTier: "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE" | "PALLET";
  warehouseLocation: string | null;
  quantityAvailable: number;
}

export default function SkuLabelPage(): JSX.Element {
  const params = useParams<{ skuId: string }>();

  const skuQ = useQuery({
    queryKey: ["skus", params.skuId, "label"],
    queryFn: () => api.get<PublicSku>(`/skus/${params.skuId}`),
    enabled: !!params.skuId,
  });
  const productQ = useQuery({
    queryKey: ["products", skuQ.data?.productId, "label"],
    queryFn: () => api.get<PublicProduct>(`/products/${skuQ.data!.productId}`),
    enabled: !!skuQ.data?.productId,
  });

  const data: SkuLabelData | null =
    skuQ.data && productQ.data
      ? {
          id: skuQ.data.id,
          productCode: productQ.data.code,
          productName: productQ.data.name,
          variant: skuQ.data.variant,
          storageTier: skuQ.data.storageTier,
        }
      : null;

  return <SkuLabelPrintView sku={data} />;
}
