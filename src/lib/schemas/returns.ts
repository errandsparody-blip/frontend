/**
 * Returns — Zod schemas + response types mirroring
 * usa-errands-api/src/common/schemas/return.schema.ts.
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

export const RETURN_REASON = [
  "NOT_AS_DESCRIBED",
  "DEFECTIVE",
  "WRONG_ITEM",
  "CHANGED_MIND",
  "ARRIVED_DAMAGED",
  "NEVER_DELIVERED",
  "OTHER",
] as const;
export type ReturnReason = (typeof RETURN_REASON)[number];

export const RETURN_STATUS = [
  "REQUESTED",
  "AUTHORIZED",
  "IN_TRANSIT",
  "RECEIVED",
  "INSPECTED",
  "RESTOCKED",
  "DISPOSED",
  "REJECTED",
  "CANCELLED",
] as const;
export type ReturnStatus = (typeof RETURN_STATUS)[number];

/**
 * Statuses the vendor is allowed to cancel from. Mirrors the
 * service-side allow-list — keep in sync.
 */
export const CANCELLABLE_RETURN_STATUSES: ReadonlyArray<ReturnStatus> = ["REQUESTED", "AUTHORIZED"];

/**
 * Reason labels for friendly display in dropdowns + detail pages. The
 * canonical wire value is the SCREAMING_SNAKE enum; this map is for
 * humans only.
 */
export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  NOT_AS_DESCRIBED: "Not as described",
  DEFECTIVE: "Defective",
  WRONG_ITEM: "Wrong item shipped",
  CHANGED_MIND: "Customer changed mind",
  ARRIVED_DAMAGED: "Arrived damaged",
  NEVER_DELIVERED: "Never delivered",
  OTHER: "Other",
};

// ---------------------------------------------------------------------------
// Vendor — create
// ---------------------------------------------------------------------------

export const createReturnLineSchema = z.object({
  orderLineId: z.string().uuid(),
  requestedQty: z
    .number()
    .int("Whole units only.")
    .positive("At least 1.")
    .max(10_000, "Too large."),
});
export type CreateReturnLineInput = z.infer<typeof createReturnLineSchema>;

export const createReturnSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(RETURN_REASON),
  lines: z
    .array(createReturnLineSchema)
    .min(1, "Pick at least one line to return.")
    .max(50, "Up to 50 lines per RMA."),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

// ---------------------------------------------------------------------------
// Admin — receive + inspect (used by the operator queue UI)
// ---------------------------------------------------------------------------

export const receiveReturnLineSchema = z.object({
  returnLineId: z.string().uuid(),
  receivedQty: z
    .number()
    .int("Whole units only.")
    .nonnegative("Cannot be negative.")
    .max(10_000, "Too large."),
});
export type ReceiveReturnLineInput = z.infer<typeof receiveReturnLineSchema>;

export const receiveReturnSchema = z.object({
  lines: z.array(receiveReturnLineSchema).min(1),
});
export type ReceiveReturnInput = z.infer<typeof receiveReturnSchema>;

export const inspectReturnLineSchema = z.object({
  returnLineId: z.string().uuid(),
  restockedQty: z
    .number()
    .int("Whole units only.")
    .nonnegative("Cannot be negative.")
    .max(10_000, "Too large.")
    .default(0),
  damagedQty: z.number().int().nonnegative().max(10_000).default(0),
  disposedQty: z.number().int().nonnegative().max(10_000).default(0),
  notes: z.string().max(500).optional(),
});
export type InspectReturnLineInput = z.infer<typeof inspectReturnLineSchema>;

export const inspectReturnSchema = z.object({
  lines: z.array(inspectReturnLineSchema).min(1),
  refundAmountCents: z
    .number()
    .int("Whole cents.")
    .nonnegative("Cannot be negative.")
    .max(50_000_000, "Too large.")
    .default(0),
  restockFeeCents: z
    .number()
    .int("Whole cents.")
    .nonnegative("Cannot be negative.")
    .max(50_000_000, "Too large.")
    .default(0),
  inspectorNotes: z.string().max(2000).optional(),
});
export type InspectReturnInput = z.infer<typeof inspectReturnSchema>;

// ---------------------------------------------------------------------------
// Server response shapes
// ---------------------------------------------------------------------------

export interface ReturnLineSnapshot {
  id: string;
  orderLineId: string;
  skuId: string;
  requestedQty: number;
  receivedQty: number;
  restockedQty: number;
  damagedQty: number;
  disposedQty: number;
  notes: string | null;
}

export interface ReturnSnapshot {
  id: string;
  rmaCode: string;
  orderId: string;
  vendorId: string;
  status: ReturnStatus;
  reason: ReturnReason;
  refundAmountCents: number;
  restockFeeCents: number;
  inboundCarrier: string | null;
  inboundTracking: string | null;
  inboundLabelUrl: string | null;
  inspectorNotes: string | null;
  createdAt: string;
  authorizedAt: string | null;
  receivedAt: string | null;
  inspectedAt: string | null;
  resolvedAt: string | null;
  lines: ReturnLineSnapshot[];
}

export interface ReturnListResponse {
  items: ReturnSnapshot[];
  nextCursor: string | null;
}

/**
 * Net refund the vendor's wallet receives = refundAmount − restockFee,
 * floored at 0. Mirrors the service-side calculation in return.service.ts
 * so the UI can preview before confirming.
 */
export function netRefundCents(r: Pick<ReturnSnapshot, "refundAmountCents" | "restockFeeCents">): number {
  return Math.max(0, r.refundAmountCents - r.restockFeeCents);
}
