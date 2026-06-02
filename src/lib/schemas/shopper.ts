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
  // Migration 0021 — Phase 2 shopper redesign. Items purchased; waiting
  // for them to physically arrive at the warehouse before shipping out.
  "AWAITING_DELIVERY",
  "AWAITING_RECONCILIATION",
  "READY_TO_SHIP",
  // Migration 0025a — PICKUP-method readiness state. Distinct from
  // READY_TO_SHIP so the UI can show "ready for buyer pickup" instead
  // of "ready to ship" when the method is PICKUP.
  "READY_FOR_PICKUP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  // Migration 0023a — wire-transfer + ID-verification track (high-value).
  "AWAITING_ID_VERIFICATION",
  "ID_UNDER_REVIEW",
  "QUOTE_SENT",
  "AWAITING_WIRE_PAYMENT",
  "WIRE_PROOF_UPLOADED",
  "WIRE_UNDER_REVIEW",
  "WIRE_CONFIRMED",
  "PURCHASE_APPROVED",
] as const;
export type ShopperRequestStatus = (typeof SHOPPER_REQUEST_STATUS)[number];

// Migration 0023 — payment rail. Server-derived; the client never sets it.
export const SHOPPER_PAYMENT_METHOD = ["STRIPE", "WIRE"] as const;
export type ShopperPaymentMethod = (typeof SHOPPER_PAYMENT_METHOD)[number];

