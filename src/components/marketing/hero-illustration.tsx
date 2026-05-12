/**
 * HeroIllustration — editorial SVG illustration for the marketing
 * homepage hero, in lieu of a stock photo.
 *
 * WHY THIS EXISTS.
 * ----------------
 * The original brief called for a photo of a person handing over a
 * parcel. We tried Unsplash photos, but without a way to preview the
 * IDs from this environment the picks landed wrong twice (shopping
 * bags + skincare bottles). An SVG built to the design system is
 * deterministic — what's in the file is what renders — and guarantees
 * the hero is on-brand and on-topic from day one.
 *
 * Composition:
 *   - A stylized cardboard parcel, slightly tilted, with the amber
 *     "tape" accent that matches the SiteMark logo.
 *   - Two ink silhouette hands receiving / handing over the box.
 *   - An amber sun arc in the background (the "destination").
 *   - Soft cream backdrop with a scatter of dots suggesting motion.
 *
 * Design tokens used:
 *   - ink (#0A0A0A) for the figure silhouettes + box outline
 *   - amber (#C99428) for the tape stripe + sun arc
 *   - cream (#F1EFE9) and cream-soft (#F5F4F0) for the background
 *   - line tokens for the box surfaces
 *
 * SWAP TO A REAL PHOTO.
 * ---------------------
 * To replace this with a real photograph later:
 *   1. Drop the image into `usa-errands-web/public/` (e.g. hero.jpg).
 *   2. In `src/app/(marketing)/page.tsx`, change `HERO_IMAGE_URL` to
 *      `/hero.jpg` and uncomment the existing <img> block.
 *   3. Delete this file once you're sure you won't roll back.
 */

export function HeroIllustration({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 400 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A pair of hands passing a parcel — every USA Errands delivery, in one frame."
      className={className}
      // Always render the full image. The parent <div> handles the
      // 4:5 aspect-ratio crop so the illustration scales rather than
      // stretches.
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Backdrop — cream-soft fill so the rest of the page's
          cream tone reads as a continuation. */}
      <rect width="400" height="500" fill="#F5F4F0" />

      {/* Amber sun arc — sits low and behind the parcel, suggesting
          the destination horizon. Half-circle so it grounds the
          composition without competing with the parcel. */}
      <circle cx="200" cy="320" r="135" fill="#C99428" opacity="0.18" />
      <circle cx="200" cy="320" r="95" fill="#C99428" opacity="0.32" />

      {/* Scatter of dots — suggests motion / a delivery path. We
          place them at deterministic positions so the image doesn't
          jitter between renders. */}
      <g fill="#0A0A0A" opacity="0.18">
        <circle cx="50" cy="80" r="2.5" />
        <circle cx="90" cy="40" r="2" />
        <circle cx="350" cy="60" r="2.5" />
        <circle cx="320" cy="110" r="2" />
        <circle cx="40" cy="200" r="2" />
        <circle cx="360" cy="220" r="2.5" />
        <circle cx="60" cy="380" r="2" />
        <circle cx="350" cy="400" r="2.5" />
        <circle cx="200" cy="40" r="2" />
      </g>

      {/* Subtle dotted route arc from upper-left to upper-right,
          visually reinforcing "cross-border journey." Dashed stroke
          rather than a solid line so it reads as a path, not a
          divider. */}
      <path
        d="M 60 120 Q 200 60 340 120"
        stroke="#0A0A0A"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />

      {/* Parcel — main subject. Tilted slightly to feel passed
          rather than placed. The shape is built from a quadrilateral
          path so the perspective is consistent. */}
      <g transform="translate(200 280) rotate(-6)">
        {/* Box front face — kraft / cream-deep fill, ink stroke. */}
        <rect
          x="-90"
          y="-65"
          width="180"
          height="130"
          fill="#E8E5DC"
          stroke="#0A0A0A"
          strokeWidth="3"
          rx="2"
        />
        {/* Top flap shadow — a subtle ink fill across the top edge
            gives the box a sense of depth without a full 3D render. */}
        <rect
          x="-90"
          y="-65"
          width="180"
          height="14"
          fill="#0A0A0A"
          opacity="0.08"
        />
        {/* Amber tape — runs vertically across the box. Mirrors the
            same amber strip on the SiteMark logo, so the brand
            fingerprint shows up even without the wordmark. */}
        <rect x="-12" y="-65" width="24" height="130" fill="#C99428" />
        <rect
          x="-12"
          y="-65"
          width="24"
          height="130"
          fill="none"
          stroke="#A07A1F"
          strokeWidth="0.5"
          opacity="0.5"
        />
        {/* Shipping label — small ink-bordered rectangle, mock copy
            kept generic so it reads as "label" without being
            distracting. */}
        <rect
          x="-78"
          y="-50"
          width="50"
          height="30"
          fill="#FFFFFF"
          stroke="#0A0A0A"
          strokeWidth="1"
        />
        <line
          x1="-72"
          y1="-42"
          x2="-34"
          y2="-42"
          stroke="#0A0A0A"
          strokeWidth="1.2"
        />
        <line
          x1="-72"
          y1="-37"
          x2="-44"
          y2="-37"
          stroke="#0A0A0A"
          strokeWidth="1"
          opacity="0.6"
        />
        <line
          x1="-72"
          y1="-32"
          x2="-40"
          y2="-32"
          stroke="#0A0A0A"
          strokeWidth="1"
          opacity="0.6"
        />
        <line
          x1="-72"
          y1="-27"
          x2="-50"
          y2="-27"
          stroke="#0A0A0A"
          strokeWidth="1"
          opacity="0.6"
        />
      </g>

      {/* Receiving hand — bottom-right, stylized silhouette
          reaching up. Built from a single rounded path so it reads
          as a hand without anatomical detail. */}
      <g transform="translate(290 410)">
        <path
          d="M 0 0
             L -8 -55
             Q -8 -78 8 -78
             Q 24 -78 24 -55
             L 24 -38
             L 32 -55
             Q 36 -65 46 -60
             Q 54 -54 50 -42
             L 38 -10
             Q 30 8 8 8
             Q -4 8 -8 0 Z"
          fill="#0A0A0A"
        />
        {/* Cuff line — a thin amber-ink stripe near the wrist for
            visual interest + reinforces the brand palette. */}
        <line
          x1="-10"
          y1="0"
          x2="32"
          y2="0"
          stroke="#C99428"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      {/* Giving hand — top-left, reaching down toward the parcel.
          Mirrors the receiving hand so the composition reads as a
          handoff between two parties. */}
      <g transform="translate(110 215) rotate(180)">
        <path
          d="M 0 0
             L -8 -55
             Q -8 -78 8 -78
             Q 24 -78 24 -55
             L 24 -38
             L 32 -55
             Q 36 -65 46 -60
             Q 54 -54 50 -42
             L 38 -10
             Q 30 8 8 8
             Q -4 8 -8 0 Z"
          fill="#0A0A0A"
          opacity="0.9"
        />
        <line
          x1="-10"
          y1="0"
          x2="32"
          y2="0"
          stroke="#C99428"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      {/* Caption block underneath the parcel — small mono label so
          the illustration reads as "design", not "clip art." */}
      <g transform="translate(200 470)">
        <text
          x="0"
          y="0"
          textAnchor="middle"
          fontFamily="'JetBrains Mono', monospace"
          fontSize="9"
          letterSpacing="1.4"
          fill="#0A0A0A"
          opacity="0.45"
        >
          PARCEL · HANDOFF · DELIVERED
        </text>
      </g>
    </svg>
  );
}
