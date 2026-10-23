"use client";

/**
 * Shared printable SKU label view — one label per page + Code128B barcode.
 *
 * Used by both the vendor flow (`/inventory/[skuId]/label`) and the admin
 * flow (`/admin/inventory/[skuId]/label`). The two pages differ only in
 * where they fetch the SKU data from (vendor-scoped vs admin-scoped API),
 * not in how the label is rendered. Centralising the layout here keeps
 * the two surfaces byte-for-byte identical — if an operator prints an
 * admin-side label and a vendor prints a vendor-side label for the same
 * SKU, they MUST come out the same, or scanners will get confused at
 * receive time.
 *
 * ── Printing model (the Shippo model) ──────────────────────────────────
 * We follow the same rule a shipping-label provider like Shippo uses: the
 * PAGE is sized to the LABEL, not to a sheet of office paper. Shippo's
 * "4x6 PDF" is a page that is exactly the 4×6 label with no surrounding
 * whitespace; the physical paper (a thermal roll, or "fit to A4/Letter" on
 * an office printer) is then chosen in the printer's own dialog.
 *
 * So here `@page { size }` is set to the label's own dimensions
 * (2.625in × 1in) with zero margin. One label fills one printed page —
 * never a lone sticker stranded in the corner of a full A4/Letter sheet.
 * The operator's print dialog decides the real paper and any scaling; the
 * system does NOT force A4 or Letter.
 *
 * Default quantity is 1 (the normal "print a label for this SKU" case).
 * The quantity field is kept for the occasional "I need a few" run — each
 * additional label is simply another label-sized page, so they feed
 * straight onto a label roll or print one-per-sheet on an office printer.
 *
 * The barcode is Code128B (lib/barcode.ts), encoding the full SKU id.
 * Renders as inline SVG so the print path stays vector-perfect at any DPI.
 *
 * Print-mode CSS: the host page lives under a route-group layout (portal
 * sidebar or admin sidebar). We can't easily opt out of the parent layout
 * in Next.js without changing the URL, so the print stylesheet hides
 * EVERYTHING with `visibility: hidden` and then explicitly shows the print
 * container.
 */

import { useMemo, useState } from "react";

import { encodeCode128B } from "@/lib/barcode";

// Label geometry. 1" × 2⅝" is the de-facto vendor-printed SKU label size
// (Avery 5160 / Amazon FBA / most fulfillment inbound flows). We print it
// one-per-page rather than 30-up on an Avery sheet so the page IS the
// label — see the header note on the Shippo printing model.
const LABEL = {
  widthIn: 2.625,
  heightIn: 1,
} as const;

// Hard cap on a single print run. Nobody needs tens of thousands of pages;
// this just stops a paste-bombed value from locking up the tab.
const MAX_LABELS = 300;

/**
 * The minimum SKU shape needed to render a label. Both vendor and admin
 * SKU endpoints return strict supersets of this; the component takes the
 * narrowest possible interface so neither side accidentally leaks
 * privileged fields (vendor business name, internal warehouse location,
 * audit timestamps, etc.) into the print artefact.
 */
export interface SkuLabelData {
  id: string;
  productCode: string;
  productName: string;
  variant: string;
  storageTier: string;
}

export interface SkuLabelPrintViewProps {
  /** SKU data to render — null while the host page is still fetching. */
  sku: SkuLabelData | null;
  /** Optional heading shown above the controls. Defaults to "Print SKU label". */
  heading?: string;
}

/**
 * Full-page print view: a heading, the control bar (quantity, Print,
 * Back), and the label pages themselves. Designed to take the entire
 * viewport — the host page should render this as its only child.
 */
