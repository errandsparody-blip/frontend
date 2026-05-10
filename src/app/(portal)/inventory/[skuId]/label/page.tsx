"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import { api } from "@/lib/api-client";
import { encodeCode128B } from "@/lib/barcode";
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
 * Printable SKU label page. Sized for a 4×6 thermal label by default; also
 * prints to A4 cleanly (one label per sheet for now).
 *
 * Print-mode CSS: this page lives under the `(portal)` route group, which
 * wraps it in the vendor portal sidebar. We can't easily opt out of the
 * parent layout in Next.js without changing the URL, so the print
 * stylesheet hides EVERYTHING with `visibility: hidden` and then
 * explicitly shows the label card. This works regardless of the
 * surrounding layout structure and is robust to future sidebar changes.
 *
 * The barcode is Code128B (lib/barcode.ts), encoding the full SKU id.
 * Renders as inline SVG so the print path stays vector-perfect at any DPI.
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

  // Encode the SKU id as Code128B once both are available. Memoised so
  // re-renders don't re-encode on every paint. Failures (non-ASCII char in
  // a SKU id, which shouldn't happen) collapse to an empty string and the
  // label still renders the human-readable id below.
  const barcodeSvg = useMemo(() => {
    if (!sku) return "";
    try {
      return encodeCode128B(sku.id, { moduleWidth: 2, height: 70, quietZone: 14 });
    } catch {
      return "";
    }
  }, [sku]);

  return (
    <>
      <style jsx global>{`
        /* Print-only rules: hide every element on the page, then re-show
           ONLY the label card (and its descendants). The label is given
           position: absolute + top: 0 / left: 0 to anchor it at the
           page corner regardless of where it lived in normal flow. */
        @media print {
          @page {
            size: 4in 6in;
            margin: 0.2in;
          }
          html,
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          .label-card,
          .label-card * {
            visibility: visible !important;
          }
          .label-card {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
        .label-card {
          width: 4in;
          height: 6in;
          padding: 0.3in;
        }
        /* Inline SVG sizing — without this the SVG fills its parent and
           the barcode either stretches or gets cropped depending on the
           outer flex direction. */
        .label-barcode svg {
          display: block;
          width: 100%;
          height: auto;
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

                  {/* Barcode + human-readable SKU underneath. The
                      barcode IS the scannable element; the text is the
                      human eyeball fallback. */}
                  {barcodeSvg ? (
                    <div
                      className="label-barcode mt-3 w-full"
                      // SVG is sanitised (we generated it ourselves from
                      // a known-safe character set + escaped attribute);
                      // safe to inject directly.
                      dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                    />
                  ) : null}
                  <div className="mt-1 break-all text-[11px] tabular-nums text-ink">{sku.id}</div>

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
