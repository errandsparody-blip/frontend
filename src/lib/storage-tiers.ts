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
    SMALL: { stockingCents: 2500, firstMonthStorageCents: 900, totalCents: 3400 },
    MEDIUM: { stockingCents: 4000, firstMonthStorageCents: 1400, totalCents: 5400 },
    LARGE: { stockingCents: 6000, firstMonthStorageCents: 1800, totalCents: 7800 },
    X_LARGE: { stockingCents: 9000, firstMonthStorageCents: 2500, totalCents: 11500 },
    PALLET: { negotiated: true },
  },
  monthlyStorage: {
    SMALL: 900,
    MEDIUM: 1400,
    LARGE: 1800,
    X_LARGE: 2500,
    PALLET: null,
  },
  dimensions: {
    SMALL: { lengthIn: 12, widthIn: 9, heightIn: 4, maxWeightOz: 80 },
    MEDIUM: { lengthIn: 16, widthIn: 12, heightIn: 8, maxWeightOz: 240 },
    LARGE: { lengthIn: 24, widthIn: 18, heightIn: 12, maxWeightOz: 480 },
    X_LARGE: { lengthIn: 36, widthIn: 24, heightIn: 18, maxWeightOz: 1120 },
    PALLET: { lengthIn: 48, widthIn: 40, heightIn: 60, maxWeightOz: 24000 },
  },
};

// ---------------------------------------------------------------------------
// Operational notes + match-the-box callout. These don't depend on the
// live data; they're guidance that always applies.
// ---------------------------------------------------------------------------

export const STORAGE_TIER_NOTES: ReadonlyArray<string> = [
  "Stocking is a one-time fee at PSN submit. Monthly storage rolls every 1st per active SKU bucket.",
  "Pricing is per box — pick the smallest tier your product fits into so you don't over-pay.",
  "Pallet pricing is negotiated based on stackability, turnover rate, and special handling.",
  "Oversized or irregular inventory (hazmat, cold storage, fragile) may require custom pricing — talk to ops.",
];

export const STORAGE_TIER_MATCH_INSTRUCTION = {
  eyebrow: "Important",
  headline: "Match the shipping box with the tier you select",
  body:
    "The tier you pick has to match the actual box dimensions you ship in. " +
    "If our warehouse receives a box that's bigger than the tier you declared, " +
    "we re-tier the line on receipt and your wallet is debited the difference. " +
    "Use a tape measure if you're not sure — it saves a discrepancy charge later.",
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
