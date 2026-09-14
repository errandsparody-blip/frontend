"use client";

/**
 * The per-store cart has been retired — there is ONE cart for the whole
 * marketplace. A storefront shares the marketplace cart, so this route just
 * forwards to /marketplace/cart (keeps old links + bookmarks working).
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function StoreCartRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/marketplace/cart");
  }, [router]);
  return (
    <div className="py-20 text-center font-mono text-mono-label text-text-subtle">
      Taking you to your cart…
    </div>
  );
}
