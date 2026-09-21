"use client";

/**
 * Vendor storefront orders (Migration 0059) — a record of sales, what the
 * buyer paid, the speed chosen, and tracking once shipped.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";

interface StorefrontOrder {
  reference: string;
  buyer_email: string;
  status: string;
  total_cents: number;
  product_subtotal_cents: number;
  discount_cents: number;
  shipping_speed: string;
  tracking_number: string | null;
  payout_status: string;
  payout_release_at: string | null;
  created_at: string;
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
function tone(status: string) {
  if (status === "SHIPPED" || status === "DELIVERED") return "success" as const;
  if (status === "PENDING_PAYMENT") return "neutral" as const;
  if (status === "CANCELLED" || status === "REFUNDED") return "error" as const;
  return "info" as const;
}

// The vendor's own earning on a sub-order = product subtotal − discount they
// funded (shipping + tax are the platform's). Delivery/fees never accrue to them.
const vendorEarnCents = (o: StorefrontOrder) =>
  Math.max(0, (o.product_subtotal_cents ?? 0) - (o.discount_cents ?? 0));

/** How the vendor's payout for this order stands. */
function payoutLabel(o: StorefrontOrder): { text: string; tone: "success" | "warning" | "neutral" | "error" | "info" } {
  switch (o.payout_status) {
    case "PAID":
      return { text: "Paid out", tone: "success" };
    case "HELD":
      return {
        text: o.payout_release_at
          ? `Held · releases ${new Date(o.payout_release_at).toLocaleDateString()}`
          : "Held",
        tone: "warning",
      };
    case "PENDING":
    case "FAILED":
      return { text: "Processing", tone: "info" };
    case "CANCELLED":
      return { text: "Refunded", tone: "neutral" };
    default:
      return { text: "—", tone: "neutral" };
  }
}

export default function StorefrontOrdersPage() {
  const orders = useQuery({
    queryKey: ["storefront-orders"],
    queryFn: () => api.get<StorefrontOrder[]>("/storefront/orders"),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Storefront orders" description="Sales from your public store." />
      <Link href="/storefront" className="mb-4 inline-block text-[13px] text-amber hover:underline">
        ← Back to storefront
      </Link>

      {orders.isLoading ? (
        <div className="py-16 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : (orders.data ?? []).length === 0 ? (
        <div className="rounded-lg border border-line bg-white px-6 py-16 text-center text-body-sm text-text-muted">
          No storefront orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">You earn</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payout</th>
                <th className="px-4 py-3">Tracking</th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? []).map((o) => {
                const p = payoutLabel(o);
                return (
                  <tr key={o.reference} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono font-medium text-ink">{o.reference}</td>
                    <td className="px-4 py-3 text-text-muted">{o.buyer_email}</td>
                    <td className="px-4 py-3 font-medium text-ink">{usd(vendorEarnCents(o))}</td>
                    <td className="px-4 py-3"><StatusPill tone={tone(o.status)}>{o.status.replace(/_/g, " ")}</StatusPill></td>
                    <td className="px-4 py-3"><StatusPill tone={p.tone}>{p.text}</StatusPill></td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">{o.tracking_number ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
