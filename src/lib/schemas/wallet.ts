/**
 * Wallet Zod schemas — mirror file in usa-errands-api/src/common/schemas/{wallet,deposit}.schema.ts.
 */

import { z } from "zod";

export const fundStripeSchema = z.object({
  netAmountCents: z.coerce.number().int().positive().min(100).max(10_000_000),
});
export type FundStripeInput = z.infer<typeof fundStripeSchema>;

export type WalletStatus = "ACTIVE" | "STORAGE_OVERDUE" | "SUSPENDED" | "CLOSED";

export interface WalletSnapshot {
  id: string;
  vendorId: string;
  balanceCents: number;
  lowBalanceThresholdCents: number;
  status: WalletStatus;
  updatedAt: string;
}

export const LEDGER_TYPES = [
  "DEPOSIT",
  "ONBOARDING",
  "STORAGE",
  "FULFILLMENT",
  "SHIPPING",
  "RETURN",
  "MANUAL_CREDIT",
  "MANUAL_DEBIT",
  "REVERSAL",
] as const;
export type LedgerEntryType = (typeof LEDGER_TYPES)[number];

export interface PublicLedgerEntry {
  id: string;
  type: LedgerEntryType;
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}
