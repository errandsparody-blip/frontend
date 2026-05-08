/**
 * Admin vendor detail — KYC review surface.
 *
 * Layout (left main, right sticky action panel):
 *
 *   ┌───────────────────────────────────┬──────────────────────┐
 *   │ business identity                 │ status pills         │
 *   │ social presence (with verify CTA) │ approve              │
 *   │ wallet snapshot                   │ request resubmission │
 *   │ rejection reason (if any)         │ reject               │
 *   └───────────────────────────────────┴──────────────────────┘
 *
 * Reject and resubmission both require a reason. We collect it via an
 * inline reveal panel (no modal) so the reviewer can see the vendor's full
 * context while writing the message.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";

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
  primaryUser: { id: string; email: string; emailVerified: boolean; mfaEnrolled: boolean } | null;
  wallet: { balanceCents: number; status: string; lowBalanceThresholdCents: number } | null;
}

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

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminVendorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["admin", "vendor", params.id],
    queryFn: () => api.get<VendorDetail>(`/admin/vendors/${params.id}`),
    enabled: !!params.id,
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

  const approveMut = useMutation({
    mutationFn: () => api.post<VendorDetail>(`/admin/vendors/${params.id}/kyc/approve`, {}),
    onMutate: clearAction,
    onSuccess: async () => {
      setActionSuccess("KYC approved. Vendor notified.");
      await qc.invalidateQueries({ queryKey: ["admin", "vendor", params.id] });
      await qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
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
      await qc.invalidateQueries({ queryKey: ["admin", "vendor", params.id] });
      await qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
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
      await qc.invalidateQueries({ queryKey: ["admin", "vendor", params.id] });
      await qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    },
    onError: (err) => handle(err),
  });

  const verifySocialMut = useMutation({
    mutationFn: () => api.post<VendorDetail>(`/admin/vendors/${params.id}/social/verify`, {}),
    onMutate: clearAction,
    onSuccess: async () => {
      setActionSuccess("Social presence marked verified.");
      await qc.invalidateQueries({ queryKey: ["admin", "vendor", params.id] });
      await qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
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
  const hasAnyHandle = !!(v.instagramHandle || v.tiktokHandle || v.xHandle || v.websiteUrl);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[02] Vendor review"
        title={v.businessName}
        description={`Signed up ${new Date(v.createdAt).toLocaleDateString()} · ${v.country}`}
        actions={
          <button
            type="button"
            onClick={() => router.push("/admin/vendors")}
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back to queue
          </button>
        }
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
            <p className="mt-1 text-body-sm text-text-muted">
              Open each handle in a new tab and confirm the account looks like
              a legitimate business. Mark verified once you&apos;re satisfied;
              the badge appears on the vendor&apos;s settings page.
            </p>

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
                <SocialRow
                  platform="Website"
                  handle={v.websiteUrl}
                  href={v.websiteUrl}
                />
              </ul>
            ) : (
              <p className="mt-5 font-mono text-mono-label uppercase text-text-muted">
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

          {/* KYC reason history */}
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

          {/* Wallet */}
          {v.wallet ? (
            <section className="rounded-md border border-line bg-white p-6">
              <h2 className="text-h3 font-semibold text-ink">Wallet</h2>
              <div className="mt-4 grid grid-cols-2 gap-6">
                <div>
                  <div className="font-mono text-mono-label uppercase text-text-muted">
                    Balance
                  </div>
                  <div className="mt-1 text-display-lg font-medium tabular-nums text-ink">
                    {formatCents(v.wallet.balanceCents)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-mono-label uppercase text-text-muted">
                    Wallet status
                  </div>
                  <div className="mt-2">
                    <StatusPill
                      tone={v.wallet.status === "ACTIVE" ? "success" : "warning"}
                    >
                      {v.wallet.status.replace(/_/g, " ")}
                    </StatusPill>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
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
                      (reasonForm.formState.errors.reason ? "border-error" : "border-line-strong")
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
// Helpers
// ---------------------------------------------------------------------------

function DT({ children }: { children: React.ReactNode }) {
  return (
    <dt className="font-mono text-mono-label uppercase text-text-muted">{children}</dt>
  );
}
function DD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={"text-text " + (className ?? "")}>{children}</dd>;
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
