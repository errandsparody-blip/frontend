/**
 * BoxDimensionsHero — single composed reference image.
 *
 * The vendor pricing guide ships with one annotated reference photo
 * showing all four box tiers + the standard U.S. pallet, scaled
 * against a 5'9" / 175 cm person, with dimension callouts already
 * baked in. We render it directly so vendors see the exact same
 * picture they'd see in the PDF guide — no chance of the photo
 * drifting out of sync with the printed pricing sheet.
 *
 * Source: public/illustrations/box-dimensions.jpg (1536 × 1024).
 *
 * If finance ever bumps a tier dimension, replace the JPG and the
 * vendor card numbers below — they're sourced from the storage-tiers
 * config so they update automatically wherever the component is
 * imported.
 */

import Image from "next/image";

import { FALLBACK_TIERS, type StorageTierKey } from "@/lib/storage-tiers";

// Inches → centimetres rounded to the nearest whole cm.
function inToCm(inches: number): number {
  return Math.round(inches * 2.54);
}

const ORDERED_KEYS: Array<Exclude<StorageTierKey, "PALLET">> = [
  "SMALL",
  "MEDIUM",
  "LARGE",
  "X_LARGE",
];

const TIER_LABELS: Record<Exclude<StorageTierKey, "PALLET">, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  X_LARGE: "X-Large",
};

export function BoxDimensionsHero(): JSX.Element {
  return (
    <figure className="rounded-md border border-line bg-cream-soft p-6 md:p-8">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <div>
          <div className="font-mono text-mono-eyebrow uppercase tracking-[1.6px] text-amber">
            Storage tiers · to scale
          </div>
          <h3 className="mt-1 text-h3 font-medium leading-tight text-ink">
            Box dimensions
          </h3>
        </div>
        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          All measurements: inches (in) · centimetres (cm)
        </span>
      </figcaption>

      {/* Reference photograph — 3:2 aspect ratio at source. Sits inside
          a thin border so it visually anchors against the warm cream
          surround used throughout the marketing surfaces. */}
      <div className="overflow-hidden rounded-sm border border-line bg-white">
        <Image
          src="/illustrations/box-dimensions.jpg"
          alt="USA Errands storage tiers shown to scale: four box sizes (Small, Medium, Large, X-Large) and a standard U.S. pallet, sized against a 5 foot 9 inch person silhouette. Dimensions labelled in inches and centimetres."
          width={1536}
          height={1024}
          className="block h-auto w-full"
          priority
        />
      </div>

      {/* Per-tier detail cards — full L × W × H selectable + screen-
          reader friendly. The photo above shows the comparison, these
          cards spell out every tier with the exact numbers vendors
          will need when measuring inbound shipments. */}
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        {ORDERED_KEYS.map((key) => {
          const d = FALLBACK_TIERS.dimensions![key];
          return (
            <div
              key={key}
              className="rounded-sm border border-line bg-white p-3"
            >
              <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                {TIER_LABELS[key]}
              </div>
              <div className="mt-1 font-mono text-body text-ink">
                {d.lengthIn} × {d.widthIn} × {d.heightIn} in
              </div>
              <div className="font-mono text-caption text-text-muted">
                {inToCm(d.lengthIn)} × {inToCm(d.widthIn)} × {inToCm(d.heightIn)} cm
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
