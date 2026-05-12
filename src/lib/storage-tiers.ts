/**
 * Storage tier metadata + fallback data.
 *
 * The CANONICAL source of truth for prices + dimensions is the admin
 * config (`fee_schedule` + `tier_dimensions` rows, editable at
 * `/admin/config/fees` and `/admin/config/box-tiers`). The vendor PSN
 * pages call `GET /v1/fees/storage-tiers` and render whatever the
 * server returns — that endpoint reads the same config rows that
 * actually drive the wallet debit at PSN submit, so the displayed
 * numbers can never disagree with what the vendor is charged.
 *
 * This file holds only:
 *   1. Static per-tier METADATA that doesn't live in the admin config
 *      (the human-readable label, the visual "box" scale 1–5 used for
 *      the size graphic on the cards).
 *   2. A FALLBACK price + dimension set used while the API call is
 *      in flight, or if the call fails (offline / 500). The fallback
 *      values are intentionally conservative — they match the seed
 *      defaults so a fresh dev environment still renders sane numbers.
 *
 * If you change a number in the fallback set: make sure it stays in
 * sync with the `prisma/seed.ts` defaults. The fallback is only ever
 * shown when the live data is unreachable.
 */

/** Server-side tier key as it appears in the config rows. */
export type StorageTierKey = "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE" | "PALLET";

/** Canonical ordering used by every UI surface that lists tiers. */
export const STORAGE_TIER_ORDER: ReadonlyArray<StorageTierKey> = [
  "SMALL",
  "MEDIUM",
  "LARGE",
  "X_LARGE",
  "PALLET",
];

/**
 * Per-tier metadata that doesn't live in the admin config: how to label
 * the tier in the UI and how big the visual "box" graphic should be on
 * the card (scale 1 = smallest, 5 = pallet).
 */
export const TIER_METADATA: Record<StorageTierKey, { label: string; scale: 1 | 2 | 3 | 4 | 5 }> = {
  SMALL: { label: "Small", scale: 1 },
  MEDIUM: { label: "Medium", scale: 2 },
  LARGE: { label: "Large", scale: 3 },
  X_LARGE: { label: "X-Large", scale: 4 },
  PALLET: { label: "Pallet", scale: 5 },
};

/**
 * Onboarding entry returned by the API. Mirrors the admin
 * `fee_schedule.onboarding` shape so callers can pass either straight
 * through.
 */
export type StorageTierOnboarding =
  | {
      stockingCents: number;
      firstMonthStorageCents: number;
      totalCents: number;
      negotiated?: false;
    }
  | { negotiated: true };

/** Physical dimensions returned by the API (from `tier_dimensions`). */
export interface StorageTierDimensions {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  maxWeightOz: number;
}

/** Shape of the `/v1/fees/storage-tiers` response. */
export interface StorageTiersResponse {
  onboarding: Record<StorageTierKey, StorageTierOnboarding>;
  monthlyStorage: Record<StorageTierKey, number | null>;
  /** Null when the tier_dimensions config row hasn't been seeded yet. */
  dimensions: Record<StorageTierKey, StorageTierDimensions> | null;
}

/**
 * Pallet handling policy returned by the API (from the `pallet_policy`
 * config row). Read by the storage-tier guide modal + PSN-create page.
 * The numbers are the published "approximate max boxes per pallet" from
 * the pricing guide — vendors see them as guidance, not as a hard
 * server-enforced cap.
 */
export interface PalletPolicy {
  mixedTiersAllowed: boolean;
  maxBoxesPerPallet: Record<
    Exclude<StorageTierKey, "PALLET">,
    number
  >;
}

/** Default pallet policy used while the API call is in flight / fails. */
export const FALLBACK_PALLET_POLICY: PalletPolicy = {
  mixedTiersAllowed: false,
  maxBoxesPerPallet: {
    SMALL: 50,
    MEDIUM: 12,
    LARGE: 8,
    X_LARGE: 8,
  },
};

// ---------------------------------------------------------------------------
// Fallback data — used while the API call is loading OR if it fails.
// Matches the values in `prisma/seed.ts`.
// ---------------------------------------------------------------------------

/**
 * Fallback fees in cents. Conservative numbers that mirror what an
 * admin would see on a freshly-seeded environment. NEVER used to drive
 * real wallet debits — the backend recomputes from its own config row
 * at PSN submit.
 */
