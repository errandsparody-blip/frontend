/**
 * Orders — Zod schemas mirroring usa-errands-api/src/common/schemas/order.schema.ts.
 *
 * Both halves of the contract are validated client-side AND server-side. The
 * server is authoritative; client schemas exist to surface errors in-place
 * before the network round-trip.
 */

import { z } from "zod";

export const ORDER_STATUS = [
  "DRAFT",
  "SUBMITTED",
  "ALLOCATED",
  "LABEL_PURCHASED",
  "PICKING",
  "PACKED",
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED",
  // Migration 0037 — terminal hand-off status for VENDOR_CARRIER orders.
  // The platform never observes carrier-side tracking for these, so
  // "handed off to the vendor's carrier" is as far as we go.
  "HANDED_OFF",
  "EXCEPTION",
  "CANCELLED",
  "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const ORDER_CANCEL_REASON = [
  "VENDOR_REQUEST",
  "OUT_OF_STOCK",
  "ADDRESS_INVALID",
  "CARRIER_REFUSED",
  "FRAUD_HOLD",
  "OTHER",
] as const;
export type OrderCancelReason = (typeof ORDER_CANCEL_REASON)[number];

// ---------------------------------------------------------------------------
// Recipient — shared by quote + create.
// ---------------------------------------------------------------------------

// Stricter street line — must include a space (number + name), at least 4
// chars. Single-token garbage like "ADE" gets rejected at the format layer
// before we burn a Shippo address-validation API call.
const streetLine = z
  .string()
  .trim()
  .min(4, "Street is too short.")
  .max(120)
  .refine((s) => /\s/.test(s), "Street must include a number and a street name.");

// Phone validator — 10 US digits, ignoring formatting noise. Reject the
// obvious placeholders (long runs of repeated digits, classic sequences)
// because vendors typing those clearly aren't entering a real number.
const phoneUS10 = z
  .string()
  .trim()
  .transform((s) => s.replace(/[^\d+]/g, ""))
  .pipe(z.string().regex(/^(\+?1)?\d{10}$/, "US phone must be 10 digits."))
  .refine((s) => {
    const digits = s.replace(/[^\d]/g, "").slice(-10);
    if (/(\d)\1{4,}/.test(digits)) return false;
    if (/01234567|12345678|23456789|98765432|87654321/.test(digits)) return false;
    return true;
  }, "Phone number looks like a placeholder.")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const recipientAddressSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(2, "Recipient name is too short.")
    .max(120)
    .refine((s) => /\s|[A-Za-z]{3,}/.test(s), "Use a real name (first + last)."),
  recipientPhone: phoneUS10,
  recipientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email.")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  shipAddressLine1: streetLine,
  shipAddressLine2: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  shipCity: z
    .string()
    .trim()
    .min(2, "City is too short.")
    .max(80)
    .regex(/[A-Za-z]/, "City must contain letters."),
  shipState: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "2-letter state."),
  shipPostalCode: z.string().trim().toUpperCase().min(3).max(12),
  shipCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "2-letter country.").default("US"),
});
export type RecipientAddress = z.infer<typeof recipientAddressSchema>;

// ---------------------------------------------------------------------------
// Address-only validation result — server returns this from /orders/validate-address
// ---------------------------------------------------------------------------

