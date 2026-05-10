/**
 * Personal Shopper — Zod schemas mirroring
 * usa-errands-api/src/common/schemas/shopper.schema.ts.
 *
 * Both halves of the contract are validated client-side AND server-side. The
 * server is authoritative; client schemas exist to surface errors in-place
 * before the network round-trip.
 *
 * KEEP IN SYNC with the API copy.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enum mirrors
// ---------------------------------------------------------------------------

export const SHOPPER_REQUEST_STATUS = [
  "AWAITING_INTAKE_PAYMENT",
  "PAID",
  "PROCURING",
  "AWAITING_RECONCILIATION",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type ShopperRequestStatus = (typeof SHOPPER_REQUEST_STATUS)[number];

export const SHOPPER_SHIPPING_METHOD = [
  "PLATFORM_FREIGHT",
  "BUYER_FORWARDER",
  "PICKUP",
] as const;
export type ShopperShippingMethod = (typeof SHOPPER_SHIPPING_METHOD)[number];

export const SHOPPER_LINE_PROCUREMENT_STATUS = [
  "pending",
  "purchased",
  "unavailable",
  "substituted",
] as const;
export type ShopperLineProcurementStatus =
  (typeof SHOPPER_LINE_PROCUREMENT_STATUS)[number];

export const SHOPPER_MESSAGE_SENDER = ["BUYER", "ADMIN"] as const;
export type ShopperMessageSender = (typeof SHOPPER_MESSAGE_SENDER)[number];

// ---------------------------------------------------------------------------
// Address — optional at intake; admin captures in chat if missing.
// ---------------------------------------------------------------------------

export const shopperShippingAddressSchema = z.object({
  recipientName: z.string().trim().min(1, "Required.").max(120),
  recipientPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,20}$/, "7–20 digits, optional leading +.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  line1: z.string().trim().min(1, "Required.").max(120),
  line2: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  city: z.string().trim().min(1, "Required.").max(80),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "2-letter state abbreviation."),
  postalCode: z.string().trim().min(3, "Required.").max(12),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "2-letter ISO country.")
    .default("US"),
});
export type ShopperShippingAddress = z.infer<typeof shopperShippingAddressSchema>;

// ---------------------------------------------------------------------------
// Intake form — wire shape (server expects cents)
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  productUrl: z
    .string()
    .trim()
    .url("Must be a full URL (https://…).")
    .max(2048, "URL is too long."),
  productNotes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  quantity: z
    .number()
    .int("Whole number.")
    .min(1, "At least 1.")
    .max(100, "Up to 100 per line."),
  estimatedUnitPriceCents: z
    .number()
    .int("Whole cents.")
    .nonnegative("Cannot be negative.")
    .max(2_500_000, "Too large."),
});

export const createShopperRequestSchema = z.object({
  buyerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email.")
    .max(254),
  buyerName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  shippingAddress: shopperShippingAddressSchema.optional(),
  lines: z
    .array(lineSchema)
    .min(1, "Add at least one item.")
    .max(50, "Up to 50 items per request."),
  initialMessage: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type CreateShopperRequestInput = z.infer<typeof createShopperRequestSchema>;

// ---------------------------------------------------------------------------
// Buyer message post (thread page)
// ---------------------------------------------------------------------------

export const postShopperMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message can't be empty.")
    .max(10000, "Up to 10,000 characters."),
  attachmentUrls: z
    .array(z.string().url().max(2048))
    .max(10, "Up to 10 attachments per message.")
    .optional()
    .default([]),
});
export type PostShopperMessageInput = z.infer<typeof postShopperMessageSchema>;

// ---------------------------------------------------------------------------
// Server response shapes
// ---------------------------------------------------------------------------

export interface ShopperLineSnapshot {
  id: string;
  productUrl: string;
  productTitle: string | null;
  productNotes: string | null;
  quantity: number;
  estimatedUnitPriceCents: number;
  actualUnitPriceCents: number | null;
  procurementStatus: ShopperLineProcurementStatus | null;
}

export interface ShopperRequestSnapshot {
  id: string;
  status: ShopperRequestStatus;
  buyerEmail: string;
  buyerName: string | null;
  shippingAddress: ShopperShippingAddress | null;
  shippingMethod: ShopperShippingMethod | null;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  itemsSubtotalCents: number;
  commissionCents: number;
  // Migration 0013/0014 — U.S. sales tax. Estimated at intake from the
  // state-keyed rate map; actual captured at procurement.
  estimatedTaxRateBps: number;
  estimatedTaxCents: number;
  actualTaxCents: number | null;
  effectiveTaxState: string | null;
  intakeTotalCents: number;
  intakePaidAt: string | null;
  itemsActualSubtotalCents: number | null;
  shippingCostCents: number | null;
  followupAmountCents: number | null;
  followupResolvedAt: string | null;
  createdAt: string;
  lines: ShopperLineSnapshot[];
}

export interface ShopperMessageSnapshot {
  id: string;
  sender: ShopperMessageSender;
  body: string;
  attachmentUrls: string[];
  createdAt: string;
}

export interface ShopperThreadResponse {
  request: ShopperRequestSnapshot;
  messages: ShopperMessageSnapshot[];
}

export interface CreateShopperRequestResponse {
  requestId: string;
  threadUrl: string;
  payUrl: string;
  intakeTotalCents: number;
}
