/**
 * /admin/config/fees — friendly editor for the fee schedule.
 *
 * The raw `/admin/config/fee_schedule` page shows the JSON value verbatim
 * — fine for engineers, hostile to finance staff. This page renders the
 * same data as a structured form: dollar inputs, per-tier negotiated
 * toggles, grouped sections for onboarding / storage / fulfillment /
 * returns. On save it converts back to the canonical cents-based JSON
 * the API expects and PATCHes the existing config endpoint, so the
 * audit-log entry is identical regardless of which editor was used.
 *
 * Money everywhere in the UI is in DOLLARS. The shape on the wire
 * (and in the DB) stays in CENTS — this page is the single conversion
 * boundary.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types — mirror the canonical wire shape stored in `configuration.value`.
// ---------------------------------------------------------------------------

type Tier = "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE" | "PALLET";
const TIERS: Tier[] = ["SMALL", "MEDIUM", "LARGE", "X_LARGE", "PALLET"];

type OnboardingTier =
  | { stockingCents: number; firstMonthStorageCents: number; totalCents: number; negotiated?: false }
  | { negotiated: true };

interface FeeSchedule {
  onboarding: Record<Tier, OnboardingTier>;
  monthlyStorage: Record<Tier, number | null>;
  fulfillment: { baseCents: number; perAdditionalUnitCents: number };
  returnsHandlingCents: number;
}

interface ConfigRow {
  key: string;
  description: string | null;
  value: FeeSchedule;
  updatedAt: string;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Form schema — dollars in, cents out at submit time.
// ---------------------------------------------------------------------------

const dollars = (max = 1_000_000) =>
  z.coerce.number().nonnegative("Cannot be negative.").max(max, "Too large.");

const tierFormSchema = z.object({
  negotiated: z.boolean(),
  stockingDollars: dollars(),
  firstMonthStorageDollars: dollars(),
});

const formSchema = z.object({
  onboarding: z.object({
    SMALL: tierFormSchema,
    MEDIUM: tierFormSchema,
    LARGE: tierFormSchema,
    X_LARGE: tierFormSchema,
    PALLET: tierFormSchema,
  }),
  monthlyStorage: z.object({
    SMALL: dollars(),
    MEDIUM: dollars(),
    LARGE: dollars(),
    X_LARGE: dollars(),
    // PALLET is allowed to be left empty (string "") to encode `null`.
    PALLET: z.union([dollars(), z.literal("")]),
  }),
  fulfillment: z.object({
    baseDollars: dollars(10_000),
    perAdditionalUnitDollars: dollars(10_000),
  }),
  returnsHandlingDollars: dollars(10_000),
});
type FormInput = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const centsToDollars = (cents: number): number => Math.round(cents) / 100;
const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

function scheduleToForm(s: FeeSchedule): FormInput {
  const onboardingForm: FormInput["onboarding"] = {} as FormInput["onboarding"];
  for (const t of TIERS) {
    const o = s.onboarding[t];
    if ("negotiated" in o && o.negotiated) {
      onboardingForm[t] = {
        negotiated: true,
        stockingDollars: 0,
        firstMonthStorageDollars: 0,
      };
    } else {
      const priced = o as Exclude<OnboardingTier, { negotiated: true }>;
      onboardingForm[t] = {
        negotiated: false,
        stockingDollars: centsToDollars(priced.stockingCents),
        firstMonthStorageDollars: centsToDollars(priced.firstMonthStorageCents),
      };
    }
  }
  return {
    onboarding: onboardingForm,
    monthlyStorage: {
      SMALL: centsToDollars(s.monthlyStorage.SMALL ?? 0),
      MEDIUM: centsToDollars(s.monthlyStorage.MEDIUM ?? 0),
      LARGE: centsToDollars(s.monthlyStorage.LARGE ?? 0),
      X_LARGE: centsToDollars(s.monthlyStorage.X_LARGE ?? 0),
      PALLET: s.monthlyStorage.PALLET == null ? "" : centsToDollars(s.monthlyStorage.PALLET),
    },
    fulfillment: {
      baseDollars: centsToDollars(s.fulfillment.baseCents),
      perAdditionalUnitDollars: centsToDollars(s.fulfillment.perAdditionalUnitCents),
    },
    returnsHandlingDollars: centsToDollars(s.returnsHandlingCents),
  };
}

function formToSchedule(v: FormInput): FeeSchedule {
  const onboarding: FeeSchedule["onboarding"] = {} as FeeSchedule["onboarding"];
  for (const t of TIERS) {
    const o = v.onboarding[t];
    if (o.negotiated) {
      onboarding[t] = { negotiated: true };
    } else {
      const stockingCents = dollarsToCents(o.stockingDollars);
      const firstMonthStorageCents = dollarsToCents(o.firstMonthStorageDollars);
      onboarding[t] = {
        stockingCents,
        firstMonthStorageCents,
        totalCents: stockingCents + firstMonthStorageCents,
      };
    }
  }
  return {
    onboarding,
    monthlyStorage: {
      SMALL: dollarsToCents(v.monthlyStorage.SMALL as number),
      MEDIUM: dollarsToCents(v.monthlyStorage.MEDIUM as number),
      LARGE: dollarsToCents(v.monthlyStorage.LARGE as number),
      X_LARGE: dollarsToCents(v.monthlyStorage.X_LARGE as number),
      PALLET: v.monthlyStorage.PALLET === "" ? null : dollarsToCents(v.monthlyStorage.PALLET as number),
    },
    fulfillment: {
      baseCents: dollarsToCents(v.fulfillment.baseDollars),
      perAdditionalUnitCents: dollarsToCents(v.fulfillment.perAdditionalUnitDollars),
    },
    returnsHandlingCents: dollarsToCents(v.returnsHandlingDollars),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeeScheduleEditorPage(): JSX.Element {
  const qc = useQueryClient();
  const configQ = useQuery({
    queryKey: ["admin", "config", "fee_schedule"],
    queryFn: () => api.get<ConfigRow>("/admin/config/fee_schedule"),
  });

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: undefined,
  });
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = form;

  // Hydrate form from server data once it lands. We then never re-hydrate
  // unless the user explicitly clicks "Reset" — otherwise every save would
  // wipe in-flight typing.
  useEffect(() => {
    if (configQ.data) reset(scheduleToForm(configQ.data.value));
  }, [configQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const [saved, setSaved] = useState(false);
  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const saveMut = useMutation({
    mutationFn: (input: FormInput) =>
      api.patch<ConfigRow>("/admin/config/fee_schedule", { value: formToSchedule(input) }),
    onMutate: clear,
    onSuccess: async (next) => {
      setSaved(true);
      await qc.invalidateQueries({ queryKey: ["admin", "config"] });
      await qc.invalidateQueries({ queryKey: ["admin", "config", "fee_schedule"] });
      reset(scheduleToForm(next.value));
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  if (configQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (configQ.error || !configQ.data) {
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          Couldn&apos;t load the fee schedule
        </div>
        <p className="mt-1 text-body-sm text-text">
          The schedule may not be seeded yet. Run <code className="font-mono">pnpm prisma:seed</code>{" "}
          or contact engineering.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[07] Configuration / Pricing"
        title="Fee schedule (3PL)"
        description="Onboarding, storage, fulfillment, and returns rates for the multi-vendor fulfilment service. Saving writes a config audit row with the full before/after — every cent change is traceable."
      />

      {/* Cross-link — Personal Shopper has its own commission + freight
          + tax editor on a separate page; surface the link here so an
          admin landing on Pricing finds it without a sidebar guess. */}
      <div className="flex items-start gap-3 rounded-md border border-line bg-cream-soft p-4 text-body-sm text-text">
        <span className="mt-0.5 font-mono text-[11px] uppercase tracking-[1.4px] text-text-muted">
          Looking for shopper rates?
        </span>
        <span className="flex-1">
          The Personal Shopper feature (commission %, per-state sales tax, per-method freight rates)
          has its own editor.{" "}
          <a
            href="/admin/config/shopper"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
          >
            Open shopper pricing →
          </a>
        </span>
      </div>

      <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} noValidate className="flex flex-col gap-8">
        {/* ── Onboarding ──────────────────────────────────────────── */}
        <section className="rounded-md border border-line bg-white p-6">
          <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-h3 font-semibold text-ink">Onboarding fee per box</h2>
            <span className="font-mono text-mono-label uppercase text-text-muted">
              Charged on PSN submit
            </span>
          </header>
          <p className="max-w-prose text-body-sm text-text-muted">
            One-time fee when a vendor declares boxes in a Pre-Shipment Notice. Total =
            stocking + first month&apos;s storage. Toggle <strong>Negotiated</strong> for tiers
            that need a per-vendor quote (no auto-pricing).
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-mono-label uppercase text-text-muted">
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">Mode</th>
                  <th className="py-2 pr-4">Stocking ($)</th>
                  <th className="py-2 pr-4">First-month storage ($)</th>
                  <th className="py-2 pr-4 text-right">Total ($)</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((t) => {
                  const negotiated = watch(`onboarding.${t}.negotiated`);
                  const stockingD = Number(watch(`onboarding.${t}.stockingDollars`) ?? 0);
                  const storageD = Number(watch(`onboarding.${t}.firstMonthStorageDollars`) ?? 0);
                  const total = negotiated ? null : stockingD + storageD;
                  return (
                    <tr key={t} className="border-b border-line/60 last:border-b-0">
                      <td className="py-3 pr-4 font-mono text-text">{t.replace("_", "-")}</td>
                      <td className="py-3 pr-4">
                        <Controller
                          control={control}
                          name={`onboarding.${t}.negotiated`}
                          render={({ field }) => (
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                className="h-4 w-4"
                              />
                              <span
                                className={
                                  field.value
                                    ? "font-mono text-mono-label uppercase text-amber"
                                    : "font-mono text-mono-label uppercase text-text-muted"
                                }
                              >
                                {field.value ? "Negotiated" : "Fixed price"}
                              </span>
                            </label>
                          )}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          disabled={negotiated}
                          invalid={!!errors.onboarding?.[t]?.stockingDollars}
                          {...register(`onboarding.${t}.stockingDollars`)}
                          className="max-w-[140px]"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          disabled={negotiated}
                          invalid={!!errors.onboarding?.[t]?.firstMonthStorageDollars}
                          {...register(`onboarding.${t}.firstMonthStorageDollars`)}
                          className="max-w-[140px]"
                        />
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {negotiated ? (
                          <StatusPill tone="warning">Per-vendor quote</StatusPill>
                        ) : (
                          <span className="font-mono text-h3 tabular-nums text-ink">
                            ${(total ?? 0).toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Monthly storage ─────────────────────────────────────── */}
        <section className="rounded-md border border-line bg-white p-6">
          <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-h3 font-semibold text-ink">Monthly storage per box</h2>
            <span className="font-mono text-mono-label uppercase text-text-muted">
              Charged by the storage-billing cron
            </span>
          </header>
          <p className="max-w-prose text-body-sm text-text-muted">
            Recurring monthly rent per box that&apos;s still in the warehouse on bill date.
            Leave PALLET empty to keep it negotiated (no automatic monthly billing).
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            {TIERS.map((t) => (
              <Field key={t} label={t.replace("_", "-")} hint="$ per box per month">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  placeholder={t === "PALLET" ? "negotiated" : "0.00"}
                  invalid={!!errors.monthlyStorage?.[t]}
                  {...register(`monthlyStorage.${t}` as const)}
                />
              </Field>
            ))}
          </div>
        </section>

        {/* ── Fulfillment ─────────────────────────────────────────── */}
        <section className="rounded-md border border-line bg-white p-6">
          <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-h3 font-semibold text-ink">Fulfillment</h2>
            <span className="font-mono text-mono-label uppercase text-text-muted">
              Charged on every order
            </span>
          </header>
          <p className="max-w-prose text-body-sm text-text-muted">
            Pick + pack + label-prep. Base covers the first unit; the per-additional-unit rate
            applies to every unit after that.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field
              label="Base fee"
              hint="$ for the first unit on the order"
              error={errors.fulfillment?.baseDollars?.message}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                {...register("fulfillment.baseDollars")}
              />
            </Field>
            <Field
              label="Per additional unit"
              hint="$ for each unit after the first"
              error={errors.fulfillment?.perAdditionalUnitDollars?.message}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                {...register("fulfillment.perAdditionalUnitDollars")}
              />
            </Field>
          </div>
        </section>

        {/* ── Returns ─────────────────────────────────────────────── */}
        <section className="rounded-md border border-line bg-white p-6">
          <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-h3 font-semibold text-ink">Returns handling</h2>
            <span className="font-mono text-mono-label uppercase text-text-muted">
              Charged when a return is processed
            </span>
          </header>
          <div className="mt-6">
            <Field
              label="Per return"
              hint="$ per processed return (inspection + restock or disposal)"
              error={errors.returnsHandlingDollars?.message}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                className="max-w-xs"
                {...register("returnsHandlingDollars")}
              />
            </Field>
          </div>
        </section>

        {/* ── Action bar ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <ErrorBanner error={bannerError} onAction={onAction} />
          {saved ? (
            <div className="rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
              Saved. Audit log captured the change.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-cream-soft p-4">
            <p className="text-body-sm text-text-muted">
              Last updated{" "}
              <span className="font-mono">
                {new Date(configQ.data.updatedAt).toLocaleString()}
              </span>
              {configQ.data.updatedBy ? (
                <>
                  {" "}
                  by{" "}
                  <span className="font-mono">{configQ.data.updatedBy.slice(0, 8)}</span>
                </>
              ) : null}
              .
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => configQ.data && reset(scheduleToForm(configQ.data.value))}
                disabled={!isDirty || saveMut.isPending}
              >
                Reset
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="lg"
                withArrow
                disabled={!isDirty}
                loading={saveMut.isPending}
              >
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