export interface AddressValidationResponse {
  outcome: "ACCEPTED" | "NEEDS_VERIFICATION" | "REJECTED";
  detail?: string;
  suggested?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

// ---------------------------------------------------------------------------
// Line + create
// ---------------------------------------------------------------------------

export const orderLineInputSchema = z.object({
  skuId: z.string().min(4).max(80),
  quantity: z.coerce.number().int().positive().max(10_000),
});
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

export const quoteOrderSchema = z.object({
  recipient: recipientAddressSchema,
  lines: z.array(orderLineInputSchema).min(1).max(50),
  preferredService: z.string().trim().max(60).optional(),
  insuranceRequested: z.boolean().default(false),
});
export type QuoteOrderInput = z.infer<typeof quoteOrderSchema>;

export const createOrderSchema = z.object({
  externalReference: z
    .string()
    .trim()
    .max(80)
    .regex(/^[A-Za-z0-9_\-./#]*$/, "Letters, digits, and -_./# only.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  recipient: recipientAddressSchema,
  lines: z.array(orderLineInputSchema).min(1).max(50),
  // Migration 0037 — branches the order pipeline. Mirrors the backend
  // contract: PLATFORM_SHIP requires `carrierService`; VENDOR_CARRIER
  // requires `vendorCarrier` with either a label URL or carrier +
  // tracking. The backend re-validates with the same superRefine — the
  // frontend version exists so client-side submit blocks fast.
  fulfillmentMode: z.enum(["PLATFORM_SHIP", "VENDOR_CARRIER"]).default("PLATFORM_SHIP"),
  carrierService: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  insuranceRequested: z.boolean().default(false),
  maxAcceptableTotalCents: z.coerce.number().int().positive().max(50_000_000).optional(),
  vendorCarrier: z
    .object({
      vendorCarrierName: z
        .string()
        .trim()
        .min(2)
        .max(60)
        .optional()
        .or(z.literal("").transform(() => undefined)),
      vendorTrackingNumber: z
        .string()
        .trim()
        .min(4)
        .max(80)
        .optional()
        .or(z.literal("").transform(() => undefined)),
      vendorLabelUrl: z
        .string()
        .url()
        .max(2048)
        .optional()
        .or(z.literal("").transform(() => undefined)),
    })
    .optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ---------------------------------------------------------------------------
// Public types from the API
// ---------------------------------------------------------------------------

export interface PublicOrder {
  id: string;
  /**
   * Monotonic, platform-assigned order number. Rendered as `#${orderNumber}`
   * (e.g. `#1625`) — this is THE customer-facing identifier. Server-generated
   * from a Postgres sequence so it's globally unique and never reused.
   */
  orderNumber: number;
  externalReference: string | null;
  status: OrderStatus;
  recipient: {
    name: string;
    phone: string | null;
    email: string | null;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  carrier: string | null;
  carrierService: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  itemsDeclaredValueCents: number;
  shippingCostCents: number;
  shippingFeeCents: number;
  fulfillmentFeeCents: number;
  insuranceFeeCents: number;
  totalChargedCents: number;
  reassessmentDeltaCents: number;
  cancelReason: OrderCancelReason | null;
  cancelNote: string | null;
  submittedAt: string | null;
  allocatedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Migration 0018 — when the vendor's return window expires for this
   * order. Computed server-side as `deliveredAt + returns_window_days`.
   * Null if the order isn't delivered yet (no return possible anyway).
   * Frontend hides the "Request return" CTA when this is in the past.
   */
  returnableUntil: string | null;
  /**
   * Migration 0037 — fulfillment branch:
   *   PLATFORM_SHIP   USA Errands buys + prints the carrier label.
   *   VENDOR_CARRIER  Vendor brings their own label / carrier. We
   *                   store their tracking + optional label URL and
   *                   skip the Shippo round-trips.
   * Server defaults to PLATFORM_SHIP for pre-migration rows so this
   * is always present on the wire.
   */
  fulfillmentMode: "PLATFORM_SHIP" | "VENDOR_CARRIER";
  vendorCarrierName: string | null;
  vendorTrackingNumber: string | null;
  vendorLabelUrl: string | null;
  handedOffAt: string | null;
  lines: Array<{
    id: string;
    skuId: string;
    productCode: string;
    productName: string;
    variant: string;
    quantity: number;
    declaredValueCents: number;
    allocationStatus: string;
  }>;
}

export interface QuoteRateOption {
  carrier: string;
  service: string;
  estimatedDeliveryDays: number;
  shippingCostCents: number;
  fees: {
    shippingCostCents: number;
    shippingFeeCents: number;
    fulfillmentFeeCents: number;
    insuranceFeeCents: number;
    totalChargedCents: number;
  };
  rateProviderRef: string;
  ratePurchasedRef: string;
}

export interface QuoteResult {
  addressValidation: {
    outcome: "ACCEPTED" | "NEEDS_VERIFICATION" | "REJECTED";
    detail?: string;
  };
  totalUnits: number;
  declaredValueCents: number;
  rates: QuoteRateOption[];
}