// Migration 0023 — gov-ID review lifecycle (WIRE rail only).
export const SHOPPER_ID_VERIFICATION_STATUS = [
  "NONE",
  "PENDING_UPLOAD",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;
export type ShopperIdVerificationStatus =
  (typeof SHOPPER_ID_VERIFICATION_STATUS)[number];

export const SHOPPER_SHIPPING_METHOD = [
  "PLATFORM_FREIGHT",
  // Migration 0025a — buyer supplies their own carrier label.
  "BUYER_FREIGHT",
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

// Strict-ish email regex mirroring the API's check. Catches the common
// typos without trying to be RFC 5322 complete.
const STRICT_EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export const createShopperRequestSchema = z.object({
  buyerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email.")
    .max(254)
    .refine((v) => !v.includes(".."), "Email cannot contain consecutive dots.")
    .refine((v) => STRICT_EMAIL_RE.test(v), "Looks like a typo — double-check the email."),
  // Migration 0023 — required. The wire flow needs a real identity on
  // every request that might cross the threshold; we tighten the schema
  // for ALL requests rather than branching here.
  buyerName: z
    .string()
    .trim()
    .min(1, "Required.")
    .max(120, "Up to 120 characters."),
  // Migration 0023 — required at intake. Loose digit/`+` shape; the
  // canonical formatting is stripped before validation so the buyer can
  // type "(415) 555-1212" without rejection.
  buyerPhone: z
    .string()
    .trim()
    .min(1, "Required.")
    .transform((v) => v.replace(/[\s().-]/g, ""))
    .pipe(
      z
        .string()
        .min(7, "Phone too short.")
        .max(20, "Phone too long.")
        .regex(/^\+?[0-9]+$/, "Digits only (optional leading +)."),
    ),
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
  // Optional link to a previous order by the same buyer ("I forgot something,
  // here's an addition to SHP-000041"). The server verifies the parent
  // exists AND belongs to the same email.
  parentReference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^SHP-[A-Z0-9-]{3,32}$/, "Reference looks like SHP-000042.")
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
  // Migration 0016 — actual per-line weight in ounces, captured at receive.
  actualWeightOz: number | null;
  procurementStatus: ShopperLineProcurementStatus | null;
}

// Migration 0023 — bank-transfer instructions, only ever populated by
// the server when ID is APPROVED + the request is past QUOTE_SENT. The
// shape mirrors the `shopper_bank_instructions` configuration row.
export interface ShopperBankInstructions {
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  swift: string;
  iban: string;
  memo: string;
  notes?: string;
}

export interface ShopperRequestSnapshot {
  id: string;
  // Migration 0015 — short human-readable reference (SHP-000042).
  reference: string;
  parentRequestId: string | null;
  /** Resolved parent reference for display ("addition to SHP-000041"). */
  parentReference: string | null;
  status: ShopperRequestStatus;
  buyerEmail: string;
  buyerName: string | null;
  // Migration 0023 — wire/ID packet visible to the buyer. We never
  // surface the document URLs themselves — booleans tell the UI whether
  // an upload already exists.
  buyerPhone: string | null;
  paymentMethod: ShopperPaymentMethod;
  idVerificationStatus: ShopperIdVerificationStatus;
  idRejectionReason: string | null;
  hasIdDocument: boolean;
  hasIdSelfie: boolean;
  hasWireProof: boolean;
  wireProofUploadedAt: string | null;
  wireConfirmedAt: string | null;
  /**
   * Legacy single bank-instructions block. Kept for back-compat with
   * the original wire-only flow. New requests use `paymentMethods`
   * below; this field will be null on any request the admin hasn't
   * explicitly populated.
   */
  bankInstructions: ShopperBankInstructions | null;
  /**
   * May 2026 — Multi-method manual payment list. One entry per active
   * payment channel the admin enabled in shopper config. The buyer
   * picks one in the UI and pays externally. Empty array means no
   * methods are configured / active, or the request isn't in a
   * payment-pending state yet.
   */
  paymentMethods: Array<{
    /** Stable identifier — "wire" | "ach" | "zelle" | "cashapp". */
    code: string;
    /** Display name shown on the picker card and as the section header. */
    label: string;
    /**
     * Generic label → value map. Field set varies per method (see
     * admin config card). Frontend renders each entry as a labelled
     * row in the order the server returned them.
     */
    details: Record<string, string>;
  }>;
  /**
   * Migration 0027 follow-up — warehouse "Ship From" address sourced
   * from the API's WAREHOUSE_FROM_* env vars. Always present on
   * thread responses (the address isn't sensitive — it's printed on
   * every outbound parcel). The thread page only surfaces it when
   * the buyer is on the BUYER_FREIGHT method so they can generate a
   * prepaid label using these as the origin.
   */
  warehouseShipFrom: {
    name: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
    phone: string;
    email: string;
  };
  /**
   * Admin endpoint includes the raw R2 URLs so operators can preview the
   * documents. Buyer-side these are always undefined — the buyer
   * controller strips them in `serializeBuyerRequest`.
   */
  idDocumentUrl?: string | null;
  idSelfieUrl?: string | null;
  wireProofUrl?: string | null;
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
  // Migration 0016 — packed parcel dimensions + total weight.
  parcelLengthIn: number | null;
  parcelWidthIn: number | null;
  parcelHeightIn: number | null;
  parcelWeightOz: number | null;
  // Migration 0017 — freight rate snapshot + system-calculated cost.
  // Receipt shows "weight × rate = calc · charged X" so any operator
  // override is visible to the buyer.
  freightRateCentsPerLb: number | null;
  shippingCalculatedCents: number | null;
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
  reference: string;
  threadUrl: string;
  /** Empty string when the buyer was routed onto the wire-transfer track. */
  payUrl: string;
  intakeTotalCents: number;
  // Migration 0023 — which rail the server placed this request on.
  paymentMethod: ShopperPaymentMethod;
}

// Migration 0023 — wire-track submission schemas mirroring the API copy.
export const submitShopperIdUploadsSchema = z.object({
  idDocumentUrl: z.string().url().max(2048),
  idSelfieUrl: z.string().url().max(2048),
});
export type SubmitShopperIdUploadsInput = z.infer<typeof submitShopperIdUploadsSchema>;

export const submitShopperWireProofSchema = z.object({
  wireProofUrl: z.string().url().max(2048),
});
export type SubmitShopperWireProofInput = z.infer<typeof submitShopperWireProofSchema>;
