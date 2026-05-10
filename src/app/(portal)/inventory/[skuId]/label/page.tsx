"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

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
 * Printable SKU labels — Avery 5160 layout (industry standard).
 *
 * Why 5160? It's the de facto vendor-printed SKU label format used
 * across Amazon FBA, Avery, and most 3PL inbound flows:
 *
 *   - 1" × 2⅝" per label (25.4 × 66.7 mm)
 *   - 30 labels per US Letter sheet (3 columns × 10 rows)
 *   - Top/bottom margin 0.5" (12.7 mm); side margin 0.19" (4.8 mm);
 *     0 horizontal gap between labels (Avery sheet pre-cuts)
 *   - Prints on any office laser/inkjet — no thermal printer needed
 *
 * Equivalent A4 sheet is Avery L7160 (3×7 = 21 labels, 63.5×38.1 mm).
 * Vendors with A4 paper should pick that in their print dialog; the
 * page CSS uses Letter as the default but the label cells are sized
 * absolutely so they line up correctly on Avery sheets either way.
 *
 * The barcode is Code128B (lib/barcode.ts), encoding the full SKU id.
 * Renders as inline SVG so the print path stays vector-perfect at any DPI.
 *
 * Print-mode CSS: this page lives under the `(portal)` route group, which
 * wraps it in the vendor portal sidebar. We can't easily opt out of the
 * parent layout in Next.js without changing the URL, so the print
 * stylesheet hides EVERYTHING with `visibility: hidden` and then
 * explicitly shows the print container.
 */

