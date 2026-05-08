/**
 * /admin/config/policy — friendly editor for the small "platform policy"
 * configuration keys that don't deserve their own page each:
 *
 *   - `quarantine_daily_fee_cents`  → single number (cents)
 *   - `reassessment_threshold`      → { utilizationPctMax, consecutiveDaysMin, autoApplyAfterDays }
 *   - `agreement_version`           → version string vendors must accept
 *
 * Each section is independent — separate form, separate save button,
 * separate audit row. A finance person editing the quarantine fee can't
 * accidentally publish a stale agreement version.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

interface ReassessmentThreshold {
  utilizationPctMax: number;
  consecutiveDaysMin: number;
  autoApplyAfterDays: number;
}
interface ConfigRow<T> {
  key: string;
  description: string | null;
  value: T;
  updatedAt: string;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Page shell — three independent sections.
// ---------------------------------------------------------------------------

export default function PolicyConfigPage(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[07] Configuration / Policy"
        title="Platform policy"
        description="Quarantine billing, downsize-trigger thresholds, and the active vendor-agreement version. Each setting has its own save action and audit-log row."
      />
      <QuarantineFeeSection />
      <ReassessmentThresholdSection />
      <AgreementVersionSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Quarantine daily fee
// ---------------------------------------------------------------------------

const quarantineSchema = z.object({
  feeDollars: z.coerce.number().nonnegative("Cannot be negative.").max(10_000, "Too large."),
});
type QuarantineForm = z.infer<typeof quarantineSchema>;

function QuarantineFeeSection(): JSX.Element {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const dataQ = useQuery({
    queryKey: ["admin", "config", "quarantine_daily_fee_cents"],
    queryFn: () => api.get<ConfigRow<number>>("/admin/config/quarantine_daily_fee_cents"),
  });

  const form = useForm<QuarantineForm>({
    resolver: zodResolver(quarantineSchema),
    defaultValues: { feeDollars: 0 },
    values: dataQ.data ? { feeDollars: Math.round(dataQ.data.value) / 100 } : undefined,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const saveMut = useMutation({
    mutationFn: (input: QuarantineForm) =>
      api.patch<ConfigRow<number>>("/admin/config/quarantine_daily_fee_cents", {
        value: Math.round(input.feeDollars * 100),
      }),
    onMutate: clear,
    onSuccess: async (next) => {
      setSaved(true);
      reset({ feeDollars: Math.round(next.value) / 100 });
      await qc.invalidateQueries({ queryKey: ["admin", "config"] });
      await qc.invalidateQueries({ queryKey: ["admin", "config", "quarantine_daily_fee_cents"] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
  }

  return (
    <SectionShell
      title="Quarantine daily fee"
      eyebrow="Charged each day a SKU is in 14-day Hold"
      description="Daily fee debited per quarantined SKU. Quarantine starts when an inbound box can't be matched to a PSN line; the system auto-disposes after 14 days."
    >
      {dataQ.isLoading ? (
        <p className="font-mono text-mono-label uppercase text-text-muted">Loading…</p>
      ) : dataQ.error || !dataQ.data ? (
        <SectionLoadError name="quarantine fee" />
      ) : (
        <form
          onSubmit={handleSubmit((v) => saveMut.mutate(v))}
          noValidate
          className="flex flex-col gap-4"
        >
          <Field
            label="Per-day fee"
            hint="$ per quarantined SKU per day"
            error={errors.feeDollars?.message}
          >
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              className="max-w-xs"
              invalid={!!errors.feeDollars}
              {...register("feeDollars")}
            />
          </Field>

          <ErrorBanner error={bannerError} onAction={onAction} />
          {saved ? (
            <SavedBanner message="Quarantine fee saved. Audit log captured the change." />
          ) : null}

          <SectionFooter
            updatedAt={dataQ.data.updatedAt}
            updatedBy={dataQ.data.updatedBy}
            isDirty={isDirty}
            isPending={saveMut.isPending}
            onReset={() => reset({ feeDollars: Math.round(dataQ.data!.value) / 100 })}
          />
        </form>
      )}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Reassessment threshold
// ---------------------------------------------------------------------------

const reassessmentSchema = z.object({
  utilizationPctMax: z.coerce.number().int().min(1, "1–100").max(100, "1–100"),
  consecutiveDaysMin: z.coerce.number().int().positive("> 0").max(365, "≤ 365"),
  autoApplyAfterDays: z.coerce.number().int().positive("> 0").max(365, "≤ 365"),
});
type ReassessmentForm = z.infer<typeof reassessmentSchema>;

function ReassessmentThresholdSection(): JSX.Element {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const dataQ = useQuery({
    queryKey: ["admin", "config", "reassessment_threshold"],
    queryFn: () => api.get<ConfigRow<ReassessmentThreshold>>("/admin/config/reassessment_threshold"),
  });

  const form = useForm<ReassessmentForm>({
    resolver: zodResolver(reassessmentSchema),
    defaultValues: { utilizationPctMax: 80, consecutiveDaysMin: 60, autoApplyAfterDays: 14 },
    values: dataQ.data?.value,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const saveMut = useMutation({
    mutationFn: (input: ReassessmentForm) =>
      api.patch<ConfigRow<ReassessmentThreshold>>("/admin/config/reassessment_threshold", { value: input }),
    onMutate: clear,
    onSuccess: async (next) => {
      setSaved(true);
      reset(next.value);
      await qc.invalidateQueries({ queryKey: ["admin", "config"] });
      await qc.invalidateQueries({ queryKey: ["admin", "config", "reassessment_threshold"] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
  }

  return (
    <SectionShell
      title="Downsize reassessment threshold"
      eyebrow="Triggers the quarterly tier-downsize cron"
      description="If a SKU's average box utilization stays at or below the cap for the minimum number of consecutive days, we propose a tier downgrade. The vendor has the auto-apply window to opt out before we move it automatically."
    >
      {dataQ.isLoading ? (
        <p className="font-mono text-mono-label uppercase text-text-muted">Loading…</p>
      ) : dataQ.error || !dataQ.data ? (
        <SectionLoadError name="reassessment threshold" />
      ) : (
        <form
          onSubmit={handleSubmit((v) => saveMut.mutate(v))}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Utilization cap (%)"
              hint="If avg utilization ≤ this value …"
              error={errors.utilizationPctMax?.message}
            >
              <Input
                type="number"
                min={1}
                max={100}
                step={1}
                invalid={!!errors.utilizationPctMax}
                {...register("utilizationPctMax")}
              />
            </Field>
            <Field
              label="…for at least (days)"
              hint="Consecutive days of low utilization"
              error={errors.consecutiveDaysMin?.message}
            >
              <Input
                type="number"
                min={1}
                step={1}
                invalid={!!errors.consecutiveDaysMin}
                {...register("consecutiveDaysMin")}
              />
            </Field>
            <Field
              label="Auto-apply after (days)"
              hint="Vendor opt-out window"
              error={errors.autoApplyAfterDays?.message}
            >
              <Input
                type="number"
                min={1}
                step={1}
                invalid={!!errors.autoApplyAfterDays}
                {...register("autoApplyAfterDays")}
              />
            </Field>
          </div>

          <ErrorBanner error={bannerError} onAction={onAction} />
          {saved ? (
            <SavedBanner message="Reassessment threshold saved. Audit log captured the change." />
          ) : null}

          <SectionFooter
            updatedAt={dataQ.data.updatedAt}
            updatedBy={dataQ.data.updatedBy}
            isDirty={isDirty}
            isPending={saveMut.isPending}
            onReset={() => reset(dataQ.data!.value)}
          />
        </form>
      )}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Agreement version
// ---------------------------------------------------------------------------

const agreementSchema = z.object({
  version: z
    .string()
    .trim()
    .min(1, "Required.")
    .max(20, "Keep it short — 1.0, 1.1, 2024-Q3, etc.")
    .regex(/^[\w.\-]+$/, "Letters, numbers, dot, hyphen, underscore only."),
});
type AgreementForm = z.infer<typeof agreementSchema>;

function AgreementVersionSection(): JSX.Element {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const dataQ = useQuery({
    queryKey: ["admin", "config", "agreement_version"],
    queryFn: () => api.get<ConfigRow<string>>("/admin/config/agreement_version"),
  });

  const form = useForm<AgreementForm>({
    resolver: zodResolver(agreementSchema),
    defaultValues: { version: "" },
    values: dataQ.data ? { version: dataQ.data.value } : undefined,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const saveMut = useMutation({
    mutationFn: (input: AgreementForm) =>
      api.patch<ConfigRow<string>>("/admin/config/agreement_version", { value: input.version }),
    onMutate: clear,
    onSuccess: async (next) => {
      setSaved(true);
      reset({ version: next.value });
      await qc.invalidateQueries({ queryKey: ["admin", "config"] });
      await qc.invalidateQueries({ queryKey: ["admin", "config", "agreement_version"] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
  }

  return (
    <SectionShell
      title="Vendor agreement version"
      eyebrow="What new vendors must accept"
      description="Bumping this version invalidates every vendor's previous acceptance. They'll be prompted to re-accept on next sign-in. Bump only when the legal team has published new agreement terms."
    >
      {dataQ.isLoading ? (
        <p className="font-mono text-mono-label uppercase text-text-muted">Loading…</p>
      ) : dataQ.error || !dataQ.data ? (
        <SectionLoadError name="agreement version" />
      ) : (
        <form
          onSubmit={handleSubmit((v) => saveMut.mutate(v))}
          noValidate
          className="flex flex-col gap-4"
        >
          <Field
            label="Current version"
            hint="Examples: 1.0, 1.1, 2024-Q3"
            error={errors.version?.message}
          >
            <Input
              type="text"
              className="max-w-xs font-mono"
              invalid={!!errors.version}
              {...register("version")}
            />
          </Field>

          <ErrorBanner error={bannerError} onAction={onAction} />
          {saved ? (
            <SavedBanner message="Agreement version saved. All vendors will be re-prompted on next sign-in." />
          ) : null}

          <SectionFooter
            updatedAt={dataQ.data.updatedAt}
            updatedBy={dataQ.data.updatedBy}
            isDirty={isDirty}
            isPending={saveMut.isPending}
            onReset={() => reset({ version: dataQ.data!.value })}
          />
        </form>
      )}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function SectionShell({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-md border border-line bg-white p-6">
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-semibold text-ink">{title}</h2>
        <span className="font-mono text-mono-label uppercase text-text-muted">{eyebrow}</span>
      </header>
      <p className="max-w-prose text-body-sm text-text-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SectionLoadError({ name }: { name: string }): JSX.Element {
  return (
    <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
      <div className="font-mono text-mono-label uppercase text-error">
        Couldn&apos;t load {name}
      </div>
      <p className="mt-1 text-body-sm text-text">
        The configuration row may not be seeded. Run{" "}
        <code className="font-mono">pnpm prisma:seed</code> or contact engineering.
      </p>
    </div>
  );
}

function SavedBanner({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
      {message}
    </div>
  );
}

function SectionFooter({
  updatedAt,
  updatedBy,
  isDirty,
  isPending,
  onReset,
}: {
  updatedAt: string;
  updatedBy: string | null;
  isDirty: boolean;
  isPending: boolean;
  onReset: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-cream-soft p-4">
      <p className="text-body-sm text-text-muted">
        Last updated{" "}
        <span className="font-mono">{new Date(updatedAt).toLocaleString()}</span>
        {updatedBy ? (
          <>
            {" "}
            by <span className="font-mono">{updatedBy.slice(0, 8)}</span>
          </>
        ) : null}
        .
      </p>
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onReset} disabled={!isDirty || isPending}>
          Reset
        </Button>
        <Button type="submit" variant="amber" withArrow disabled={!isDirty} loading={isPending}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
