"use client";

/**
 * The per-store checkout has been retired — checkout always happens through the
 * single marketplace checkout (one cart, one checkout for the whole platform).
 * This route forwards to /marketplace/checkout so old links keep working.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function StoreCheckoutRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/marketplace/checkout");
  }, [router]);
  return (
    <div className="py-20 text-center font-mono text-mono-label text-text-subtle">
      Taking you to checkout…
    </div>
  );
}
