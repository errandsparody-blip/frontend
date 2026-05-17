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
 *   - Pure SVG, no images. Scales crisp from 16px favicon to billboard.
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
 * The mark only — a 100×100 square with a box outline, amber tape
 * stripe, and a forward chevron arrow inside. Lossless at any size.
 */
export function SiteMark({ className = "h-6 w-6", label = "USA Errands" }: SiteMarkProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      className={className}
    >
      <title>{label}</title>
      {/* Box body */}
      <rect x="6" y="22" width="88" height="56" fill="none" stroke="#0A0A0A" strokeWidth="3.5" />
      {/* Lid seam */}
      <line x1="6" y1="32" x2="94" y2="32" stroke="#0A0A0A" strokeWidth="2" />
      {/* Amber packing tape */}
      <rect x="6" y="28" width="88" height="4" fill="#C99428" />
      {/* Chevron arrow inside · "out for delivery" */}
      <path
        d="M 30 42 L 50 42 L 50 36 L 70 50 L 50 64 L 50 58 L 30 58 Z"
        fill="#C99428"
        stroke="#0A0A0A"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
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
  /** Show the "PERSONAL SHOPPER · 3PL" eyebrow under the wordmark. */
  showTagline?: boolean;
}

/**
 * Full lockup — Arrow Box mark + "USA Errands" title-case wordmark.
 * Mirrors brand concept 07 (the picked direction). Used in marketing
 * header, admin sidebar, signin/signup chrome. Pass `showTagline` to
 * surface "PERSONAL SHOPPER · 3PL" beneath the wordmark on contexts
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
              PERSONAL SHOPPER · 3PL
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
