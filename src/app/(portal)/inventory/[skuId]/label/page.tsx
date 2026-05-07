"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect } from "react";

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

/**
 * Printable label page. Sized for a 4×6 thermal label by default; also
 * prints to A4 cleanly (one label per sheet for now). Uses pure CSS @media
 * print rules — vendors hit Cmd-P / Ctrl-P. Real PDF generation lands in P2
 * when the label-API endpoint stabilizes.
 */
export default function SkuLabelPage() {
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

  useEffect(() => {
    // Auto-trigger the print dialog once both queries resolve and the page paints.
    if (skuQ.data && productQ.data) {
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
    return;
  }, [skuQ.data, productQ.data]);

  const sku = skuQ.data;
  const product = productQ.data;

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 4in 6in;
            margin: 0.2in;
          }
          body {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
        .label-card {
          width: 4in;
          height: 6in;
          padding: 0.3in;
        }
      `}</style>

      <div className="flex min-h-screen items-center justify-center bg-cream py-12 print:bg-white print:py-0">
        <div className="flex flex-col items-center">
          <div className="no-print mb-6 font-mono text-mono-label uppercase text-text-muted">
            The print dialog opens automatically. Cmd / Ctrl-P to reopen.
          </div>

          <div className="label-card border border-ink bg-white shadow-2 print:shadow-none">
            {sku && product ? (
              <div className="flex h-full flex-col justify-between font-mono">
                <div>
                  <div className="text-[10px] uppercase tracking-[1.6px] text-text-muted">USA Errands</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[1.4px] text-amber">
                    Tier {sku.storageTier.replace("_", "-")}
                  </div>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="text-[14px] font-bold tracking-[0.5px] text-ink">{product.code}</div>
                  <div className="mt-1 max-w-full truncate font-sans text-[14px] font-medium text-text">
                    {product.name}
                  </div>
                  <div className="mt-3 break-all text-[18px] font-bold tabular-nums text-ink">{sku.id}</div>
                  <div className="mt-2 text-[11px] uppercase tracking-[1.4px] text-text-muted">
                    Variant {sku.variant}
                  </div>
                </div>

                <div className="flex justify-between text-[10px] uppercase tracking-[1.4px] text-text-muted">
                  <span>{sku.warehouseLocation ?? "—"}</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-mono-label uppercase text-text-muted">
                Loading…
              </div>
            )}
          </div>

          <div className="no-print mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-sm border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-inv hover:bg-ink-elev"
            >
              Print again
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="rounded-sm border border-line-strong bg-white px-4 py-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text hover:border-ink"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
