/**
 * Shipping-point range table — verbatim mirror of the backend.
 *
 * Introduced by migration 0040. Keep in sync with:
 *   usa-errands-api/src/common/schemas/shipping-points.ts
 * If you edit one, edit the other in the SAME commit — the shape is
 * the wire contract between the admin editor UI and the config row.
 */

export type Cents = number;

export interface ShippingPointBucket {
  /** Inclusive lower bound in points. */
  pointsMin: number;
  /** Upper bound in points. Half-open EXCEPT on the last bucket. */
  pointsMax: number;
  /** Estimated shipping range floor, in cents. */
  dollarsMin: Cents;
  /** Estimated shipping range ceiling, in cents. */
  dollarsMax: Cents;
}

export interface ShippingPointRangeTable {
  buckets: ShippingPointBucket[];
}

/**
 * Compile-in fallback used by the editor page as a "reset to
 * default" affordance. Seeded value is the page-11 table from the
 * Fulfillment v2 spec. Kept in sync with the backend constant.
 */
export const DEFAULT_SHIPPING_POINT_RANGES: ShippingPointRangeTable = {
  buckets: [
    { pointsMin: 0,   pointsMax: 0.5, dollarsMin: 500,  dollarsMax: 800 },
    { pointsMin: 0.5, pointsMax: 1.5, dollarsMin: 800,  dollarsMax: 1200 },
    { pointsMin: 1.5, pointsMax: 3,   dollarsMin: 1200, dollarsMax: 1800 },
    { pointsMin: 3,   pointsMax: 5,   dollarsMin: 1800, dollarsMax: 2500 },
  ],
};
