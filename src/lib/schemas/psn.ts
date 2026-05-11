/**
 * PSN Zod schemas — mirror file in usa-errands-api/src/common/schemas/psn.schema.ts.
 */

import { z } from "zod";

const tierSchema = z.enum(["SMALL", "MEDIUM", "LARGE", "X_LARGE", "PALLET"]);
export type StorageTier = z.infer<typeof tierSchema>;

export const psnLineInputSchema = z.object({
  productId: z.string().uuid(),
  declaredQty: z.coerce.number().int().positive().max(100_000),
  notes: z.string().max(500).optional(),
});
export type PsnLineInput = z.infer<typeof psnLineInputSchema>;

export const declaredBoxCountsSchema = z.record(tierSchema, z.coerce.number().int().nonnegative().max(1000));

export const createPsnSchema = z.object({
  expectedArrivalDate: z.coerce.date().optional(),
  carrier: z.string().min(2).max(60).optional(),
  masterTracking: z.string().min(3).max(80).optional(),
  declaredBoxCounts: declaredBoxCountsSchema.refine(
    (obj) => Object.values(obj).some((v) => (v ?? 0) > 0),
    { message: "Declare at least one box." },
  ),
  notes: z.string().max(1000).optional(),
  lines: z.array(psnLineInputSchema).min(1, "At least one line is required."),
});
export type CreatePsnInput = z.infer<typeof createPsnSchema>;

export const PSN_STATUS = [
  "DRAFT",
  "SUBMITTED",
  "AWAITING_RECEIPT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "DISCREPANCY",
  "CANCELLED",
  // Migration 0020 — Phase 2 admin receiving outcomes.
  "HOLD",
  "REJECTED",
  "RETURN_REQUESTED",
] as const;
export type PsnStatus = (typeof PSN_STATUS)[number];

/** Shape of the active-hold response from GET /v1/psns/:id/active-hold. */
export interface ActiveHold {
  id: string;
  extraChargeCents: number;
  reasonCode: string;
  reasonNote: string;
  releaseAfter: string;
}

export interface PublicPsn {
  id: string;
  status: PsnStatus;
  expectedArrivalDate: string | null;
  carrier: string | null;
  masterTracking: string | null;
  declaredBoxCounts: Partial<Record<StorageTier, number>>;
  notes: string | null;
  onboardingFeeCents: number | null;
  onboardingFeePaidAt: string | null;
  submittedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string;
    productId: string;
    skuId: string | null;
    declaredQty: number;
    receivedQty: number;
    acceptedQty: number;
    damagedQty: number;
    notes: string | null;
  }>;
}
