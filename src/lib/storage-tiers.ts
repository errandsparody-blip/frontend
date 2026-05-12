/**
 * Storage tier reference data — single source of truth.
 *
 * Shared between the public /pricing page (server component) and the
 * vendor PSN pages (client components). Keeping this in a plain TS
 * module — no React imports — means both halves of the app render off
 * exactly the same values and we never have to remember to update two
 * tables when the operations team adjusts a price.
 *
 * If you change a number here:
 *   1. Make sure the backend fee math in
 *      `usa-errands-api/src/common/order-fees.ts` (and any seed config)
 *      matches. The displayed numbers MUST equal what the wallet
 *      actually debits at PSN submit — vendors compare receipts.
 *   2. Update the vendor agreement (`(marketing)/legal/vendor-agreement`)
 *      if the change is material.
 */

export interface StorageTier {
  /** Short label shown on cards and in tables. */
  tier: string;
  /** Maximum dimensions in inches, with weight ceiling. Used everywhere. */
  sizeInches: string;
  /** Same constraints in metric — modal table only. */
  sizeCm: string;
  /** Per-box stocking fee at PSN submit (display string). */
  stocking: string;
  /** First-month storage fee at PSN submit (display string). */
  storage: string;
  /** Sum of stocking + storage. Displayed prominently on cards. */
  total: string;
  /**
   * Relative size hint used by the visual "box" icon on the inline
   * cards. 1 = smallest, 5 = pallet. Drives the rendered scale so a
   * vendor can eyeball the size hierarchy at a glance.
   */
  scale: 1 | 2 | 3 | 4 | 5;
}

export const STORAGE_TIERS: ReadonlyArray<StorageTier> = [
  {
    tier: "Small",
    sizeInches: "12 × 9 × 4 in · ≤ 5 lbs",
    sizeCm: "30 × 23 × 10 cm · ≤ 2.3 kg",
    stocking: "$1.00",
    storage: "$1.00",
    total: "$2.00",
    scale: 1,
  },
  {
    tier: "Medium",
    sizeInches: "16 × 12 × 8 in · ≤ 15 lbs",
    sizeCm: "40 × 30 × 20 cm · ≤ 6.8 kg",
    stocking: "$2.00",
    storage: "$2.00",
    total: "$4.00",
    scale: 2,
  },
  {
    tier: "Large",
    sizeInches: "24 × 18 × 12 in · ≤ 30 lbs",
    sizeCm: "60 × 45 × 30 cm · ≤ 13.6 kg",
    stocking: "$3.00",
    storage: "$4.00",
    total: "$7.00",
    scale: 3,
  },
  {
    tier: "X-Large",
    sizeInches: "36 × 24 × 18 in · ≤ 70 lbs",
    sizeCm: "90 × 60 × 45 cm · ≤ 31.8 kg",
    stocking: "$5.00",
    storage: "$6.00",
    total: "$11.00",
    scale: 4,
  },
  {
    tier: "Pallet",
    sizeInches: "48 × 40 in pallet · ≤ 1500 lbs",
    sizeCm: "122 × 102 cm · ≤ 680 kg",
    stocking: "Negotiated",
    storage: "Negotiated",
    total: "—",
    scale: 5,
  },
];

/**
 * Operational notes rendered under the tier table on both the modal
 * guide and the marketing pricing page (when used). Keep them short —
 * the boxes are doing most of the explaining.
 */
export const STORAGE_TIER_NOTES: ReadonlyArray<string> = [
  "Stocking is a one-time fee at PSN submit. Storage rolls every 1st of the month per active SKU bucket.",
  "Pricing is per box — pick the smallest tier your product fits into so you don't over-pay.",
  "Pallet pricing is negotiated based on stackability, turnover rate, and special handling.",
  "Oversized or irregular inventory (hazmat, cold storage, fragile) may require custom pricing — talk to ops.",
];

/**
 * Top-of-panel callout. This is the single most important instruction
 * for vendors picking a tier: the BOX they ship in must match the TIER
 * they declared. If we receive a Medium box for a line declared as
 * Small, the operations team re-tiers it on receipt and the wallet is
 * debited the difference. Surfacing this up-front prevents discrepancy
 * disputes after the fact.
 */
export const STORAGE_TIER_MATCH_INSTRUCTION = {
  /** Short eyebrow shown above the headline. */
  eyebrow: "Important",
  /** One-line headline. */
  headline: "Match the shipping box with the tier you select",
  /** Plain-English explanation of the rule. */
  body:
    "The tier you pick has to match the actual box dimensions you ship in. " +
    "If our warehouse receives a box that's bigger than the tier you declared, " +
    "we re-tier the line on receipt and your wallet is debited the difference. " +
    "Use a tape measure if you're not sure — it saves a discrepancy charge later.",
} as const;
