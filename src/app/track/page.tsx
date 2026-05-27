"use client";

/**
 * Public tracking landing page.
 *
 * Audience: a customer (or vendor) with a USA Errands tracking number who
 * wants to look up shipment status without signing in. Submitting routes
 * to `/track/<trackingNumber>` which renders the per-shipment detail
 * page (already built).
 *
 * This page lives OUTSIDE the (marketing) and (portal) route groups so
 * it can render its own minimal header — buyers landing here from a
 * carrier email shouldn't see vendor-acquisition CTAs.
 *
 * Validation: tracking numbers are loose by design (carriers use very
 * different formats — USPS 22-digit, UPS 1Z..., FedEx 12-digit, DHL
 * 10-digit, EasyPost test ids, etc.). We require 6–40 alphanumeric+dash
 * characters, which is wider than any real carrier format but excludes
 * obvious typos like single-character or whitespace-only inputs.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const TRACKING_PATTERN = /^[A-Z0-9-]{6,40}$/;

const SUPPORTED_CARRIERS = ["USPS", "UPS", "FedEx", "DHL"] as const;

export default function TrackLandingPage(): JSX.Element {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    // Normalise: trim, strip internal whitespace, uppercase. Carriers
    // are case-insensitive and users sometimes paste in copies that
    // contain stray spaces ("1Z ABC ..." or "1Z ABC...").
    const normalised = tracking.replace(/\s+/g, "").toUpperCase();
    if (normalised.length === 0) {
      setError("Please enter a tracking number.");
      return;
    }
    if (!TRACKING_PATTERN.test(normalised)) {
      setError(
        "That doesn't look like a valid tracking number. Check the carrier email and try again.",
      );
      return;
    }
    // Route to the detail page. encodeURIComponent for safety even
    // though we restricted the character set above.
    router.push(`/track/${encodeURIComponent(normalised)}`);
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Minimal own header — no vendor nav, since this page is for end
          customers, not seller prospects. */}
      <header className="border-b border-line bg-cream-soft/90 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[64rem] items-center justify-between px-8">
          <Link href="/" className="text-[18px] font-bold tracking-[0.5px] text-ink">
            USA ERRANDS
          </Link>
          <span className="font-mono text-mono-label uppercase text-text-muted">Tracking</span>
        </nav>
      </header>

      <main className="mx-auto max-w-[44rem] px-8 py-12">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ Tracking ]</div>
        <h1 className="mt-2 text-display font-medium tracking-[-0.4px] text-ink">
          Track your shipment.
        </h1>
        <p className="mt-3 max-w-prose text-body text-text-muted">
          Enter the tracking number from your shipment confirmation email or your seller&apos;s
          dashboard. We&apos;ll show you live status from the carrier — no account needed.
        </p>

        <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-4" noValidate>
          <Field label="Tracking number" error={error ?? undefined}>
            <Input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              placeholder="1Z999AA10123456784"
              value={tracking}
              onChange={(e) => {
                setTracking(e.target.value);
                if (error) setError(null);
              }}
              invalid={!!error}
              maxLength={50}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="amber" size="lg" withArrow>
              Track shipment
            </Button>
          </div>
        </form>

        {/* Two reassurance blocks — minimal, factual. */}
        <section className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-white p-5">
            <div className="font-mono text-mono-label uppercase text-text-muted">
              Supported carriers
            </div>
            <p className="mt-2 text-body-sm text-text">
              {SUPPORTED_CARRIERS.join(" · ")}. We surface the carrier&apos;s status updates
              alongside our own warehouse events.
            </p>
          </div>
          <div className="rounded-md border border-line bg-white p-5">
            <div className="font-mono text-mono-label uppercase text-text-muted">No account?</div>
            <p className="mt-2 text-body-sm text-text">
              You don&apos;t need one to look up a shipment. Sellers see the same view inside
              their portal with their own controls.
            </p>
          </div>
        </section>

        {/* Hint for personal-shopper buyers — they don't have a carrier
            tracking number until we ship; before that, the right entry
            point is the magic-link email. */}
        <aside className="mt-8 rounded-sm border-l-4 border-amber bg-amber/10 px-5 py-4">
          <div className="font-mono text-mono-label uppercase text-amber">
            Personal Shopper buyer?
          </div>
          <p className="mt-1 text-body-sm text-text">
            If you&apos;re a USA Errands personal-shopper buyer, your order has its own private
            thread — open the link in any email we&apos;ve sent you (subject starts with{" "}
            <code className="font-mono text-[12px]">[SHP-…]</code>). The tracking number above
            arrives in your thread automatically once we ship.
          </p>
        </aside>

        {/* Help row */}
        <p className="mt-8 text-body-sm text-text-muted">
          Can&apos;t find your tracking number? Check the order or shipment confirmation email
          from your seller, or contact support at{" "}
          <a
            href="mailto:hello@myusaerrands.com"
            className="font-medium text-ink underline-offset-4 hover:underline"
          >
            hello@myusaerrands.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
