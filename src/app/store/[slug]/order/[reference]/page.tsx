"use client";

/**
 * Order confirmation (Migration 0059). Reached after the processor redirects
 * back on success. Clears the cart and reassures the buyer; tracking arrives by
 * email once the warehouse ships.
 */
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { marketplaceApi } from "@/lib/storefront-api";

import { useMarketplaceCart } from "../../../../marketplace/cart-context";
import { useStore } from "../../store-shell";

function Confirmation() {
  const store = useStore();
  const params = useParams<{ reference: string }>();
  const search = useSearchParams();
  const paid = search.get("paid") === "1" || search.get("status") === "successful";
  const txRef = search.get("tx_ref");
  const transactionId = search.get("transaction_id");
  const { clear, hydrated } = useMarketplaceCart();

  // Confirm the payment server-side from the redirect (verify the transaction
  // and mark the order paid) so the receipt + payout don't depend on the webhook
  // arriving. Idempotent: a no-op if the webhook already marked it paid.
  useEffect(() => {
    if (!paid) return;
    if (!txRef && !transactionId) return;
    marketplaceApi
      .confirmPayment({
        txRef: txRef ?? undefined,
        transactionId: transactionId ?? undefined,
        processor: "FLUTTERWAVE",
      })
      .catch(() => undefined);
  }, [paid, txRef, transactionId]);

  // Clear only once the cart has hydrated from the cookie — otherwise the
  // provider's hydration effect (which runs after this child's effect on mount)
  // reloads the cookie and restores the item we just cleared.
  useEffect(() => {
    if (paid && hydrated) clear();
  }, [paid, hydrated, clear]);

  return (
    <div className="ue-rise-in mx-auto max-w-lg py-16 text-center">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white"
        style={{ background: "var(--store-accent)" }}
      >
        ✓
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
        {paid ? "Thank you for your order" : "Order received"}
      </h1>
      <p className="mt-2 text-body-sm text-text-muted">
        Your order <span className="font-mono font-semibold text-ink">{params.reference}</span> is
        confirmed. We&apos;ve emailed your receipt, and we&apos;ll send tracking as soon as it ships.
      </p>
      <Link
        href={`/store/${store.slug}`}
        className="mt-8 inline-block rounded-full px-6 py-3 text-[13px] font-semibold text-white"
        style={{ background: "var(--store-accent)" }}
      >
        Continue shopping
      </Link>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={null}>
      <Confirmation />
    </Suspense>
  );
}
