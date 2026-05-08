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
import { useApiErrorHandler } from "@/lib/errors";
import { useAuth } from "@/lib/auth-context";

interface VendorProfile {
  id: string;
  businessName: string;
  country: string;
  kycStatus: "PENDING" | "IN_PROGRESS" | "REQUIRES_RESUBMISSION" | "APPROVED" | "REJECTED" | "EXPIRED";
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  agreementAcceptedAt: string | null;
  agreementVersion: string | null;
  createdAt: string;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  xHandle: string | null;
  websiteUrl: string | null;
  socialVerifiedAt: string | null;
}

interface WalletSnapshot {
  lowBalanceThresholdCents: number;
}

const profileSchema = z.object({
  businessName: z.string().trim().min(2, "At least 2 characters.").max(120),
});
type ProfileInput = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Social presence
//
// Each input accepts the handle with or without "@" — we strip it before
// validating against the platform's published rules. Empty strings are
// allowed and translate to "unset" on save.
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

const thresholdSchema = z.object({
  lowBalanceThresholdCents: z.coerce.number().int().nonnegative().max(50_000_000),
});
type ThresholdInput = z.infer<typeof thresholdSchema>;

export default function SettingsPage() {
  const { user } = useAuth();
  const isSubUser = user?.role === "VENDOR_SUB_USER";
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: () => api.get<VendorProfile>("/vendors/me"),
  });
  const walletQ = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get<WalletSnapshot>("/wallet"),
  });

  const profileForm = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { businessName: "" },
  });

  useEffect(() => {
    if (profileQ.data) profileForm.reset({ businessName: profileQ.data.businessName });
  }, [profileQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const thresholdForm = useForm<ThresholdInput>({
    resolver: zodResolver(thresholdSchema),
    defaultValues: { lowBalanceThresholdCents: 5000 },
  });
  useEffect(() => {
    if (walletQ.data) thresholdForm.reset({ lowBalanceThresholdCents: walletQ.data.lowBalanceThresholdCents });
  }, [walletQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [profileQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const [profileSaved, setProfileSaved] = useState(false);
  const [thresholdSaved, setThresholdSaved] = useState(false);
  const [socialSaved, setSocialSaved] = useState(false);

  const profileErr = useApiErrorHandler(profileForm);
  const thresholdErr = useApiErrorHandler(thresholdForm);
  const socialErr = useApiErrorHandler(socialForm);

  const profileMut = useMutation({
    mutationFn: (input: ProfileInput) => api.patch<VendorProfile>("/vendors/me", input),
    onMutate: profileErr.clear,
    onSuccess: async () => {
      setProfileSaved(true);
      await qc.invalidateQueries({ queryKey: ["vendor", "me"] });
      setTimeout(() => setProfileSaved(false), 2000);
    },
    onError: (err) => profileErr.handle(err),
  });

  const thresholdMut = useMutation({
    mutationFn: (input: ThresholdInput) => api.patch<WalletSnapshot>("/wallet", input),
    onMutate: thresholdErr.clear,
    onSuccess: async () => {
      setThresholdSaved(true);
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      setTimeout(() => setThresholdSaved(false), 2000);
    },
    onError: (err) => thresholdErr.handle(err),
  });

  const socialMut = useMutation({
    mutationFn: (input: SocialInput) =>
      // Empty strings → null on the wire so the backend can clear a field. The
      // schema already lowercased + stripped @ via stripAt().
      api.patch<VendorProfile>("/vendors/me", {
        instagramHandle: input.instagramHandle === "" ? null : input.instagramHandle,
        tiktokHandle: input.tiktokHandle === "" ? null : input.tiktokHandle,
        xHandle: input.xHandle === "" ? null : input.xHandle,
        websiteUrl: input.websiteUrl === "" ? null : input.websiteUrl,
      }),
    onMutate: socialErr.clear,
    onSuccess: async () => {
      setSocialSaved(true);
      await qc.invalidateQueries({ queryKey: ["vendor", "me"] });
      setTimeout(() => setSocialSaved(false), 2000);
    },
    onError: (err) => socialErr.handle(err),
  });

  function onSupport() {
    window.location.href = "mailto:support@usa-errands.com";
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[08] Settings"
        title="Account settings"
        description="Manage your business profile, notification preferences, and account state. Sub-users can view but not edit."
      />

      {profileQ.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : profileQ.data ? (
        <>
          <section className="rounded-md border border-line bg-white p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="text-h3 font-semibold text-ink">Business profile</h2>
              <div className="flex items-center gap-2">
                <StatusPill
                  tone={profileQ.data.status === "ACTIVE" ? "success" : "warning"}
                >
                  {profileQ.data.status.replace(/_/g, " ")}
                </StatusPill>
                <StatusPill
                  tone={
                    profileQ.data.kycStatus === "APPROVED"
                      ? "success"
                      : profileQ.data.kycStatus === "REJECTED" || profileQ.data.kycStatus === "EXPIRED"
                        ? "error"
                        : "warning"
                  }
                >
                  KYC {profileQ.data.kycStatus.replace(/_/g, " ")}
                </StatusPill>
              </div>
            </div>

            <form
              onSubmit={profileForm.handleSubmit((v) => profileMut.mutate(v))}
              className="mt-6 grid grid-cols-2 gap-4"
              noValidate
            >
              <Field
                label="Business name"
                error={profileForm.formState.errors.businessName?.message}
              >
                <Input
                  type="text"
                  disabled={isSubUser}
                  invalid={!!profileForm.formState.errors.businessName}
                  {...profileForm.register("businessName")}
                />
              </Field>
              <Field label="Country" hint="Locked. Contact support to change.">
                <Input type="text" value={profileQ.data.country} disabled />
              </Field>

              <div className="col-span-2">
                <ErrorBanner
                  error={profileErr.bannerError}
                  onAction={(h) => h === "support" && onSupport()}
                />
              </div>
              {profileSaved ? (
                <div className="col-span-2 rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
                  Saved.
                </div>
              ) : null}

              {!isSubUser ? (
                <div className="col-span-2 flex justify-end">
                  <Button
                    type="submit"
                    variant="amber"
                    loading={profileMut.isPending}
                    disabled={!profileForm.formState.isDirty}
                  >
                    Save changes
                  </Button>
                </div>
              ) : null}
            </form>
          </section>

          <section className="rounded-md border border-line bg-white p-8">
            <h2 className="text-h3 font-semibold text-ink">Wallet alert threshold</h2>
            <p className="mt-1 text-body-sm text-text-muted">
              When your balance falls to or below this number, we&apos;ll send a low-balance email + in-app
              notification.
            </p>

            <form
              onSubmit={thresholdForm.handleSubmit((v) => thresholdMut.mutate(v))}
              className="mt-6 flex items-end gap-3"
              noValidate
            >
              <Field
                label="Threshold (cents)"
                hint="5000 = $50.00. Set to 0 to disable."
                error={thresholdForm.formState.errors.lowBalanceThresholdCents?.message}
              >
                <Input
                  type="number"
                  min={0}
                  step={100}
                  disabled={isSubUser}
                  invalid={!!thresholdForm.formState.errors.lowBalanceThresholdCents}
                  className="max-w-xs"
                  {...thresholdForm.register("lowBalanceThresholdCents")}
                />
              </Field>
              {!isSubUser ? (
                <Button
                  type="submit"
                  variant="amber"
                  loading={thresholdMut.isPending}
                  disabled={!thresholdForm.formState.isDirty}
                >
                  Save
                </Button>
              ) : null}
            </form>
            <div className="mt-3">
              <ErrorBanner
                error={thresholdErr.bannerError}
                onAction={(h) => h === "support" && onSupport()}
              />
            </div>
            {thresholdSaved ? (
              <div className="mt-3 rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
                Saved.
              </div>
            ) : null}
          </section>

          <section className="rounded-md border border-line bg-white p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-h3 font-semibold text-ink">Social presence</h2>
              {profileQ.data.socialVerifiedAt ? (
                <StatusPill tone="success">
                  Reviewed{" "}
                  {new Date(profileQ.data.socialVerifiedAt).toLocaleDateString()}
                </StatusPill>
              ) : (
                <StatusPill tone="warning">Awaiting review</StatusPill>
              )}
            </div>
            <p className="mt-1 max-w-prose text-body-sm text-text-muted">
              Optional, but strongly recommended. Our review team checks these
              handles to confirm you&apos;re a real business — KYC moves faster
              when there&apos;s a visible footprint to look at. Editing any
              handle re-opens the review.
            </p>

            <form
              onSubmit={socialForm.handleSubmit((v) => socialMut.mutate(v))}
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
                hint="Without the @. Letters, numbers, underscore."
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

              <div className="md:col-span-2">
                <ErrorBanner
                  error={socialErr.bannerError}
                  onAction={(h) => h === "support" && onSupport()}
                />
              </div>
              {socialSaved ? (
                <div className="md:col-span-2 rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
                  Saved. Our team will re-review shortly.
                </div>
              ) : null}

              {!isSubUser ? (
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="submit"
                    variant="amber"
                    loading={socialMut.isPending}
                    disabled={!socialForm.formState.isDirty}
                  >
                    Save social profile
                  </Button>
                </div>
              ) : null}
            </form>
          </section>

          <section className="rounded-md border border-line bg-white p-8">
            <h2 className="text-h3 font-semibold text-ink">Account history</h2>
            <dl className="mt-4 grid grid-cols-2 gap-y-2 font-mono text-body-sm">
              <dt className="text-text-muted">Created</dt>
              <dd className="text-text">{new Date(profileQ.data.createdAt).toLocaleDateString()}</dd>
              <dt className="text-text-muted">Agreement accepted</dt>
              <dd className="text-text">
                {profileQ.data.agreementAcceptedAt
                  ? `${new Date(profileQ.data.agreementAcceptedAt).toLocaleDateString()} · v${profileQ.data.agreementVersion ?? "—"}`
                  : "Not yet accepted"}
              </dd>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