export function SkuLabelPrintView({
  sku,
  heading = "Print SKU label",
}: SkuLabelPrintViewProps): JSX.Element {
  // Default to a single label — the common "stick one on this SKU" case.
  // The field lets an operator bump it up for a small batch; each extra
  // label is just another label-sized page.
  const [quantity, setQuantity] = useState<number>(1);
  // Defensive clamp — Number() returns NaN for empty strings, and we never
  // want to render hundreds of thousands of pages from a bad value.
  const safeQuantity =
    Number.isFinite(quantity) && quantity > 0
      ? Math.min(Math.floor(quantity), MAX_LABELS)
      : 1;

  // Encode the SKU id as Code128B once. Memoised because re-renders on
  // quantity change shouldn't re-encode the same string. Module width
  // tuned to fit the 2⅝" cell with a quiet zone the scanner needs.
  const barcodeSvg = useMemo(() => {
    if (!sku) return "";
    try {
      return encodeCode128B(sku.id, { moduleWidth: 1.4, height: 36, quietZone: 8 });
    } catch {
      return "";
    }
  }, [sku]);

  const pages = Array.from({ length: safeQuantity }, (_, i) => i);

  return (
    <>
      <style jsx global>{`
        /* Print-only rules: the printed PAGE is sized to the LABEL itself,
           not to A4/Letter — so one label fills one page instead of
           sitting alone in the corner of a big sheet. The physical paper
           and any scaling are chosen in the operator's print dialog; we
           never force a paper size here. */
        @media print {
          @page {
            size: ${LABEL.widthIn}in ${LABEL.heightIn}in;
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
          /* One label = one page. */
          .label-page {
            width: ${LABEL.widthIn}in;
            height: ${LABEL.heightIn}in;
            page-break-after: always;
            page-break-inside: avoid;
            margin: 0 !important;
            box-shadow: none !important;
          }
          .label-page:last-child {
            page-break-after: auto;
          }
        }
        /* One label, sized exactly to the label. On screen we add a light
           guide border + drop shadow so the operator can see the label
           boundary; @media print strips both. */
        .label-page {
          position: relative;
          width: ${LABEL.widthIn}in;
          height: ${LABEL.heightIn}in;
          background: white;
          box-sizing: border-box;
          padding: 0.08in 0.12in;
          overflow: hidden;
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 8pt;
          line-height: 1.1;
          color: #000;
        }
        @media screen {
          .label-page {
            outline: 1px dashed rgba(0, 0, 0, 0.2);
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
          }
        }
        .label-page svg {
          display: block;
          width: 100%;
          height: auto;
        }
      `}</style>

      <div className="flex min-h-screen flex-col items-center bg-cream py-10 print:bg-white print:py-0">
        {/* Print controls — hidden during print. */}
        <div className="no-print mb-6 flex w-full max-w-3xl flex-col gap-4 px-4 print:hidden">
          <div>
            <h1 className="text-h2 font-semibold text-ink">{heading}</h1>
            <p className="mt-1 text-body-sm text-text-muted">
              Prints one label per page at label size (1″ × 2⅝″) — not on a full
              sheet. Choose the paper and any scaling in your printer dialog: a
              label roll / thermal printer prints it as-is, or pick &quot;Fit to
              page&quot; on A4 or Letter.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4 rounded-md border border-line bg-white p-4">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-mono-label uppercase text-text-muted">
                How many copies?
              </span>
              <input
                type="number"
                min={1}
                max={MAX_LABELS}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="h-10 w-32 rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              />
              <span className="text-caption text-text-muted">
                {safeQuantity} label{safeQuantity === 1 ? "" : "s"} ·{" "}
                {safeQuantity} page{safeQuantity === 1 ? "" : "s"}
              </span>
            </label>

            <button
              type="button"
              disabled={!sku}
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

        {/* Label pages — one label per page, each sized to the label. */}
        <div className="label-print-root flex flex-col items-center gap-4">
          {!sku ? (
            <div className="flex h-40 items-center justify-center font-mono text-mono-label uppercase text-text-muted">
              Loading…
            </div>
          ) : (
            pages.map((i) => (
              <div key={i} className="label-page">
                <LabelContent
                  productCode={sku.productCode}
                  productName={sku.productName}
                  skuId={sku.id}
                  variant={sku.variant}
                  storageTier={sku.storageTier}
                  barcodeSvg={barcodeSvg}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/**
 * One label. Layout is tight — 1×2⅝ inch:
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
          // SVG generated server-side from a known-safe character set
          // (Code128B alphabet). Encoder is deterministic and rejects
          // anything outside the safe range. Safe to inject directly.
          dangerouslySetInnerHTML={{ __html: barcodeSvg }}
        />
      ) : null}
      <div className="truncate text-[6.5pt] tracking-[0.04em] text-black">{skuId}</div>
    </div>
  );
}
