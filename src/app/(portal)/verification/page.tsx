/**
 * /verification — vendor KYC self-service.
 *
 * The KYC flow is currently manual review (we don't yet integrate Stripe
 * Identity / Persona). The vendor's job here is to:
 *   1. Provide at least one social handle / business website for the
 *      reviewer to verify against.
 *   2. Accept the vendor agreement.
 *   3. Press "Submit for review" — this flips kycStatus PENDING → IN_PROGRESS
 *      and lands the account in the admin review queue.
 *
 * Once the admin approves, kycStatus → APPROVED and (if agreement is signed)
 * vendor.status → ACTIVE. The dashboard banner disappears automatically.
 *
 * The page is intentionally one screen: status pill, checklist, inline
 * social-handles form, and a single decisive submit button. No multi-step
 * wizard — a vendor's mental model of "verify my account" is one task.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import { useAuth } from "@/lib/auth-context";

interface VendorProfile {
  id: string;
  businessName: string;
  country: string;
  kycStatus:
    | "PENDING"
    | "IN_PROGRESS"
    | "REQUIRES_RESUBMISSION"
    | "APPROVED"
    | "REJECTED"
    | "EXPIRED";
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  agreementAcceptedAt: string | null;
  agreementVersion: string | null;
  createdAt: string;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  xHandle: string | null;
  websiteUrl: string | null;
  socialVerifiedAt: string | null;
  // The most recent reviewer note when status is REJECTED or
  // REQUIRES_RESUBMISSION. We surface it verbatim so the vendor knows what
  // to fix. Not present in the public profile shape — `kycRejectionReason`
  // is read-only and admin-set, but we expose it on /vendors/me for this
  // exact use case.
  kycRejectionReason?: string | null;
}

// ---------------------------------------------------------------------------
// Social handles validation — mirrors backend rules, accepts inputs with or
// without the leading "@", normalizes to lowercase.
// ---------------------------------------------------------------------------

const stripAt = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

const handleField = (opts: { max: number; pattern: RegExp; label: string }) =>
  z
    .string()
    .transform(stripAt)
    .refine(
      (s) => s === "" || (s.length <= opts.max && opts.pattern.test(s)),
      `${opts.label} doesn't match the platform's allowed format.`,
    );

const socialSchema = z.object({
  instagramHandle: handleField({
    max: 30,
    pattern: /^[a-z0-9._]+$/,
    label: "Instagram handle",
  }),
  tiktokHandle: handleField({
    max: 24,
    pattern: /^[a-z0-9._]+$/,
    label: "TikTok handle",
  }),
  xHandle: handleField({
    max: 15,
    pattern: /^[a-z0-9_]+$/,
    label: "X handle",
  }),
  websiteUrl: z
    .string()
    .trim()
    .refine(
      (s) => s === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s),
      "Enter a full URL starting with https://",
    ),
});
type SocialInput = z.infer<typeof socialSchema>;

function kycPillTone(status: VendorProfile["kycStatus"]): "success" | "error" | "warning" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED" || status === "EXPIRED") return "error";
  return "warning";
}

function kycHeadline(status: VendorProfile["kycStatus"]): { title: string; body: string } {
  switch (status) {
    case "APPROVED":
      return {
        title: "You're verified.",
        body: "Your account is fully verified. You can ship inventory in and place orders.",
      };
    case "IN_PROGRESS":
      return {
        title: "Review in progress.",
        body: "Our team is verifying your business. This usually takes one business day.",
      };
    case "REQUIRES_RESUBMISSION":
      return {
        title: "Almost there — small fixes needed.",
        body: "Our reviewer left a note. Address it below, then resubmit.",
      };
    case "REJECTED":
      return {
        title: "We couldn't verify your account.",
        body: "Reach out to support if you have additional documentation.",
      };
    case "EXPIRED":
      return {
        title: "Your verification expired.",
        body: "Confirm your details and resubmit for a fresh review.",
      };
    case "PENDING":
    default:
      return {
        title: "Verify your business.",
        body: "Provide a public footprint our reviewers can check, then submit. Most accounts are verified within one business day.",
      };
  }
}

export default function VerificationPage() {
  const { user } = useAuth();
  const isSubUser = user?.role === "VENDOR_SUB_USER";
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: () => api.get<VendorProfile>("/vendors/me"),
  });

  const socialForm = useForm<SocialInput>({
    resolver: zodResolver(socialSchema),
    defaultValues: { instagramHandle: "", tiktokHandle: "", xHandle: "", websiteUrl: "" },
  });

  useEffect(() => {
    if (profileQ.data) {
      socialForm.reset({
        instagramHandle: profileQ.data.instagramHandle ?? "",
        tiktokHandle: profileQ.data.tiktokHandle ?? "",
        xHandle: profileQ.data.xHandle ?? "",
        websiteUrl: profileQ.data.websiteUrl ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQ.data]);

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { bannerError, handle, clear } = useApiErrorHandler(socialForm);

  const saveSocialMut = useMutation({
    mutationFn: (input: SocialInput) =>
      api.patch<VendorProfile>("/vendors/me", {
        instagramHandle: input.instagramHandle === "" ? null : input.instagramHandle,
        tiktokHandle: input.tiktokHandle === "" ? null : input.tiktokHandle,
        xHandle: input.xHandle === "" ? null : input.xHandle,
        websiteUrl: input.websiteUrl === "" ? null : input.websiteUrl,
      }),
    onMutate: clear,
    onSuccess: async () => {
      setActionSuccess("Saved.");
      await qc.invalidateQueries({ queryKey: ["vendor", "me"] });
      setTimeout(() => setActionSuccess(null), 2000);
    },
    onError: (err) => handle(err),
  });

  const submitKycMut = useMutation({
    mutationFn: () => api.post<VendorProfile>("/vendors/me/kyc/submit", {}),
    onMutate: clear,
    onSuccess: async () => {
      setActionSuccess("Submitted. We'll email you when the review is complete.");
      await qc.invalidateQueries({ queryKey: ["vendor", "me"] });
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
  }

  if (profileQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (profileQ.error || !profileQ.data) {
    const normalized = profileQ.error ? normalizeError(profileQ.error) : null;
    return (
      <div
        role="alert"
        className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
      >
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "Couldn't load your profile"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "Try again, or contact support."}
        </p>
      </div>
    );
  }

  const v = profileQ.data;
  const headline = kycHeadline(v.kycStatus);
  const hasAnyHandle = !!(v.instagramHandle || v.tiktokHandle || v.xHandle || v.websiteUrl);
  const agreementAccepted = !!v.agreementAcceptedAt;
  const canSubmit =
    !isSubUser &&
    hasAnyHandle &&
    (v.kycStatus === "PENDING" ||
      v.kycStatus === "REQUIRES_RESUBMISSION" ||
      v.kycStatus === "EXPIRED");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[02] Verification"
        title={headline.title}
        description={headline.body}
        actions={
          <StatusPill tone={kycPillTone(v.kycStatus)}>
            KYC {v.kycStatus.replace(/_/g, " ")}
          </StatusPill>
        }
      />

      {/* Reviewer note — shown only when there's something to act on. */}
      {(v.kycStatus === "REQUIRES_RESUBMISSION" || v.kycStatus === "REJECTED") &&
      v.kycRejectionReason ? (
        <section className="rounded-md border-l-4 border-amber bg-cream-soft p-6">
          <div className="font-mono text-mono-label uppercase text-amber">Reviewer note</div>
          <p className="mt-2 whitespace-pre-line text-body-sm text-text">
            {v.kycRejectionReason}
          </p>
        </section>
      ) : null}

      {/* Checklist — what we need from the vendor. */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="text-h3 font-semibold text-ink">What we need</h2>
        <p className="mt-1 max-w-prose text-body-sm text-text-muted">
          We verify accounts manually right now. The fastest review is one with
          a clear public footprint and a signed agreement.
        </p>
        <ul className="mt-5 flex flex-col divide-y divide-line">
          <ChecklistRow
            checked={hasAnyHandle}
            title="Public business presence"
            body={
              hasAnyHandle
                ? "We have at least one handle to verify. Add more below if you'd like."
                : "Add at least one social handle or your business website."
            }
          />
          <ChecklistRow
            checked={agreementAccepted}
            title="Vendor agreement"
            body={
              agreementAccepted
                ? `Accepted ${
                    v.agreementAcceptedAt
                      ? new Date(v.agreementAcceptedAt).toLocaleDateString()
                      : ""
                  }${v.agreementVersion ? ` · v${v.agreementVersion}` : ""}.`
                : "You can accept the agreement on the settings page or after submission. Required before activation."
            }
          />
        </ul>
      </section>

      {/* Social handles editor — same rules as /settings, but inline so the
          vendor can fix things without context-switching. */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="text-h3 font-semibold text-ink">Public business presence</h2>
        <p className="mt-1 max-w-prose text-body-sm text-text-muted">
          At least one is required. Editing any handle re-opens the review.
        </p>

        <form
          onSubmit={socialForm.handleSubmit((vals) => saveSocialMut.mutate(vals))}
          className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"
          noValidate
        >
          <Field
            label="Instagram"
            hint="Without the @. e.g. adela.apparel"
            error={socialForm.formState.errors.instagramHandle?.message}
          >
            <Input
              type="text"
              placeholder="adela.apparel"
              disabled={isSubUser}
              invalid={!!socialForm.formState.errors.instagramHandle}
              {...socialForm.register("instagramHandle")}
            />
          </Field>
          <Field
            label="TikTok"
            hint="Without the @. e.g. adelaofficial"
            error={socialForm.formState.errors.tiktokHandle?.message}
          >
            <Input
              type="text"
              placeholder="adelaofficial"
              disabled={isSubUser}
              invalid={!!socialForm.formState.errors.tiktokHandle}
              {...socialForm.register("tiktokHandle")}
            />
          </Field>
          <Field
            label="X (Twitter)"
            hint="Letters, numbers, underscore only."
            error={socialForm.formState.errors.xHandle?.message}
          >
            <Input
              type="text"
              placeholder="adelahq"
              disabled={isSubUser}
              invalid={!!socialForm.formState.errors.xHandle}
              {...socialForm.register("xHandle")}
            />
          </Field>
          <Field
            label="Website"
            hint="Full URL with https://"
            error={socialForm.formState.errors.websiteUrl?.message}
          >
            <Input
              type="url"
              placeholder="https://adela.example"
              disabled={isSubUser}
              invalid={!!socialForm.formState.errors.websiteUrl}
              {...socialForm.register("websiteUrl")}
            />
          </Field>

          {!isSubUser ? (
            <div className="md:col-span-2 flex justify-end">
              <Button
                type="submit"
                variant="outline"
                loading={saveSocialMut.isPending}
                disabled={!socialForm.formState.isDirty}
              >
                Save details
              </Button>
            </div>
          ) : null}
        </form>
      </section>

      {/* Submit-for-review band — only shown when actionable. */}
      {canSubmit ? (
        <section className="rounded-md border border-line bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-h3 font-semibold text-ink">Ready when you are.</h2>
              <p className="mt-1 max-w-prose text-body-sm text-text-muted">
                Save any pending handle changes first. Once you submit, our team
                reviews within one business day. We&apos;ll email you the result.
              </p>
            </div>
            <Button
              type="button"
              variant="amber"
              size="lg"
              withArrow
              loading={submitKycMut.isPending}
              disabled={socialForm.formState.isDirty}
              onClick={() => submitKycMut.mutate()}
            >
              {v.kycStatus === "PENDING" ? "Submit for review" : "Resubmit for review"}
            </Button>
          </div>
        </section>
      ) : v.kycStatus === "IN_PROGRESS" ? (
        <section className="rounded-md border-l-4 border-amber bg-amber/10 p-6">
          <div className="font-mono text-mono-label uppercase text-amber">In review</div>
          <p className="mt-2 text-body-sm text-text">
            Our team is verifying your business. We&apos;ll email{" "}
            {user?.email ? <strong>{user.email}</strong> : "you"} when the review
            is complete — usually within one business day.
          </p>
        </section>
      ) : null}

      {/* Inline result banners. */}
      <ErrorBanner error={bannerError} onAction={onAction} />
      {actionSuccess ? (
        <div className="rounded-sm border-l-4 border-success bg-success/10 px-4 py-3 text-body-sm text-success">
          {actionSuccess}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChecklistRow({
  checked,
  title,
  body,
}: {
  checked: boolean;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-4 py-3">
      <div
        className={
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border " +
          (checked
            ? "border-success bg-success/15 text-success"
            : "border-line-strong text-text-muted")
        }
        aria-hidden
      >
        {checked ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 7.5L5.5 10L11 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className="font-mono text-[11px]">·</span>
        )}
      </div>
      <div className="flex-1">
        <div className={"font-medium " + (checked ? "text-text" : "text-ink")}>
          {title}
        </div>
        <div className="mt-0.5 text-body-sm text-text-muted">{body}</div>
      </div>
    </li>
  );
}
