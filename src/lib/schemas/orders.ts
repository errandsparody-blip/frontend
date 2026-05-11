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

export const recipientAddressSchema = z.object({
  recipientName: z.string().trim().min(1, "Required.").max(120),
  recipientPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/, "10–15 digits, optional leading +.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  recipientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email.")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  shipAddressLine1: z.string().trim().min(1, "Required.").max(120),
  shipAddressLine2: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  shipCity: z.string().trim().min(1, "Required.").max(80),
  shipState: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "2-letter state."),
  shipPostalCode: z.string().trim().toUpperCase().min(3).max(12),
  shipCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "2-letter country.").default("US"),
});
export type RecipientAddress = z.infer<typeof recipientAddressSchema>;

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
  carrierService: z.string().trim().min(2).max(60),
  insuranceRequested: z.boolean().default(false),
  maxAcceptableTotalCents: z.coerce.number().int().positive().max(50_000_000).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ---------------------------------------------------------------------------
// Public types from the API
// ---------------------------------------------------------------------------

export interface PublicOrder {
  id: string;
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
