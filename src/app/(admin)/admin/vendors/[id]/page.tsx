/**
 * Admin vendor detail — single-pane operational view.
 *
 * Two parallel queries:
 *   1. /admin/vendors/:id — identity, KYC, agreement, wallet snapshot, KYC actions.
 *   2. /admin/vendors/:id/overview — lifetime stats, recurring storage,
 *      PSNs/orders/returns, ledger preview, inventory by tier, active holds.
 *
 * Layout (left main, right sticky action panel):
 *
 *   ┌───────────────────────────────────┬──────────────────────┐
 *   │ identity                          │ KYC status pills     │
 *   │ social                            │ approve / reject     │
 *   │ wallet snapshot                   │ request resubmission │
 *   │ lifetime stat cards               │                      │
 *   │ recurring storage breakdown       │                      │
 *   │ active holds (if any)             │                      │
 *   │ spend by ledger type              │                      │
 *   │ recent PSNs · orders · returns    │                      │
 *   │ latest ledger entries             │                      │
 *   │ inventory by tier                 │                      │
 *   └───────────────────────────────────┴──────────────────────┘
 *
 * Both queries hit reads only — invalidation only fires after a KYC mutation.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KycStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "REQUIRES_RESUBMISSION"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

interface VendorDetail {
  id: string;
  businessName: string;
  country: string;
  kycStatus: KycStatus;
  kycSubmittedAt: string | null;
  kycApprovedAt: string | null;
  kycRejectedAt: string | null;
  kycRejectionReason: string | null;
  agreementAcceptedAt: string | null;
  agreementVersion: string | null;
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  instagramHandle: string | null;
  tiktokHandle: string | null;
  xHandle: string | null;
  websiteUrl: string | null;
  socialVerifiedAt: string | null;
  createdAt: string;
  primaryUser: {
    id: string;
    email: string;
    emailVerified: boolean;
    mfaEnrolled: boolean;
  } | null;
  wallet: {
    balanceCents: number;
    status: string;
    lowBalanceThresholdCents: number;
  } | null;
  /**
   * KYC v2 — structured submission from the vendor's multi-step wizard.
   * Surfaced here so the reviewer can see every field collected during
   * onboarding. Every field is nullable until the vendor reaches that
   * step; the UI prints "Not provided" placeholders for nulls.
   */
  kycV2?: {
    businessType: string | null;
    businessTypeOther: string | null;
    businessRegistrationNumber: string | null;
    businessRegistrationCountry: string | null;
    businessIndustry: string | null;
    businessIndustryOther: string | null;
    contactFullName: string | null;
    contactPosition: string | null;
    contactPhone: string | null;
    contactAddressLine1: string | null;
    contactAddressLine2: string | null;
    contactCountry: string | null;
    idType: string | null;
    idNumber: string | null;
    idExpirationDate: string | null;
    // KYC v2 Phase 2 — public R2 URLs the reviewer opens to inspect the
    // four uploaded documents (migration 0032). Null until the vendor
    // uploads the matching file in the wizard.
    idFrontUrl: string | null;
    idBackUrl: string | null;
    idSelfieUrl: string | null;
    businessDocUrl: string | null;
    productsStoredDescription: string | null;
    monthlyInventoryVolume: string | null;
    monthlyOrderVolume: string | null;
    primaryShippingCountries: string | null;
    requiresReturnsHandling: boolean | null;
    productHazards: string[];
  };
}

interface VendorOverview {
  vendorId: string;
  psns: {
    total: number;
    byStatus: Record<string, number>;
    recent: Array<{
      id: string;
      status: string;
      carrier: string | null;
      masterTracking: string | null;
      declaredBoxCounts: Record<string, number>;
      onboardingFeeCents: number | null;
      submittedAt: string | null;
      receivedAt: string | null;
      createdAt: string;
    }>;
  };
  orders: {
    total: number;
    byStatus: Record<string, number>;
    lifetimeRevenueCents: number;
    recent: Array<{
      id: string;
      orderNumber: number;
      externalReference: string | null;
      status: string;
      recipientName: string;
      destination: string;
      carrier: string | null;
      trackingNumber: string | null;
      totalChargedCents: number;
      submittedAt: string | null;
      shippedAt: string | null;
      deliveredAt: string | null;
      createdAt: string;
    }>;
  };
  returns: {
    total: number;
    byStatus: Record<string, number>;
    recent: Array<{
      id: string;
      status: string;
      reason: string | null;
      handlingFeeCents: number | null;
      totalRefundCents: number | null;
      createdAt: string;
      inspectedAt: string | null;
    }>;
  };
  inventory: {
    activeSkus: number;
    perTier: Array<{
      tier: string;
      skuCount: number;
      rateCents: number | null;
      subtotalCents: number | null;
    }>;
  };
  recurringStorage: {
    monthlyEstimateCents: number;
    negotiatedTierSkuCount: number;
    perTier: Array<{
      tier: string;
      skuCount: number;
      rateCents: number | null;
      subtotalCents: number | null;
    }>;
  };
  spend: {
    lifetimeSpendCents: number;
    lifetimeDepositCents: number;
    lifetimeRefundCents: number;
    outstandingHoldsCents: number;
    byType: Record<string, { count: number; netCents: number }>;
  };
  ledger: {
    recent: Array<{
      id: string;
      type: string;
      amountCents: number;
      balanceAfterCents: number | null;
      description: string;
      referenceType: string | null;
      referenceId: string | null;
      createdAt: string;
    }>;
  };
  holds: Array<{
    id: string;
    psnId: string;
    extraChargeCents: number;
    reasonCode: string;
    reasonNote: string;
    createdAt: string;
    releaseAfter: string;
    vendorPaidAt: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "At least one full sentence — the vendor sees this verbatim.")
    .max(1000, "Keep it under 1000 characters."),
});
type ReasonInput = z.infer<typeof reasonSchema>;

