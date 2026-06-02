/**
 * Site logo (Arrow Box · concept 07).
 *
 * Two exports:
 *   - SiteMark — just the box-with-amber-arrow square, for tight spaces
 *     (favicon, mobile header collapse, social avatar).
 *   - SiteLogo — mark + "USA Errands" wordmark, for desktop headers.
 *
 * Lives in one place so colour, kerning, and proportions never drift
 * between the marketing header, the admin sidebar, the auth pages,
 * and the favicon. Tweak here, every surface inherits.
 *
 * Implementation notes:
 *   - Renders the brand mark from /public/myusalogo-mark.png (a tightly
 *     cropped version of the master myusalogo.png).
 *   - Server-component-safe (no client hooks). Drop into any page.
 *   - `tone` prop swaps text colour for dark backgrounds (admin sidebar
 *     is ink-on-ink, marketing header is ink-on-cream).
 */

import type { JSX } from "react";

type Tone = "ink" | "inverse";

interface SiteMarkProps {
  /** Tailwind size class on the wrapping <span>. Default: h-6 w-6. */
  className?: string;
  /** Optional ARIA label override. Default: "USA Errands". */
  label?: string;
}

/**
 * The mark only — the USA Errands globe-and-parcel logo. Rendered from a
 * tightly cropped PNG so it fills its box at any header/favicon size.
 */
export function SiteMark({ className = "h-6 w-6", label = "USA Errands" }: SiteMarkProps): JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/myusalogo-mark.png"
      alt={label}
      className={`${className} object-contain`}
    />
  );
}

interface SiteLogoProps {
  /** "ink" for cream/light backgrounds, "inverse" for dark backgrounds. */
  tone?: Tone;
  /** Optional className passed to the outer flex container. */
  className?: string;
  /**
   * Mark size class. Defaults to h-9 w-9 — sized to balance the
   * title-case "USA Errands" wordmark at header heights. Pass
   * smaller (e.g. h-7 w-7) for compact contexts.
   */
  markClassName?: string;
  /** Set true to hide the wordmark and only render the mark. */
  markOnly?: boolean;
  /** Show the "PERSONAL SHOPPER · FULFILLMENT" eyebrow under the wordmark. */
  showTagline?: boolean;
}

/**
 * Full lockup — Arrow Box mark + "USA Errands" title-case wordmark.
 * Mirrors brand concept 07 (the picked direction). Used in marketing
 * header, admin sidebar, signin/signup chrome. Pass `showTagline` to
 * surface "PERSONAL SHOPPER · FULFILLMENT" beneath the wordmark on contexts
 * that have room for it (footer, signup hero).
 */
export function SiteLogo({
  tone = "ink",
  className = "",
  markClassName = "h-9 w-9",
  markOnly = false,
  showTagline = false,
}: SiteLogoProps): JSX.Element {
  const wordColour = tone === "inverse" ? "text-text-inv" : "text-ink";
  const taglineColour = tone === "inverse" ? "text-white/55" : "text-text-muted";
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <SiteMark className={markClassName} />
      {markOnly ? null : (
        <span className="flex flex-col">
          <span
            className={`text-[20px] font-medium leading-none tracking-[-0.4px] ${wordColour} sm:text-[22px]`}
          >
            USA Errands
          </span>
          {showTagline ? (
            <span
              className={`mt-1 font-mono text-[10px] uppercase tracking-[2px] ${taglineColour}`}
            >
              PERSONAL SHOPPER · FULFILLMENT
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
