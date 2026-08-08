/**
 * Returns — Zod schemas + response types mirroring
 * usa-errands-api/src/common/schemas/return.schema.ts (Returns v2).
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
  "INSTRUCTED",
  "RESTOCKED",
  "DISPOSED",
  "DONATED",
  "REJECTED",
  "CANCELLED",
] as const;
export type ReturnStatus = (typeof RETURN_STATUS)[number];

/**
 * Statuses the vendor is allowed to cancel from. Mirrors the
 * service-side allow-list — keep in sync.
 */
export const CANCELLABLE_RETURN_STATUSES: ReadonlyArray<ReturnStatus> = ["REQUESTED", "AUTHORIZED"];

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  NOT_AS_DESCRIBED: "Not as described",
  DEFECTIVE: "Defective",
  WRONG_ITEM: "Wrong item shipped",
  CHANGED_MIND: "Customer changed mind",
  ARRIVED_DAMAGED: "Arrived damaged",
  NEVER_DELIVERED: "Never delivered",
  OTHER: "Other",
};

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: "On its way",
  AUTHORIZED: "Authorized",
  IN_TRANSIT: "In transit",
  RECEIVED: "Received",
  INSPECTED: "Inspected — your instructions needed",
  INSTRUCTED: "Instructions received",
  RESTOCKED: "Restocked",
  DISPOSED: "Disposed",
  DONATED: "Donated",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
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
  // Returns v2 — the customer pays return shipping, so the vendor gives
  // us the inbound tracking + expected delivery date. Sent as strings;
  // the API coerces the date.
  inboundCarrier: z.string().trim().max(60).optional(),
  inboundTracking: z.string().trim().min(1, "Return tracking number is required.").max(128),
  expectedDeliveryDate: z.string().min(1, "Expected delivery date is required."),
  attachmentUrls: z
    .array(z.string().url().max(2048))
    .max(5, "Up to 5 attachments per RMA.")
    .optional()
    .default([]),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

// ---------------------------------------------------------------------------
// Vendor — disposition instructions
// ---------------------------------------------------------------------------

export const instructReturnLineSchema = z.object({
  returnLineId: z.string().uuid(),
  restockQty: z.number().int().nonnegative().max(10_000).default(0),
  disposeQty: z.number().int().nonnegative().max(10_000).default(0),
  donateQty: z.number().int().nonnegative().max(10_000).default(0),
});
export type InstructReturnLineInput = z.infer<typeof instructReturnLineSchema>;

export const instructReturnSchema = z.object({
  lines: z.array(instructReturnLineSchema).min(1),
});
export type InstructReturnInput = z.infer<typeof instructReturnSchema>;

// ---------------------------------------------------------------------------
// Admin — inspect (photos + condition) + finalize
// ---------------------------------------------------------------------------

export const inspectReturnSchema = z.object({
  receivedPhotoUrls: z
    .array(z.string().url().max(2048))
    .min(1, "Attach at least one photo of the received items.")
    .max(20, "Up to 20 photos."),
  conditionNotes: z.string().trim().min(1, "Describe the condition.").max(2000),
});
export type InspectReturnInput = z.infer<typeof inspectReturnSchema>;

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

export const finalizeReturnSchema = z.object({
  handlingCostCents: z.number().int().nonnegative().max(50_000_000).default(0),
  disposalOverrideReason: z.string().trim().max(500).optional(),
});
export type FinalizeReturnInput = z.infer<typeof finalizeReturnSchema>;

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
  donatedQty: number;
  notes: string | null;
}

export interface ReturnSnapshot {
  id: string;
  rmaCode: string;
  orderId: string;
  vendorId: string;
  status: ReturnStatus;
  reason: ReturnReason;
  // Returns v2 money — the vendor is CHARGED for the return work; there
  // is no refund. processingFeeCents + handlingCostCents are set at
  // finalize.
  processingFeeCents: number;
  handlingCostCents: number;
  inboundCarrier: string | null;
  inboundTracking: string | null;
  expectedDeliveryDate: string | null;
  inspectorNotes: string | null;
  /** Vendor-supplied evidence at creation. */
  attachmentUrls: string[];
  /** Photos USA Errands took of the received items. */
  receivedPhotoUrls: string[];
  createdAt: string;
  receivedAt: string | null;
  inspectedAt: string | null;
  resolvedAt: string | null;
  lines: ReturnLineSnapshot[];
}

export interface ReturnListResponse {
  items: ReturnSnapshot[];
  nextCursor: string | null;
}

/** Total charged to the vendor for a return (processing fee + handling). */
export function returnChargeCents(
  r: Pick<ReturnSnapshot, "processingFeeCents" | "handlingCostCents">,
): number {
  return (r.processingFeeCents ?? 0) + (r.handlingCostCents ?? 0);
}