function kycPillTone(s: KycStatus): "success" | "error" | "warning" {
  if (s === "APPROVED") return "success";
  if (s === "REJECTED" || s === "EXPIRED") return "error";
  return "warning";
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Group a byStatus map into a compact label like "RECEIVED 4 · HOLD 1". */
function formatStatusMap(map: Record<string, number>): string {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ");
}

const PSN_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  AWAITING_RECEIPT: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  DISCREPANCY: "warning",
  CANCELLED: "neutral",
  HOLD: "warning",
  REJECTED: "error",
  RETURN_REQUESTED: "warning",
};

const ORDER_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  ALLOCATED: "info",
  LABEL_PURCHASED: "info",
  PICKING: "warning",
  PACKED: "warning",
  SHIPPED: "info",
  IN_TRANSIT: "info",
  DELIVERED: "success",
  EXCEPTION: "error",
  CANCELLED: "neutral",
  RETURNED: "warning",
};

const LEDGER_LABELS: Record<string, string> = {
  DEPOSIT: "Wallet top-ups",
  ONBOARDING: "Onboarding fees",
  STORAGE: "Storage (recurring)",
  FULFILLMENT: "Fulfillment",
  SHIPPING: "Shipping",
  RETURN: "Returns handling",
  RECEIVING_HOLD_FEE: "Receiving holds",
  MANUAL_DEBIT: "Manual debit",
  MANUAL_CREDIT: "Manual credit",
  REVERSAL: "Reversals",
  REFUND: "Refunds",
  PARTNERSHIP_ITEM_COST: "Partnership cost",
  PURCHASE_FEE: "Purchase fee",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminVendorDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["admin", "vendor", params.id],
    queryFn: () => api.get<VendorDetail>(`/admin/vendors/${params.id}`),
    enabled: !!params.id,
  });

  // Overview is a read-only aggregate — slightly stale is fine.
  // staleTime keeps us off the wire when an admin tabs between vendors.
  const overviewQ = useQuery({
    queryKey: ["admin", "vendor", params.id, "overview"],
    queryFn: () => api.get<VendorOverview>(`/admin/vendors/${params.id}/overview`),
    enabled: !!params.id,
    staleTime: 30_000,
  });

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reasonMode, setReasonMode] = useState<"reject" | "resubmission" | null>(null);

  const reasonForm = useForm<ReasonInput>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: "" },
  });

  const { bannerError, handle, clear } = useApiErrorHandler(reasonForm);

  function clearAction() {
    clear();
    setActionSuccess(null);
  }

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "vendor", params.id] }),
      qc.invalidateQueries({ queryKey: ["admin", "vendor", params.id, "overview"] }),
      qc.invalidateQueries({ queryKey: ["admin", "vendors"] }),
    ]);
  }

  const approveMut = useMutation({
    mutationFn: () => api.post<VendorDetail>(`/admin/vendors/${params.id}/kyc/approve`, {}),
    onMutate: clearAction,
    onSuccess: async () => {
      setActionSuccess("KYC approved. Vendor notified.");
      await invalidateAll();
    },
    onError: (err) => handle(err),
  });

  const rejectMut = useMutation({
    mutationFn: (input: ReasonInput) =>
      api.post<VendorDetail>(`/admin/vendors/${params.id}/kyc/reject`, input),
    onMutate: clearAction,
    onSuccess: async () => {
      setActionSuccess("KYC rejected. Vendor notified.");
      setReasonMode(null);
      reasonForm.reset({ reason: "" });
      await invalidateAll();
    },
    onError: (err) => handle(err),
  });

  const resubmitMut = useMutation({
    mutationFn: (input: ReasonInput) =>
      api.post<VendorDetail>(`/admin/vendors/${params.id}/kyc/request-resubmission`, input),
    onMutate: clearAction,
    onSuccess: async () => {
      setActionSuccess("Resubmission requested. Vendor notified.");
      setReasonMode(null);
      reasonForm.reset({ reason: "" });
      await invalidateAll();
    },
    onError: (err) => handle(err),
  });

  const verifySocialMut = useMutation({
    mutationFn: () => api.post<VendorDetail>(`/admin/vendors/${params.id}/social/verify`, {}),
    onMutate: clearAction,
    onSuccess: async () => {
      setActionSuccess("Social presence marked verified.");
      await invalidateAll();
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  if (detailQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (detailQ.error || !detailQ.data) {
    const normalized = detailQ.error ? normalizeError(detailQ.error) : null;
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "Failed to load vendor"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "The vendor may have been deleted or you don't have access."}
        </p>
      </div>
    );
  }

  const v = detailQ.data;
  const o = overviewQ.data;
  const hasAnyHandle = !!(v.instagramHandle || v.tiktokHandle || v.xHandle || v.websiteUrl);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[02] Vendor"
        title={v.businessName}
        description={`Signed up ${new Date(v.createdAt).toLocaleDateString()} · ${v.country}`}
        actions={<BackButton fallback="/admin/vendors" label="← Back to queue" />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ============== Main column ============== */}
        <div className="flex flex-col gap-6">
          {/* Identity */}
          <section className="rounded-md border border-line bg-white p-6">
            <h2 className="text-h3 font-semibold text-ink">Business identity</h2>
            <dl className="mt-4 grid grid-cols-1 gap-y-3 sm:grid-cols-2 text-body-sm">
              <DT>Business name</DT>
              <DD>{v.businessName}</DD>
              <DT>Country</DT>
              <DD className="font-mono">{v.country}</DD>
              <DT>Primary contact</DT>
              <DD>
                {v.primaryUser ? (
                  <>
                    <a
                      href={`mailto:${v.primaryUser.email}`}
                      className="text-ink underline-offset-4 hover:underline"
                    >
                      {v.primaryUser.email}
                    </a>
                    <span className="ml-2 text-text-muted">
                      {v.primaryUser.emailVerified ? "verified" : "unverified"}
                      {v.primaryUser.mfaEnrolled ? " · MFA on" : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-text-muted">No owner user found.</span>
                )}
              </DD>
              <DT>Account status</DT>
              <DD>
                <StatusPill tone={v.status === "ACTIVE" ? "success" : "warning"}>
                  {v.status.replace(/_/g, " ")}
                </StatusPill>
              </DD>
              <DT>Agreement</DT>
              <DD>
                {v.agreementAcceptedAt
                  ? `Accepted ${new Date(v.agreementAcceptedAt).toLocaleDateString()}${
                      v.agreementVersion ? ` · v${v.agreementVersion}` : ""
                    }`
                  : "Not yet accepted"}
              </DD>
            </dl>
          </section>

          {/* Social presence */}
          <section className="rounded-md border border-line bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-h3 font-semibold text-ink">Social presence</h2>
              {v.socialVerifiedAt ? (
                <StatusPill tone="success">
                  Verified {new Date(v.socialVerifiedAt).toLocaleDateString()}
                </StatusPill>
              ) : hasAnyHandle ? (
                <StatusPill tone="warning">Awaiting review</StatusPill>
              ) : (
                <StatusPill tone="warning">Not provided</StatusPill>
              )}
            </div>
            {hasAnyHandle ? (
              <ul className="mt-5 flex flex-col divide-y divide-line">
                <SocialRow
                  platform="Instagram"
                  handle={v.instagramHandle}
                  href={v.instagramHandle ? `https://www.instagram.com/${v.instagramHandle}` : null}
                />
                <SocialRow
                  platform="TikTok"
                  handle={v.tiktokHandle}
                  href={v.tiktokHandle ? `https://www.tiktok.com/@${v.tiktokHandle}` : null}
                />
                <SocialRow
                  platform="X / Twitter"
                  handle={v.xHandle}
                  href={v.xHandle ? `https://x.com/${v.xHandle}` : null}
                />
                <SocialRow platform="Website" handle={v.websiteUrl} href={v.websiteUrl} />
              </ul>
            ) : (
              <p className="mt-4 font-mono text-mono-label uppercase text-text-muted">
                Vendor has not added any handles yet.
              </p>
            )}
            {hasAnyHandle ? (
              <div className="mt-6 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  loading={verifySocialMut.isPending}
                  disabled={!!v.socialVerifiedAt}
                  onClick={() => verifySocialMut.mutate()}
                >
                  {v.socialVerifiedAt ? "Already verified" : "Mark social verified"}
                </Button>
              </div>
            ) : null}
          </section>

          {/* Reason history (if any) */}
          {v.kycRejectionReason ? (
            <section className="rounded-md border-l-4 border-amber bg-cream-soft p-6">
              <div className="font-mono text-mono-label uppercase text-amber">
                Last reviewer note ·{" "}
                {v.kycStatus === "REJECTED" ? "REJECTION" : "RESUBMISSION REQUEST"}
              </div>
              <p className="mt-2 whitespace-pre-line text-body-sm text-text">
                {v.kycRejectionReason}
              </p>
            </section>
          ) : null}

          {/* KYC v2 — full submission. Surfaces every field the vendor filled
              in via the multi-step wizard. Nulls render as "Not provided" so
              the reviewer sees instantly what's still outstanding. */}
          {v.kycV2 ? <KycV2Card kyc={v.kycV2} submittedAt={v.kycSubmittedAt} /> : null}

          {/* ============================================
              Operational stats — everything from /overview
              ============================================ */}

          {overviewQ.isLoading ? (
            <section className="rounded-md border border-line bg-white p-6 font-mono text-mono-label uppercase text-text-muted">
              Loading operational overview…
            </section>
          ) : overviewQ.error || !o ? (
            <section className="rounded-md border-l-4 border-error bg-error/10 p-5">
              <div className="font-mono text-mono-label uppercase text-error">
                Couldn&apos;t load operational data
              </div>
              <p className="mt-1 text-body-sm text-text">
                Identity panel above is still accurate. Try refreshing or check
                the API logs.
              </p>
            </section>
          ) : (
            <>
              {/* Lifetime stats — five-card row */}
              <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat
                  label="Wallet balance"
                  value={formatCents(v.wallet?.balanceCents ?? null)}
                  tone={
                    v.wallet && v.wallet.balanceCents < (v.wallet.lowBalanceThresholdCents ?? 0)
                      ? "warning"
                      : "ink"
                  }
                />
                <Stat
                  label="Lifetime spend"
                  value={formatCents(o.spend.lifetimeSpendCents)}
                  hint={`${formatCents(o.spend.lifetimeDepositCents)} deposited`}
                />
                <Stat
                  label="Recurring storage"
                  value={formatCents(o.recurringStorage.monthlyEstimateCents)}
                  hint={
                    o.recurringStorage.negotiatedTierSkuCount > 0
                      ? `+${o.recurringStorage.negotiatedTierSkuCount} negotiated SKU(s)`
                      : "per month, current SKUs"
                  }
                />
                <Stat
                  label="PSNs"
                  value={String(o.psns.total)}
                  hint={`${o.inventory.activeSkus} active SKUs`}
                />
                <Stat
                  label="Orders"
                  value={String(o.orders.total)}
                  hint={`${formatCents(o.orders.lifetimeRevenueCents)} charged`}
                />
              </section>

              {/* Active holds — only render if there are any */}
              {o.holds.length > 0 ? (
                <section className="rounded-md border-l-4 border-amber bg-amber/10 p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-h3 font-semibold text-ink">
                      Outstanding receiving holds
                    </h2>
                    <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                      Owes {formatCents(o.spend.outstandingHoldsCents)}
                    </span>
                  </div>
                  <ul className="mt-3 flex flex-col divide-y divide-line">
                    {o.holds.map((h) => (
                      <li
                        key={h.id}
                        className="flex flex-wrap items-baseline justify-between gap-3 py-2 text-body-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-ink">
                            {h.reasonCode.replace(/_/g, " ")} · {formatCents(h.extraChargeCents)}
                          </span>
                          <span className="text-text-muted">{h.reasonNote}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                            Release {new Date(h.releaseAfter).toLocaleDateString()}
                          </span>
                          <Link
                            href={`/admin/psn/${h.psnId}/receive`}
                            className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                          >
                            Open PSN →
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Recurring storage breakdown */}
              <section className="rounded-md border border-line bg-white p-6">
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-h3 font-semibold text-ink">Recurring storage</h2>
                  <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                    Charged on the 1st each month
                  </span>
                </header>
                <p className="mt-1 text-body-sm text-text-muted">
                  Estimate based on active SKUs by tier × current monthly storage
                  rates. Pallet rows are negotiated and excluded from the total.
                </p>
                {o.recurringStorage.perTier.length === 0 ? (
                  <p className="mt-4 font-mono text-mono-label uppercase text-text-muted">
                    No active inventory.
                  </p>
                ) : (
                  <DataTable className="mt-4">
                    <THead>
                      <Th>Tier</Th>
                      <Th align="right">Active SKUs</Th>
                      <Th align="right">Rate / SKU</Th>
                      <Th align="right">Monthly subtotal</Th>
                    </THead>
                    <TBody>
                      {o.recurringStorage.perTier.map((row) => (
                        <TR key={row.tier}>
                          <Td mono>{row.tier.replace("_", "-")}</Td>
                          <Td num>{row.skuCount}</Td>
                          <Td num>
                            {row.rateCents != null ? formatCents(row.rateCents) : "Negotiable"}
                          </Td>
                          <Td num strong>
                            {row.subtotalCents != null
                              ? formatCents(row.subtotalCents)
                              : "Negotiable"}
                          </Td>
                        </TR>
                      ))}
                      <TR className="bg-cream-soft">
                        <Td mono strong>
                          Monthly total
                        </Td>
                        <Td num strong>
                          {o.inventory.activeSkus}
                        </Td>
                        <Td num className="text-text-muted">
                          —
                        </Td>
                        <Td num strong>
                          {formatCents(o.recurringStorage.monthlyEstimateCents)}
                        </Td>
                      </TR>
                    </TBody>
                  </DataTable>
                )}
              </section>

              {/* Spend breakdown by ledger type */}
              <section className="rounded-md border border-line bg-white p-6">
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-h3 font-semibold text-ink">
                    Lifetime spend by category
                  </h2>
                  <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                    From ledger entries
                  </span>
                </header>
                <p className="mt-1 text-body-sm text-text-muted">
                  Every debit and credit on this vendor&apos;s wallet, bucketed
                  by ledger type. Deposits and refunds are positive; everything
                  else is what they&apos;ve paid us.
                </p>
                {Object.keys(o.spend.byType).length === 0 ? (
                  <p className="mt-4 font-mono text-mono-label uppercase text-text-muted">
                    No ledger entries yet.
                  </p>
                ) : (
                  <DataTable className="mt-4">
                    <THead>
                      <Th>Category</Th>
                      <Th align="right">Entries</Th>
                      <Th align="right">Net</Th>
                    </THead>
                    <TBody>
                      {Object.entries(o.spend.byType)
                        .sort(
                          (a, b) => Math.abs(b[1].netCents) - Math.abs(a[1].netCents),
                        )
                        .map(([type, bucket]) => (
                          <TR key={type}>
                            <Td>
                              <div className="font-medium text-ink">
                                {LEDGER_LABELS[type] ?? type.replace(/_/g, " ")}
                              </div>
                              <div className="font-mono text-[11px] text-text-muted">{type}</div>
                            </Td>
                            <Td num>{bucket.count}</Td>
                            <Td
                              num
                              strong
                              className={
                                bucket.netCents > 0
                                  ? "text-success"
                                  : bucket.netCents < 0
                                    ? "text-error"
                                    : "text-text-muted"
                              }
                            >
                              {bucket.netCents > 0 ? "+" : ""}
                              {formatCents(bucket.netCents)}
                            </Td>
                          </TR>
                        ))}
                    </TBody>
                  </DataTable>
                )}
              </section>

              {/* Recent PSNs */}
              <section className="rounded-md border border-line bg-white p-6">
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-h3 font-semibold text-ink">Recent PSNs</h2>
                  <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                    {formatStatusMap(o.psns.byStatus)}
                  </span>
                </header>
                {o.psns.recent.length === 0 ? (
                  <EmptyState
                    title="No PSNs filed yet"
                    description="When this vendor submits a Pre-Shipment Notice it appears here."
                  />
                ) : (
                  <DataTable className="mt-4">
                    <THead>
                      <Th>PSN</Th>
                      <Th>Status</Th>
                      <Th>Boxes declared</Th>
                      <Th align="right">Onboarding fee</Th>
                      <Th>Submitted</Th>
                      <Th align="right">{" "}</Th>
                    </THead>
                    <TBody>
                      {o.psns.recent.map((p) => (
                        <TR key={p.id}>
                          <Td mono strong>
                            {p.id.slice(0, 8)}
                          </Td>
                          <Td>
                            <StatusPill tone={PSN_TONE[p.status] ?? "neutral"}>
                              {p.status.replace(/_/g, " ")}
                            </StatusPill>
                          </Td>
                          <Td className="font-mono text-[11px] text-text-muted">
                            {Object.entries(p.declaredBoxCounts)
                              .filter(([, n]) => n > 0)
                              .map(([t, n]) => `${t.replace("_", "-")}×${n}`)
                              .join(" · ") || "—"}
                          </Td>
                          <Td num>{formatCents(p.onboardingFeeCents)}</Td>
                          <Td className="text-text-muted">
                            {p.submittedAt
                              ? new Date(p.submittedAt).toLocaleDateString()
                              : "—"}
                          </Td>
                          <Td align="right">
                            <Link
                              href={`/admin/psn/${p.id}/receive`}
                              className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                            >
                              Open →
                            </Link>
                          </Td>
                        </TR>
                      ))}
                    </TBody>
                  </DataTable>
                )}
              </section>

              {/* Recent orders */}
              <section className="rounded-md border border-line bg-white p-6">
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-h3 font-semibold text-ink">Recent orders</h2>
                  <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                    {formatStatusMap(o.orders.byStatus)}
                  </span>
                </header>
                {o.orders.recent.length === 0 ? (
                  <EmptyState
                    title="No orders yet"
                    description="Once the vendor sends their first fulfillment request it appears here."
                  />
                ) : (
                  <DataTable className="mt-4">
                    <THead>
                      <Th>Order</Th>
                      <Th>Status</Th>
                      <Th>Recipient</Th>
                      <Th>Carrier</Th>
                      <Th align="right">Total</Th>
                      <Th align="right">{" "}</Th>
                    </THead>
                    <TBody>
                      {o.orders.recent.map((or) => (
                        <TR key={or.id}>
                          <Td mono strong>
                            #{or.orderNumber}
                            {or.externalReference ? (
                              <div className="font-mono text-caption font-normal text-text-muted">
                                {or.externalReference}
                              </div>
                            ) : null}
                          </Td>
                          <Td>
                            <StatusPill tone={ORDER_TONE[or.status] ?? "neutral"}>
                              {or.status.replace(/_/g, " ")}
                            </StatusPill>
                          </Td>
                          <Td>
                            <div className="font-medium text-ink">{or.recipientName}</div>
                            <div className="font-mono text-[11px] text-text-muted">
                              {or.destination}
                            </div>
                          </Td>
                          <Td className="font-mono text-[11px] text-text-muted">
                            {or.carrier ?? "—"}
                            {or.trackingNumber ? ` · ${or.trackingNumber.slice(0, 12)}` : ""}
                          </Td>
                          <Td num>{formatCents(or.totalChargedCents)}</Td>
                          <Td align="right">
                            <Link
                              href={`/admin/orders/${or.id}`}
                              className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                            >
                              Open →
                            </Link>
                          </Td>
                        </TR>
                      ))}
                    </TBody>
                  </DataTable>
                )}
              </section>

              {/* Recent returns */}
              <section className="rounded-md border border-line bg-white p-6">
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-h3 font-semibold text-ink">Recent returns</h2>
                  <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                    {formatStatusMap(o.returns.byStatus)}
                  </span>
                </header>
                {o.returns.recent.length === 0 ? (
                  <EmptyState
                    title="No returns filed"
                    description="Returns from this vendor's customers will appear here once they're submitted."
                  />
                ) : (
                  <DataTable className="mt-4">
                    <THead>
                      <Th>Return</Th>
                      <Th>Status</Th>
                      <Th>Reason</Th>
                      <Th align="right">Refund</Th>
                      <Th align="right">Restock fee</Th>
                      <Th align="right">{" "}</Th>
                    </THead>
                    <TBody>
                      {o.returns.recent.map((r) => (
                        <TR key={r.id}>
                          <Td mono strong>
                            {r.id.slice(0, 8)}
                          </Td>
                          <Td>
                            <StatusPill tone="info">{r.status.replace(/_/g, " ")}</StatusPill>
                          </Td>
                          <Td className="font-mono text-[11px] text-text-muted">
                            {r.reason ?? "—"}
                          </Td>
                          <Td num>{formatCents(r.totalRefundCents)}</Td>
                          <Td num>{formatCents(r.handlingFeeCents)}</Td>
                          <Td align="right">
                            <Link
                              href={`/admin/returns/${r.id}`}
                              className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                            >
                              Open →
                            </Link>
                          </Td>
                        </TR>
                      ))}
                    </TBody>
                  </DataTable>
                )}
              </section>

              {/* Ledger preview */}
              <section className="rounded-md border border-line bg-white p-6">
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-h3 font-semibold text-ink">Latest ledger entries</h2>
                  <Link
                    href={`/admin/finance/transactions?vendorId=${v.id}`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                  >
                    Full ledger →
                  </Link>
                </header>
                {o.ledger.recent.length === 0 ? (
                  <p className="mt-4 font-mono text-mono-label uppercase text-text-muted">
                    No ledger activity yet.
                  </p>
                ) : (
                  <DataTable className="mt-4">
                    <THead>
                      <Th>When</Th>
                      <Th>Type</Th>
                      <Th>Description</Th>
                      <Th align="right">Amount</Th>
                      <Th align="right">Balance after</Th>
                    </THead>
                    <TBody>
                      {o.ledger.recent.map((l) => (
                        <TR key={l.id}>
                          <Td mono className="text-text-muted">
                            {new Date(l.createdAt).toLocaleString()}
                          </Td>
                          <Td className="font-mono text-[11px] uppercase tracking-[1.2px] text-text">
                            {l.type.replace(/_/g, " ")}
                          </Td>
                          <Td>{l.description}</Td>
                          <Td
                            num
                            strong
                            className={
                              l.amountCents > 0
                                ? "text-success"
                                : l.amountCents < 0
                                  ? "text-error"
                                  : "text-text-muted"
                            }
                          >
                            {l.amountCents > 0 ? "+" : ""}
                            {formatCents(l.amountCents)}
                          </Td>
                          <Td num className="text-text-muted">
                            {formatCents(l.balanceAfterCents)}
                          </Td>
                        </TR>
                      ))}
                    </TBody>
                  </DataTable>
                )}
              </section>

              {/* Inventory by tier */}
              <section className="rounded-md border border-line bg-white p-6">
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-h3 font-semibold text-ink">Inventory by tier</h2>
                  <Link
                    href={`/admin/inventory?vendorId=${v.id}`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                  >
                    Full inventory →
                  </Link>
                </header>
                {o.inventory.perTier.length === 0 ? (
                  <p className="mt-4 font-mono text-mono-label uppercase text-text-muted">
                    No active inventory.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    {o.inventory.perTier.map((row) => (
                      <div
                        key={row.tier}
                        className="rounded-md border border-line bg-cream-soft p-4"
                      >
                        <div className="font-mono text-mono-label uppercase text-text-muted">
                          {row.tier.replace("_", "-")}
                        </div>
                        <div className="mt-2 text-h2 font-medium tabular-nums text-ink">
                          {row.skuCount}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-text-muted">
                          {row.subtotalCents != null
                            ? `${formatCents(row.subtotalCents)} / mo`
                            : "Negotiable"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* ============== Action sidebar ============== */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-md border border-line bg-white p-5">
            <div className="font-mono text-mono-label uppercase text-text-muted">
              Current KYC status
            </div>
            <div className="mt-3 flex items-center gap-2">
              <StatusPill tone={kycPillTone(v.kycStatus)}>
                {v.kycStatus.replace(/_/g, " ")}
              </StatusPill>
            </div>
            {v.kycApprovedAt ? (
              <div className="mt-2 font-mono text-mono-label uppercase text-text-muted">
                Approved {new Date(v.kycApprovedAt).toLocaleDateString()}
              </div>
            ) : v.kycRejectedAt ? (
              <div className="mt-2 font-mono text-mono-label uppercase text-text-muted">
                Rejected {new Date(v.kycRejectedAt).toLocaleDateString()}
              </div>
            ) : v.kycSubmittedAt ? (
              <div className="mt-2 font-mono text-mono-label uppercase text-text-muted">
                Submitted {new Date(v.kycSubmittedAt).toLocaleDateString()}
              </div>
            ) : null}
          </section>

          <section className="rounded-md border border-line bg-white p-5">
            <h3 className="font-mono text-mono-label uppercase text-text-muted">
              Decisions
            </h3>

            <div className="mt-3">
              <ErrorBanner error={bannerError} onAction={onAction} />
            </div>
            {actionSuccess ? (
              <div className="mt-3 rounded-sm border-l-4 border-success bg-success/10 px-3 py-2 text-body-sm text-success">
                {actionSuccess}
              </div>
            ) : null}

            {reasonMode ? (
              <form
                onSubmit={reasonForm.handleSubmit((input) =>
                  reasonMode === "reject"
                    ? rejectMut.mutate(input)
                    : resubmitMut.mutate(input),
                )}
                className="mt-4 flex flex-col gap-3"
                noValidate
              >
                <div className="font-mono text-mono-label uppercase text-amber">
                  {reasonMode === "reject"
                    ? "Reason for rejection"
                    : "What needs to change"}
                </div>
                <Field
                  label=""
                  hint="The vendor sees this verbatim. Be specific and kind."
                  error={reasonForm.formState.errors.reason?.message}
                >
                  <textarea
                    rows={5}
                    className={
                      "w-full rounded-sm border bg-white px-3 py-2 font-sans text-body text-text outline-none focus:border-ink " +
                      (reasonForm.formState.errors.reason
                        ? "border-error"
                        : "border-line-strong")
                    }
                    {...reasonForm.register("reason")}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setReasonMode(null);
                      reasonForm.reset({ reason: "" });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant={reasonMode === "reject" ? "primary" : "amber"}
                    loading={rejectMut.isPending || resubmitMut.isPending}
                  >
                    {reasonMode === "reject" ? "Reject" : "Send request"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <Button
                  type="button"
                  variant="amber"
                  withArrow
                  loading={approveMut.isPending}
                  disabled={v.kycStatus === "APPROVED" || v.status === "CLOSED"}
                  onClick={() => approveMut.mutate()}
                >
                  Approve KYC
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={v.kycStatus === "APPROVED" || v.status === "CLOSED"}
                  onClick={() => {
                    clearAction();
                    setReasonMode("resubmission");
                  }}
                >
                  Request resubmission
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={v.status === "CLOSED"}
                  onClick={() => {
                    clearAction();
                    setReasonMode("reject");
                  }}
                >
                  Reject KYC
                </Button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (presentational)
// ---------------------------------------------------------------------------

function DT({ children }: { children: React.ReactNode }) {
  return (
    <dt className="font-mono text-mono-label uppercase text-text-muted">{children}</dt>
  );
}
function DD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={"text-text " + (className ?? "")}>{children}</dd>;
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "warning";
}) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div
        className={
          "mt-2 text-h2 font-medium tabular-nums " +
          (tone === "warning" ? "text-amber" : "text-ink")
        }
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[1.2px] text-text-subtle">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function SocialRow({
  platform,
  handle,
  href,
}: {
  platform: string;
  handle: string | null;
  href: string | null;
}) {
  return (
    <li className="flex items-center justify-between py-3">
      <div className="flex flex-col">
        <span className="font-mono text-mono-label uppercase text-text-muted">
          {platform}
        </span>
        <span className="mt-0.5 font-mono text-body-sm text-text">
          {handle ?? <span className="text-text-muted">—</span>}
        </span>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
        >
          Open ↗
        </a>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// KYC v2 — admin review card
//
// Renders every structured field the vendor submitted via the multi-step
// wizard. Each section mirrors the wizard's grouping (Business, Contact,
// Identity, Inventory, Shipping) so a reviewer reading top-to-bottom is
// walking the same path the vendor filled in.
//
// Empty values render as "Not provided" rather than "—" so the reviewer can
// tell at a glance which sections are incomplete. Enum values are shown
// with the same human label the vendor saw at submission time.
// ---------------------------------------------------------------------------

type KycV2Payload = NonNullable<VendorDetail["kycV2"]>;

const KYC_BUSINESS_TYPE_LABELS: Record<string, string> = {
  SOLE_PROPRIETORSHIP: "Sole Proprietorship",
  REGISTERED_BUSINESS: "Registered Business",
  LLC: "LLC",
  CORPORATION: "Corporation",
  PARTNERSHIP: "Partnership",
  OTHER: "Other",
};

const KYC_INDUSTRY_LABELS: Record<string, string> = {
  FASHION_APPAREL: "Fashion & Apparel",
  BEAUTY_COSMETICS: "Beauty / Cosmetics",
  HAIR_WIGS: "Hair / Wigs",
  ELECTRONICS: "Electronics",
  ACCESSORIES: "Accessories",
  HOME_GOODS: "Home Goods",
  OTHER: "Other",
};

const KYC_ID_LABELS: Record<string, string> = {
  PASSPORT: "Passport",
  NATIONAL_ID: "National ID Card",
  DRIVERS_LICENSE: "Driver's License",
};

const KYC_INVENTORY_LABELS: Record<string, string> = {
  SMALL_1_10: "Small (1–10 boxes)",
  MEDIUM_11_30: "Medium (11–30 boxes)",
  LARGE_31_100: "Large (31–100 boxes)",
  XLARGE_100_PLUS: "X-Large (100+ boxes)",
  BULK_PALLET: "Bulk / Pallet Level",
};

const KYC_ORDER_LABELS: Record<string, string> = {
  V_1_20: "1–20 orders",
  V_21_100: "21–100 orders",
  V_101_500: "101–500 orders",
  V_500_PLUS: "500+ orders",
};

// KYC_INTENT_LABELS removed in migration 0031 — service intent dropped.

const KYC_HAZARD_LABELS: Record<string, string> = {
  BATTERIES: "Batteries",
  LIQUIDS: "Liquids",
  FRAGILE: "Fragile Items",
  HAZARDOUS: "Hazardous Materials",
  NONE: "None of the Above",
};

function KycV2Card({
  kyc,
  submittedAt,
}: {
  kyc: KycV2Payload;
  submittedAt: string | null;
}): JSX.Element {
  // Submitted-for-review is now the canonical "vendor finished filling
  // out the wizard" timestamp — there's no separate compliance signature.
  const signed = !!submittedAt;

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-semibold text-ink">
          KYC v2 — full submission
        </h2>
        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          {signed ? "Submitted for review" : "In progress"}
        </span>
      </header>
      <p className="mt-1 text-body-sm text-text-muted">
        Every structured field the vendor entered. &quot;Not provided&quot; rows
        show fields the vendor hasn&apos;t reached yet.
      </p>

      <KycSection title="Business">
        <KycRow label="Business type" value={lookup(kyc.businessType, KYC_BUSINESS_TYPE_LABELS)} />
        {kyc.businessType === "OTHER" ? (
          <KycRow label="Business type (other)" value={kyc.businessTypeOther} />
        ) : null}
        <KycRow label="Registration number" value={kyc.businessRegistrationNumber} />
        <KycRow
          label="Country of registration"
          value={kyc.businessRegistrationCountry}
          mono
        />
        <KycRow label="Industry" value={lookup(kyc.businessIndustry, KYC_INDUSTRY_LABELS)} />
        {kyc.businessIndustry === "OTHER" ? (
          <KycRow label="Industry (other)" value={kyc.businessIndustryOther} />
        ) : null}
      </KycSection>

      <KycSection title="Primary contact">
        <KycRow label="Full legal name" value={kyc.contactFullName} />
        <KycRow label="Position / role" value={kyc.contactPosition} />
        <KycRow label="Phone" value={kyc.contactPhone} mono />
        <KycRow
          label="Address"
          value={formatAddress(
            kyc.contactAddressLine1,
            kyc.contactAddressLine2,
            kyc.contactCountry,
          )}
        />
      </KycSection>

      <KycSection title="Identity">
        <KycRow label="ID type" value={lookup(kyc.idType, KYC_ID_LABELS)} />
        <KycRow label="ID number" value={kyc.idNumber} mono />
        <KycRow label="Expiration date" value={kyc.idExpirationDate} mono />
      </KycSection>

      {/* KYC v2 Phase 2 — document uploads (migration 0032). Each row
          renders an "Open" link to the public R2 URL the wizard saved
          when the vendor uploaded the file. Null URLs render the
          existing "Not provided" placeholder via the KycRow helper. */}
      <KycSection title="Business verification">
        <KycRow label="ID front" value={kyc.idFrontUrl} link />
        <KycRow label="ID back" value={kyc.idBackUrl} link />
        <KycRow label="ID-holding selfie" value={kyc.idSelfieUrl} link />
        <KycRow
          label="Business registration / license"
          value={kyc.businessDocUrl}
          link
        />
      </KycSection>

      <KycSection title="Inventory">
        <KycRow
          label="Products stored"
          value={kyc.productsStoredDescription}
          multiline
        />
        <KycRow
          label="Monthly inventory volume"
          value={lookup(kyc.monthlyInventoryVolume, KYC_INVENTORY_LABELS)}
        />
        <KycRow
          label="Monthly order volume"
          value={lookup(kyc.monthlyOrderVolume, KYC_ORDER_LABELS)}
        />
        {/* Service intent row removed — see migration 0031. */}
      </KycSection>

      <KycSection title="Shipping & operations">
        <KycRow
          label="Primary shipping countries"
          value={kyc.primaryShippingCountries}
        />
        <KycRow
          label="Returns handling needed"
          value={
            typeof kyc.requiresReturnsHandling === "boolean"
              ? kyc.requiresReturnsHandling
                ? "Yes"
                : "No"
              : null
          }
        />
        <KycRow
          label="Product hazards"
          value={
            kyc.productHazards.length > 0
              ? kyc.productHazards.map((h) => KYC_HAZARD_LABELS[h] ?? h).join(", ")
              : null
          }
        />
      </KycSection>

    </section>
  );
}

function KycSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mt-6">
      <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        {title}
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-y-2 sm:grid-cols-[220px_minmax(0,1fr)] text-body-sm">
        {children}
      </dl>
    </div>
  );
}

function KycRow({
  label,
  value,
  mono,
  multiline,
  link,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  multiline?: boolean;
  /** Render the value as an "Open ↗" link rather than literal text.
   *  Used for the four KYC v2 Phase 2 document URLs so the reviewer
   *  can click straight through to inspect the file in R2. */
  link?: boolean;
}): JSX.Element {
  const empty = value === null || value === undefined || value === "";
  return (
    <>
      <dt className="font-mono text-mono-label uppercase text-text-muted">
        {label}
      </dt>
      <dd
        className={
          (mono ? "font-mono " : "") +
          (multiline ? "whitespace-pre-line " : "") +
          (empty ? "text-text-muted italic" : "text-text")
        }
      >
        {empty ? (
          "Not provided"
        ) : link ? (
          <a
            href={value as string}
            target="_blank"
            rel="noreferrer"
            className="text-amber underline-offset-4 hover:underline"
          >
            Open {label.toLowerCase()} ↗
          </a>
        ) : (
          value
        )}
      </dd>
    </>
  );
}

function lookup(
  value: string | null | undefined,
  table: Record<string, string>,
): string | null {
  if (!value) return null;
  return table[value] ?? value;
}

function formatAddress(
  line1: string | null,
  line2: string | null,
  country: string | null,
): string | null {
  const parts = [line1, line2, country].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}
