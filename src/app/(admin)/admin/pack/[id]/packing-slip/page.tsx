"use client";

/**
 * Printable packing slip — Fulfillment v2 / Pack area ONLY.
 *
 * Lives under the (admin) route group, so it's reachable only by admin /
 * warehouse roles — the vendor never sees it. The warehouse operator opens it
 * from the pack queue ("Slip"), prints it, and drops it in the box.
 *
 * It reads the same admin order projection the order-detail page uses
 * (GET /admin/orders/:id), so it always reflects the current lines + ship-to.
 *
 * Print behaviour: the page is a plain Letter-size document. The on-screen
 * controls (Print / Back) are hidden with `@media print`, and the slip itself
 * fills the page. No prices are shown — a packing slip is a contents + ship-to
 * manifest, not an invoice.
 */

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api-client";

interface PackingSlipOrder {
  id: string;
  orderNumber: number;
  externalReference: string | null;
  submittedAt: string | null;
  recipientName: string;
  recipientPhone: string | null;
  shipAddressLine1: string;
  shipAddressLine2: string | null;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
  vendor: { id: string; businessName: string };
  lines: Array<{
    id: string;
    skuId: string;
    productCode: string;
    productName: string;
    variant: string;
    quantity: number;
  }>;
}

export default function PackingSlipPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "order", id, "packing-slip"],
    queryFn: () => api.get<PackingSlipOrder>(`/admin/orders/${id}`),
    enabled: Boolean(id),
  });

  const totalUnits = (data?.lines ?? []).reduce((s, l) => s + l.quantity, 0);

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 8.5in 11in;
            margin: 0.6in;
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
          .slip-root,
          .slip-root * {
            visibility: visible !important;
          }
          .slip-root {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
          }
          /* Printers wash out the on-screen grays — force EVERYTHING on the
             slip to solid black and bold so it's fully legible on paper. */
          .slip-root,
          .slip-root * {
            color: #000 !important;
            font-weight: 700 !important;
            border-color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }
        /* Render the slip in solid black + bold at ALL times (screen and
           print). Printers wash out the design-system grays, and the printed
           slip is the thing that has to be legible — so everything on it is
           forced to #000 and bold, borders included. */
        .slip-root,
        .slip-root * {
          color: #000 !important;
          font-weight: 700 !important;
          border-color: #000 !important;
        }
      `}</style>

      <div className="flex min-h-screen flex-col items-center bg-cream py-10 print:bg-white print:py-0">
        {/* Controls — hidden on print. */}
        <div className="no-print mb-6 flex w-full max-w-3xl items-center justify-between px-4">
          <h1 className="text-h2 font-semibold text-ink">Packing slip</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-10 rounded-sm border border-line-strong bg-white px-4 font-mono text-mono-label uppercase text-text hover:border-ink"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!data}
              onClick={() => window.print()}
              className="h-10 rounded-sm border border-ink bg-ink px-4 font-mono text-mono-label uppercase text-text-inv hover:bg-ink-elev disabled:opacity-50"
            >
              Print
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
        ) : isError || !data ? (
          <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
            Couldn&apos;t load this order.
          </div>
        ) : (
          <div className="slip-root w-full max-w-3xl bg-white p-8 text-ink shadow-1 print:max-w-none print:p-0 print:shadow-none">
            {/* Header */}
            <div className="flex items-start justify-between border-b-2 border-ink pb-4">
              <div>
                <div className="text-[18px] font-bold tracking-[0.5px]">USA ERRANDS</div>
                <div className="font-mono text-[11px] uppercase tracking-[1.6px] text-text-muted">
                  Packing slip
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[20px] font-semibold">#{data.orderNumber}</div>
                {data.externalReference ? (
                  <div className="font-mono text-caption text-text-muted">
                    Ref: {data.externalReference}
                  </div>
                ) : null}
                <div className="font-mono text-caption text-text-muted">
                  {data.submittedAt
                    ? new Date(data.submittedAt).toLocaleDateString()
                    : ""}
                </div>
              </div>
            </div>

            {/* Meta: vendor + ship-to */}
            <div className="mt-5 grid grid-cols-2 gap-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
                  Vendor
                </div>
                <div className="mt-1 text-body">{data.vendor.businessName}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
                  Ship to
                </div>
                <div className="mt-1 text-body font-medium">{data.recipientName}</div>
                <div className="text-body-sm text-text">
                  {data.shipAddressLine1}
                  {data.shipAddressLine2 ? `, ${data.shipAddressLine2}` : ""}
                  <br />
                  {data.shipCity}, {data.shipState} {data.shipPostalCode}
                  <br />
                  {data.shipCountry}
                </div>
                {data.recipientPhone ? (
                  <div className="font-mono text-caption text-text-muted">{data.recipientPhone}</div>
                ) : null}
              </div>
            </div>

            {/* Lines */}
            <table className="mt-6 w-full border-collapse text-body-sm">
              <thead>
                <tr className="border-b-2 border-ink text-left font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
                  <th className="py-2 pr-2">SKU</th>
                  <th className="py-2 pr-2">Product</th>
                  <th className="py-2 pr-2">Variant</th>
                  <th className="py-2 pl-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.id} className="border-b border-line align-top">
                    <td className="py-2 pr-2 font-mono text-[11px]">{l.skuId}</td>
                    <td className="py-2 pr-2">
                      {l.productName}
                      <div className="font-mono text-[10px] text-text-muted">{l.productCode}</div>
                    </td>
                    <td className="py-2 pr-2">{l.variant}</td>
                    <td className="py-2 pl-2 text-right font-semibold tabular-nums">{l.quantity}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink font-mono text-[11px] uppercase tracking-[1.2px]">
                  <td className="py-2" colSpan={3}>
                    Total units
                  </td>
                  <td className="py-2 text-right text-body font-bold tabular-nums">{totalUnits}</td>
                </tr>
              </tfoot>
            </table>

            {/* Footer line for the packer to initial. */}
            <div className="mt-10 flex justify-between font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
              <span>Packed by: ________________</span>
              <span>Checked: ________________</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
