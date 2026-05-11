/**
 * /admin/config/box-tiers — friendly editor for warehouse box tier
 * configuration (`tier_dimensions` + `repackaging_fees`).
 *
 * Both keys describe per-tier rules used during receiving and damage
 * intake, so they share a page even though they're stored as separate
 * configuration rows. Each section has its own Save button so a finance
 * person editing repackaging fees doesn't accidentally publish a
 * warehouse-team change to dimensions, and vice versa. Each save writes
 * its own audit row with the full before/after JSON.
 *
 * Money in the UI is dollars; storage is cents. Conversion happens at
 * the form boundary, same pattern as the fees editor.
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
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types — wire shapes that match the seed.
// ---------------------------------------------------------------------------

type Tier = "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE";
const TIERS: Tier[] = ["SMALL", "MEDIUM", "LARGE", "X_LARGE"];

interface DimensionsRow {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  maxWeightOz: number;
}
type Dimensions = Record<Tier, DimensionsRow>;
type RepackagingFeesCents = Record<Tier, number>;

interface ConfigRow<T> {
  key: string;
  description: string | null;
  value: T;
  updatedAt: string;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Form schemas
// ---------------------------------------------------------------------------

const inches = (max = 240) => z.coerce.number().int().positive("Must be > 0").max(max, "Too large.");
const ounces = z.coerce.number().int().positive("Must be > 0").max(50_000, "Over 50,000 oz.");
const dollars = (max = 10_000) => z.coerce.number().nonnegative("Cannot be negative.").max(max, "Too large.");

const dimensionsRowSchema = z.object({
  lengthIn: inches(),
  widthIn: inches(),
  heightIn: inches(),
  maxWeightOz: ounces,
});
const dimensionsFormSchema = z.object({
  SMALL: dimensionsRowSchema,
  MEDIUM: dimensionsRowSchema,
  LARGE: dimensionsRowSchema,
  X_LARGE: dimensionsRowSchema,
});
type DimensionsForm = z.infer<typeof dimensionsFormSchema>;

const repackagingFormSchema = z.object({
  SMALL: dollars(),
  MEDIUM: dollars(),
  LARGE: dollars(),
  X_LARGE: dollars(),
});
type RepackagingForm = z.infer<typeof repackagingFormSchema>;

// ---------------------------------------------------------------------------
// Helpers — dollars↔cents at the boundary.
// ---------------------------------------------------------------------------

const centsToDollars = (c: number): number => Math.round(c) / 100;
const dollarsToCents = (d: number): number => Math.round(d * 100);

function dimensionsToForm(v: Dimensions): DimensionsForm {
  return {
    SMALL: { ...v.SMALL },
    MEDIUM: { ...v.MEDIUM },
    LARGE: { ...v.LARGE },
    X_LARGE: { ...v.X_LARGE },
  };
}
function repackagingToForm(v: RepackagingFeesCents): RepackagingForm {
  return {
    SMALL: centsToDollars(v.SMALL),
    MEDIUM: centsToDollars(v.MEDIUM),
    LARGE: centsToDollars(v.LARGE),
    X_LARGE: centsToDollars(v.X_LARGE),
  };
}
function repackagingFromForm(v: RepackagingForm): RepackagingFeesCents {
  return {
    SMALL: dollarsToCents(v.SMALL),
    MEDIUM: dollarsToCents(v.MEDIUM),
    LARGE: dollarsToCents(v.LARGE),
    X_LARGE: dollarsToCents(v.X_LARGE),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BoxTiersConfigPage(): JSX.Element {
  const qc = useQueryClient();

  const dimensionsQ = useQuery({
    queryKey: ["admin", "config", "tier_dimensions"],
    queryFn: () => api.get<ConfigRow<Dimensions>>("/admin/config/tier_dimensions"),
  });
  const repackagingQ = useQuery({
    queryKey: ["admin", "config", "repackaging_fees"],
    queryFn: () => api.get<ConfigRow<RepackagingFeesCents>>("/admin/config/repackaging_fees"),
  });

  if (dimensionsQ.isLoading || repackagingQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (dimensionsQ.error || repackagingQ.error || !dimensionsQ.data || !repackagingQ.data) {
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          Couldn&apos;t load box-tier configuration
        </div>
        <p className="mt-1 text-body-sm text-text">
          One of the configuration rows is missing. Run{" "}
          <code className="font-mono">pnpm prisma:seed</code> to seed defaults, or contact engineering.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[07] Configuration / Box tiers"
        title="Box tier dimensions & repackaging fees"
        description="Physical box specs the warehouse uses at receiving, and the per-tier rate we charge a vendor when their inbound packaging needs to be repacked into our standard tier."
      />
      <DimensionsSection
        initial={dimensionsQ.data}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "config"] })}
      />
      <RepackagingSection
        initial={repackagingQ.data}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "config"] })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: tier dimensions
// ---------------------------------------------------------------------------

function DimensionsSection({
  initial,
  onSaved,
}: {
  initial: ConfigRow<Dimensions>;
  onSaved: () => void;
}): JSX.Element {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const form = useForm<DimensionsForm>({
    resolver: zodResolver(dimensionsFormSchema),
    defaultValues: dimensionsToForm(initial.value),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const saveMut = useMutation({
    mutationFn: (input: DimensionsForm) =>
      api.patch<ConfigRow<Dimensions>>("/admin/config/tier_dimensions", { value: input }),
    onMutate: clear,
    onSuccess: async (next) => {
      setSaved(true);
      reset(dimensionsToForm(next.value));
      await qc.invalidateQueries({ queryKey: ["admin", "config", "tier_dimensions"] });
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-semibold text-ink">Tier dimensions</h2>
        <span className="font-mono text-mono-label uppercase text-text-muted">
          Used at receiving and order quoting
        </span>
      </header>
      <p className="max-w-prose text-body-sm text-text-muted">
        Inches for length / width / height, ounces for max weight. The receiving team uses these
        to bucket inbound boxes into a tier; the rating engine uses them to estimate carrier
        rates before label purchase.
      </p>

      <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} noValidate className="mt-6 flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-mono-label uppercase text-text-muted">
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2 pr-4">Length (in)</th>
                <th className="py-2 pr-4">Width (in)</th>
                <th className="py-2 pr-4">Height (in)</th>
                <th className="py-2 pr-4">Max weight (oz)</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t} className="border-b border-line/60 last:border-b-0">
                  <td className="py-3 pr-4 font-mono text-text">{t.replace("_", "-")}</td>
                  <td className="py-3 pr-4">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      invalid={!!errors[t]?.lengthIn}
                      {...register(`${t}.lengthIn`)}
                      className="max-w-[120px]"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      invalid={!!errors[t]?.widthIn}
                      {...register(`${t}.widthIn`)}
                      className="max-w-[120px]"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      invalid={!!errors[t]?.heightIn}
                      {...register(`${t}.heightIn`)}
                      className="max-w-[120px]"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      invalid={!!errors[t]?.maxWeightOz}
                      {...register(`${t}.maxWeightOz`)}
                      className="max-w-[140px]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ErrorBanner error={bannerError} onAction={onAction} />
        {saved ? (
          <div className="rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
            Dimensions saved. Audit log captured the change.
          </div>
        ) : null}

        <SectionFooter
          updatedAt={initial.updatedAt}
          updatedBy={initial.updatedBy}
          isDirty={isDirty}
          isPending={saveMut.isPending}
          onReset={() => reset(dimensionsToForm(initial.value))}
        />
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: repackaging fees
// ---------------------------------------------------------------------------

function RepackagingSection({
  initial,
  onSaved,
}: {
  initial: ConfigRow<RepackagingFeesCents>;
  onSaved: () => void;
}): JSX.Element {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const form = useForm<RepackagingForm>({
    resolver: zodResolver(repackagingFormSchema),
    defaultValues: repackagingToForm(initial.value),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const saveMut = useMutation({
    mutationFn: (input: RepackagingForm) =>
      api.patch<ConfigRow<RepackagingFeesCents>>("/admin/config/repackaging_fees", {
        value: repackagingFromForm(input),
      }),
    onMutate: clear,
    onSuccess: async (next) => {
      setSaved(true);
      reset(repackagingToForm(next.value));
      await qc.invalidateQueries({ queryKey: ["admin", "config", "repackaging_fees"] });
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-semibold text-ink">Repackaging fees</h2>
        <span className="font-mono text-mono-label uppercase text-text-muted">
          Charged when inbound packaging is non-standard
        </span>
      </header>
      <p className="max-w-prose text-body-sm text-text-muted">
        Per-tier fee debited from the vendor&apos;s wallet when the warehouse has to repack
        inbound items into our standard tier. Each row is the cost for one repacked box at
        that tier.
      </p>

      <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} noValidate className="mt-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {TIERS.map((t) => (
            <Field
              key={t}
              label={t.replace("_", "-")}
              hint="$ per repacked box"
              error={errors[t]?.message}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                invalid={!!errors[t]}
                {...register(t)}
              />
            </Field>
          ))}
        </div>

        <ErrorBanner error={bannerError} onAction={onAction} />
        {saved ? (
          <div className="rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
            Repackaging fees saved. Audit log captured the change.
          </div>
        ) : null}

        <SectionFooter
          updatedAt={initial.updatedAt}
          updatedBy={initial.updatedBy}
          isDirty={isDirty}
          isPending={saveMut.isPending}
          onReset={() => reset(repackagingToForm(initial.value))}
        />
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared footer
// ---------------------------------------------------------------------------

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