export const FALLBACK_TIERS: StorageTiersResponse = {
  onboarding: {
    SMALL: { stockingCents: 1200, firstMonthStorageCents: 900, totalCents: 2100 },
    MEDIUM: { stockingCents: 2200, firstMonthStorageCents: 1400, totalCents: 3600 },
    LARGE: { stockingCents: 4000, firstMonthStorageCents: 1800, totalCents: 5800 },
    X_LARGE: { stockingCents: 6000, firstMonthStorageCents: 2500, totalCents: 8500 },
    // Per-box onboarding fees still apply to boxes ON a pallet — the
    // pallet itself doesn't carry a stocking/first-month charge. The
    // server enforces this by failing PSN submit with `negotiated`
    // unless real per-box tiers are declared alongside.
    PALLET: { negotiated: true },
  },
  monthlyStorage: {
    SMALL: 900,
    MEDIUM: 1400,
    LARGE: 1800,
    X_LARGE: 2500,
    // Static pallet storage — $45/month per pallet-slot occupied.
    PALLET: 4500,
  },
  dimensions: {
    SMALL: { lengthIn: 16, widthIn: 12, heightIn: 12, maxWeightOz: 480 },
    MEDIUM: { lengthIn: 18, widthIn: 18, heightIn: 16, maxWeightOz: 800 },
    LARGE: { lengthIn: 18, widthIn: 18, heightIn: 24, maxWeightOz: 1280 },
    X_LARGE: { lengthIn: 24, widthIn: 18, heightIn: 24, maxWeightOz: 1920 },
    // Standard U.S. pallet — 40×48 footprint × 60 in stacked height.
    PALLET: { lengthIn: 48, widthIn: 40, heightIn: 60, maxWeightOz: 24000 },
  },
};

// ---------------------------------------------------------------------------
// Operational notes + match-the-box callout. These don't depend on the
// live data; they're guidance that always applies.
// ---------------------------------------------------------------------------

export const STORAGE_TIER_NOTES: ReadonlyArray<string> = [
  "Receiving & inventory setup is a one-time fee charged at PSN submit; monthly storage rolls on the 1st of every month.",
  "Pricing is per box — pick the smallest tier your product fits into so you don't over-pay.",
  "Pallet storage covers properly palletized, shrink-wrapped, stable inventory. Per-box receiving fees still apply for every box on the pallet.",
  "Oversized, fragile, hazardous, or irregular inventory may require custom pricing or approval — contact support before shipping.",
];

export const STORAGE_TIER_MATCH_INSTRUCTION = {
  eyebrow: "Important",
  headline: "Match your shipment dimensions to the storage tier",
  body:
    "USA Errands reserves the right to re-tier inventory upon receipt if the " +
    "box dimensions exceed what you declared. Any fee difference is automatically " +
    "debited from your wallet. Measure with a tape — accurate box dimensions " +
    "avoid delays and discrepancy charges.",
} as const;

/**
 * Pallet policy block — surfaced verbatim in the storage-tier guide modal
 * and on the marketing pricing page. The numeric `maxBoxesPerPallet`
 * values are seeded server-side and read at runtime via the
 * `pallet_policy` config row; the prose below is static.
 */
export const PALLET_POLICY_NOTES = {
  whenItApplies: [
    "Properly palletized inventory",
    "Shrink-wrapped and stable pallets",
    "Organized bulk inventory",
    "Low-touch storage inventory",
  ],
  boxRules: [
    "All boxes on a pallet must be the same tier and dimensions",
    "Mixed box sizes on the same pallet are not permitted",
    "Each pallet must remain organized, stable, stack-safe, and uniformly arranged",
  ],
  fullPalletPolicy: [
    "If a pallet reaches its approved maximum, the vendor may create and ship an additional pallet",
    "Each pallet is treated as an individually billed, independently tracked storage unit",
  ],
  receivingFeesNote:
    "Individual receiving & inventory-setup fees still apply to every box on a pallet — USA Errands still performs receiving, counting, inspection, SKU assignment, inventory setup, and warehouse organization before pallets enter storage.",
} as const;

// ---------------------------------------------------------------------------
// Pure helpers — formatting + cubic math. Same function used by every
// surface (vendor cards + modal + marketing pricing page) so the
// rounding rules don't drift.
// ---------------------------------------------------------------------------

/** Cents → "$X.XX" string. Empty cents map to "—". */
export function formatCentsAsDollars(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

/** Cubic inches from dimensions, or null when any dim is missing. */
export function cubicInchesFrom(dims: StorageTierDimensions | undefined | null): number | null {
  if (!dims) return null;
  const v = dims.lengthIn * dims.widthIn * dims.heightIn;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Cubic feet rounded to two decimals, or null when dims are missing. */
export function cubicFeetFrom(dims: StorageTierDimensions | undefined | null): number | null {
  const ci = cubicInchesFrom(dims);
  if (ci == null) return null;
  return Math.round((ci / 1728) * 100) / 100;
}

/** Formatted "L × W × H in · ≤ X lb" label for the card header. */
export function formatDimensionsLabel(dims: StorageTierDimensions | undefined | null): string {
  if (!dims) return "—";
  // Round inches to one decimal so the label reads cleanly even when the
  // admin types fractional measurements. Weight is shown in pounds (rounded
  // to one decimal) — ounces are rare in vendor brand language.
  const w = Math.round((dims.maxWeightOz / 16) * 10) / 10;
  return `${dims.lengthIn} × ${dims.widthIn} × ${dims.heightIn} in · ≤ ${w} lb`;
}