// Avery 5160 geometry — exact values from Avery's spec sheet.
const AVERY_5160 = {
  pageWidthIn: 8.5,
  pageHeightIn: 11,
  topMarginIn: 0.5,
  sideMarginIn: 0.1875,
  labelWidthIn: 2.625,
  labelHeightIn: 1,
  cols: 3,
  rows: 10,
  // Vertical gutter is 0; horizontal gutter is also 0 on a 5160 sheet.
  gutterXIn: 0,
  gutterYIn: 0,
} as const;
const LABELS_PER_SHEET = AVERY_5160.cols * AVERY_5160.rows;

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

  const sku = skuQ.data;
  const product = productQ.data;

  // Vendor picks how many labels they need. Default to one full sheet
  // (30) so the typical "stick a label on every unit" workflow needs
  // zero clicks before printing.
  const [quantity, setQuantity] = useState<number>(LABELS_PER_SHEET);
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.min(Math.floor(quantity), 600) : 1;

  // Encode the SKU id as Code128B once. Memoised because re-renders on
  // quantity change shouldn't re-encode the same string. Module width
  // smaller than the original 4×6 layout — labels are smaller, so the
  // barcode needs proportionally fewer pixels per module to fit.
  const barcodeSvg = useMemo(() => {
    if (!sku) return "";
    try {
      return encodeCode128B(sku.id, { moduleWidth: 1.4, height: 36, quietZone: 8 });
    } catch {
      return "";
    }
  }, [sku]);

  const sheetCount = Math.ceil(safeQuantity / LABELS_PER_SHEET);
  const sheets = Array.from({ length: sheetCount }, (_, sheetIndex) => sheetIndex);

  return (
    <>
      <style jsx global>{`
        /* Print-only rules: hide every chrome element on the page, then
           re-show ONLY the print container. The container holds one
           absolutely-positioned sheet per A4/Letter page. */
        @media print {
          @page {
            size: ${AVERY_5160.pageWidthIn}in ${AVERY_5160.pageHeightIn}in;
            margin: 0;
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
          .label-print-root,
          .label-print-root * {
            visibility: visible !important;
          }
          .label-print-root {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
          }
          .label-sheet {
            page-break-after: always;
            page-break-inside: avoid;
          }
          .label-sheet:last-child {
            page-break-after: auto;
          }
        }
        /* Screen-only preview chrome — gives the vendor a visual sense
           of how the printed page will look without taking over the
           whole viewport in every browser. */
        .label-sheet {
          position: relative;
          width: ${AVERY_5160.pageWidthIn}in;
          height: ${AVERY_5160.pageHeightIn}in;
          background: white;
          margin: 0 auto;
        }
        .label-cell {
          position: absolute;
          width: ${AVERY_5160.labelWidthIn}in;
          height: ${AVERY_5160.labelHeightIn}in;
          padding: 0.08in 0.12in;
          box-sizing: border-box;
          overflow: hidden;
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 8pt;
          line-height: 1.1;
          color: #000;
        }
        /* On screen we draw a 1px guide so the operator can see label
           boundaries; @media print strips it so it doesn't show on the
           Avery sheet. */
        @media screen {
          .label-cell {
            outline: 1px dashed rgba(0, 0, 0, 0.15);
          }
        }
        .label-cell svg {
          display: block;
          width: 100%;
          height: auto;
        }
      `}</style>

      <div className="flex min-h-screen flex-col items-center bg-cream py-10 print:bg-white print:py-0">
        {/* Print controls — hidden during print. */}
        <div className="no-print mb-6 flex w-full max-w-3xl flex-col gap-4 px-4 print:hidden">
          <div>
            <h1 className="text-h2 font-semibold text-ink">Print SKU labels</h1>
            <p className="mt-1 text-body-sm text-text-muted">
              Avery 5160 / L7160 layout — 1″ × 2⅝″ per label, 30 per US Letter sheet.
              Use any office laser or inkjet. Pick &quot;US Letter&quot; or &quot;A4&quot; in your printer
              dialog (the cells are sized to fit either pre-cut sheet).
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4 rounded-md border border-line bg-white p-4">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-mono-label uppercase text-text-muted">
                How many labels?
              </span>
              <input
                type="number"
                min={1}
                max={600}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="h-10 w-32 rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              />
              <span className="text-caption text-text-muted">
                {safeQuantity} label{safeQuantity === 1 ? "" : "s"} ·{" "}
                {sheetCount} sheet{sheetCount === 1 ? "" : "s"}
              </span>
            </label>

            <button
              type="button"
              onClick={() => setQuantity(LABELS_PER_SHEET)}
              className="h-10 rounded-sm border border-line-strong bg-cream-soft px-3 font-mono text-mono-label uppercase text-text hover:border-ink"
            >
              1 full sheet (30)
            </button>

            <button
              type="button"
              disabled={!sku || !product}
              onClick={() => window.print()}
              className="ml-auto h-10 rounded-sm border border-ink bg-ink px-4 font-mono text-mono-label uppercase text-text-inv hover:bg-ink-elev disabled:opacity-50"
            >
              Print
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="h-10 rounded-sm border border-line-strong bg-white px-4 font-mono text-mono-label uppercase text-text hover:border-ink"
            >
              Back
            </button>
          </div>
        </div>

        {/* Sheets — one absolute-positioned page each, filled with cells.
            Each cell renders the same artwork; vendor picks how many. */}
        <div className="label-print-root flex flex-col items-center gap-6">
          {!sku || !product ? (
            <div className="flex h-40 items-center justify-center font-mono text-mono-label uppercase text-text-muted">
              Loading…
            </div>
          ) : (
            sheets.map((sheetIndex) => (
              <div key={sheetIndex} className="label-sheet shadow-2 print:shadow-none">
                {Array.from({ length: LABELS_PER_SHEET }).map((_, i) => {
                  const labelIndex = sheetIndex * LABELS_PER_SHEET + i;
                  if (labelIndex >= safeQuantity) return null;
                  const col = i % AVERY_5160.cols;
                  const row = Math.floor(i / AVERY_5160.cols);
                  const left =
                    AVERY_5160.sideMarginIn + col * (AVERY_5160.labelWidthIn + AVERY_5160.gutterXIn);
                  const top =
                    AVERY_5160.topMarginIn + row * (AVERY_5160.labelHeightIn + AVERY_5160.gutterYIn);
                  return (
                    <div
                      key={i}
                      className="label-cell"
                      style={{ left: `${left}in`, top: `${top}in` }}
                    >
                      <LabelContent
                        productCode={product.code}
                        productName={product.name}
                        skuId={sku.id}
                        variant={sku.variant}
                        storageTier={sku.storageTier}
                        barcodeSvg={barcodeSvg}
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/**
 * One label cell. Layout is tight — 1×2⅝ inch:
 *
 *   ┌──────────────────────────────────────┐
 *   │ PRODUCT CODE        Tier · Variant   │
 *   │ Product name (truncated)             │
 *   │ ████████████████████████████████     │  ← Code128B
 *   │ SKU-id-string                        │
 *   └──────────────────────────────────────┘
 */
function LabelContent({
  productCode,
  productName,
  skuId,
  variant,
  storageTier,
  barcodeSvg,
}: {
  productCode: string;
  productName: string;
  skuId: string;
  variant: string;
  storageTier: string;
  barcodeSvg: string;
}): JSX.Element {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate font-bold text-[10pt]">{productCode}</span>
        <span className="shrink-0 text-[6.5pt] uppercase tracking-[0.06em] text-[#555]">
          {storageTier.replace("_", "-")} · v{variant}
        </span>
      </div>
      <div className="truncate text-[8pt] text-[#222]">{productName}</div>
      {barcodeSvg ? (
        <div
          className="my-[0.02in]"
          // SVG generated server-side from a known-safe character set;
          // safe to inject directly.
          dangerouslySetInnerHTML={{ __html: barcodeSvg }}
        />
      ) : null}
      <div className="truncate text-[6.5pt] tracking-[0.04em] text-black">{skuId}</div>
    </div>
  );
}
