"use client";

/**
 * Order confirmation (Migration 0059). Reached after the processor redirects
 * back on success. Clears the cart and reassures the buyer; tracking arrives by
 * email once the warehouse ships.
 */
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { useMarketplaceCart } from "../../../../marketplace/cart-context";
import { useStore } from "../../store-shell";

function Confirmation() {
  const store = useStore();
  const params = useParams<{ reference: string }>();
  const search = useSearchParams();
  const paid = search.get("paid") === "1";
  const { clear } = useMarketplaceCart();

  useEffect(() => {
    if (paid) clear();
  }, [paid, clear]);

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
