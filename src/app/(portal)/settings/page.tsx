"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api, type ApiError } from "@/lib/api-client";
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
}

interface WalletSnapshot {
  lowBalanceThresholdCents: number;
}

const profileSchema = z.object({
  businessName: z.string().trim().min(2, "At least 2 characters.").max(120),
});
type ProfileInput = z.infer<typeof profileSchema>;

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

  const [profileError, setProfileError] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [thresholdSaved, setThresholdSaved] = useState(false);

  const profileMut = useMutation({
    mutationFn: (input: ProfileInput) => api.patch<VendorProfile>("/vendors/me", input),
    onSuccess: async () => {
      setProfileError(null);
      setProfileSaved(true);
      await qc.invalidateQueries({ queryKey: ["vendor", "me"] });
      setTimeout(() => setProfileSaved(false), 2000);
    },
    onError: (err) => setProfileError((err as ApiError).message),
  });

  const thresholdMut = useMutation({
    mutationFn: (input: ThresholdInput) => api.patch<WalletSnapshot>("/wallet", input),
    onSuccess: async () => {
      setThresholdError(null);
      setThresholdSaved(true);
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      setTimeout(() => setThresholdSaved(false), 2000);
    },
    onError: (err) => setThresholdError((err as ApiError).message),
  });

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

              {profileError ? (
                <div role="alert" className="col-span-2 rounded-sm border-l-4 border-error bg-error/10 px-4 py-2 text-body-sm text-error">
                  {profileError}
                </div>
              ) : null}
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
            {thresholdError ? (
              <div role="alert" className="mt-3 rounded-sm border-l-4 border-error bg-error/10 px-4 py-2 text-body-sm text-error">
                {thresholdError}
              </div>
            ) : null}
            {thresholdSaved ? (
              <div className="mt-3 rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
                Saved.
              </div>
            ) : null}
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
