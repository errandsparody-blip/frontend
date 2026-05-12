"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import { ErrorBanner } from "@/components/errors/error-banner";
import { StorageTierGuide } from "@/components/portal/storage-tier-guide";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import type { PublicProduct } from "@/lib/schemas/products";
import {
  createPsnSchema,
  type CreatePsnInput,
  type PublicPsn,
  type StorageTier,
} from "@/lib/schemas/psn";

const TIERS: StorageTier[] = ["SMALL", "MEDIUM", "LARGE", "X_LARGE", "PALLET"];

// Wire shape returned by GET /v1/fees/onboarding. Mirrors the storage on
// the `fee_schedule` config row — each tier is either a priced object or
// a "negotiated" marker.
type OnboardingFeeEntry =
  | { stockingCents: number; firstMonthStorageCents: number; totalCents: number; negotiated?: false }
  | { negotiated: true };
type OnboardingFees = Record<StorageTier, OnboardingFeeEntry>;

export default function NewPsnPage() {
  const router = useRouter();
  const qc = useQueryClient();

  // The API caps `limit` at 100. Asking for more makes Zod reject with 400
  // and the page silently falls into the empty state below.
  // TODO: paginate properly once a vendor has >100 active products.
  const productsQ = useQuery({
    queryKey: ["products", { status: "ACTIVE" }],
    queryFn: () =>
      api.get<{ items: PublicProduct[]; nextCursor: string | null }>("/products?limit=100&status=ACTIVE"),
  });

  // Pull the live onboarding fee schedule from the API instead of trusting
  // a frontend constant. Without this, finance staff editing rates via
  // /admin/config/fees would silently desync from what vendors see in the
  // submit preview here. The backend's compute path at PSN submit reads
  // the same source of truth, so preview and reality always agree.
  const feesQ = useQuery({
    queryKey: ["fees", "onboarding"],
    queryFn: () => api.get<{ onboarding: OnboardingFees }>("/fees/onboarding"),
    // Rates change rarely; let the data sit a bit before re-fetching.
    staleTime: 60_000,
  });

  const form = useForm<CreatePsnInput>({
    resolver: zodResolver(createPsnSchema),
    defaultValues: {
      declaredBoxCounts: { SMALL: 0, MEDIUM: 0, LARGE: 0, X_LARGE: 0, PALLET: 0 },
      lines: [],
      notes: "",
    },
  });
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const declaredBoxCounts = watch("declaredBoxCounts");

  // Live preview total: sum count × tier.totalCents using whatever the
  // backend currently publishes. If the schedule hasn't loaded yet (slow
  // network, server temporarily unreachable), we fall back to null and the
  // UI shows "—" instead of guessing — better to be silent than to lie.
  const onboardingFees = feesQ.data?.onboarding;
  const previewIsLive = !!onboardingFees;
  const previewFeeCents = onboardingFees
    ? TIERS.reduce((acc, tier) => {
        const count = Number(declaredBoxCounts?.[tier] ?? 0);
        if (count <= 0) return acc;
        const entry = onboardingFees[tier];
        if (!entry || ("negotiated" in entry && entry.negotiated)) return acc;
        return acc + entry.totalCents * count;
      }, 0)
    : null;
  // A tier is "negotiated" if the live schedule says so. We mark PALLET
  // declarations as negotiated even pre-load (its near-universal default).
  const hasNegotiatedDeclared = TIERS.some((t) => {
    const count = Number(declaredBoxCounts?.[t] ?? 0);
    if (count <= 0) return false;
    if (!onboardingFees) return t === "PALLET";
    const entry = onboardingFees[t];
    return !!entry && "negotiated" in entry && entry.negotiated;
  });

  async function onSubmit(values: CreatePsnInput): Promise<void> {
    clear();
    try {
      // Strip zero-count tiers — the API requires at least one positive entry.
      const cleanedCounts = Object.fromEntries(
        Object.entries(values.declaredBoxCounts).filter(([, v]) => Number(v) > 0),
      );
      const created = await api.post<PublicPsn>("/psns", {
        ...values,
        declaredBoxCounts: cleanedCounts,
      });
      await qc.invalidateQueries({ queryKey: ["psns"] });
      router.push(`/psn/${created.id}`);
    } catch (err) {
      handle(err);
    }
  }

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  if (productsQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading products…</div>;
  }
  // Distinguish "the request failed" from "no products yet" — they're very
  // different problems and conflating them masked a query-cap bug for a
  // while. Show the real error so the next regression is obvious.
  if (productsQ.error) {
    const normalized = normalizeError(productsQ.error);
    return (
      <div
        role="alert"
        className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
      >
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized.entry.title}
        </div>
        <p className="mt-1 text-body-sm text-text">{normalized.entry.body}</p>
        {normalized.correlationId ? (
          <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            Reference: {normalized.correlationId.slice(0, 16)}
          </div>
        ) : null}
      </div>
    );
  }
  if (!productsQ.data || productsQ.data.items.length === 0) {
    return (
      <div className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4 text-body-sm">
        Add at least one product before creating a PSN. Go to Products → Add product.
      </div>
    );
  }
  const products = productsQ.data.items;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[04] PSN / New"
        title="New Pre-Shipment Notice"
        description="Declare every product and box you're shipping. The onboarding fee is computed from the box mix at submit — open the storage tier guide if you're unsure which tier to pick."
      />

      {/* Boxes by tier — same prominent reference card as on the PSN list.
          Lives under the header so a vendor about to fill in box counts
          can look up the live pricing without leaving the form. */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-cream-soft px-6 py-5">
        <div>
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
            Boxes by tier
          </div>
          <h2 className="mt-1 text-h3 font-semibold text-ink">
            Look up storage tier pricing
          </h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Dimensions, cubic volume, stocking fee, and monthly storage for each
            tier — sourced live from the admin pricing config, so what you see
            is exactly what your wallet is debited at submit.
          </p>
        </div>
        <StorageTierGuide triggerLabel="Open storage tier guide" />
      </section>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8" noValidate>
        {/* Shipment meta */}
        <section className="rounded-md border border-line bg-white p-8">
          <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Shipment</h2>
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Expected arrival">
              <Input type="date" {...register("expectedArrivalDate")} />
            </Field>
            <Field label="Carrier" hint="DHL, FedEx International, UPS, etc.">
              <Input type="text" placeholder="DHL Express" {...register("carrier")} />
            </Field>
            <Field label="Master tracking">
              <Input type="text" placeholder="1Z999AA10123456784" {...register("masterTracking")} />
            </Field>
          </div>
          <Field label="Notes (optional)" className="mt-5">
            <Input
              type="text"
              placeholder="Anything the warehouse should know"
              {...register("notes")}
            />
          </Field>
        </section>

        {/* Box counts */}
        <section className="rounded-md border border-line bg-white p-8">
          <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Boxes by tier</h2>
          <div className="grid gap-5 md:grid-cols-5">
            {TIERS.map((tier) => (
              <Field key={tier} label={tier.replace("_", "-")}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  {...register(`declaredBoxCounts.${tier}`, { valueAsNumber: true })}
                />
              </Field>
            ))}
          </div>
          <div className="mt-6 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-mono text-mono-label uppercase text-text-muted">
              Estimated onboarding fee
            </span>
            <span className="font-mono text-h2 tabular-nums">
              {previewIsLive && previewFeeCents !== null ? (
                <>
                  ${(previewFeeCents / 100).toFixed(2)}
                  {hasNegotiatedDeclared ? (
                    <span className="ml-2 font-mono text-body-sm text-amber">
                      + negotiated tier quote
                    </span>
                  ) : null}
                </>
              ) : (
                // Schedule fetch is in flight or failed. Don't show a stale
                // estimate from frontend constants — the backend computes
                // the real charge at submit either way.
                <span className="font-mono text-body-sm text-text-muted">
                  {feesQ.error
                    ? "Live rate unavailable — submit will use the current schedule."
                    : "Loading rates…"}
                </span>
              )}
            </span>
          </div>
          {errors.declaredBoxCounts ? (
            <span className="mt-2 block text-caption text-error">
              {errors.declaredBoxCounts.message ?? "Declare at least one box."}
            </span>
          ) : null}
        </section>

        {/* Lines */}
        <section className="rounded-md border border-line bg-white p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-mono-label uppercase text-text-muted">Lines</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  productId: products[0]?.id ?? "",
                  declaredQty: 1,
                  notes: "",
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add line
            </Button>
          </div>

          {fields.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-cream-soft px-6 py-10 text-center text-body-sm text-text-muted">
              No lines yet. Add a line for each product type in this shipment.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {fields.map((f, idx) => (
                <div
                  key={f.id}
                  className="grid gap-4 rounded-sm border border-line bg-cream-soft p-4 md:grid-cols-[1fr_140px_1fr_44px] md:items-end"
                >
                  <Field label="Product">
                    <Controller
                      control={control}
                      name={`lines.${idx}.productId`}
                      render={({ field }) => (
                        <select
                          {...field}
                          className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    />
                  </Field>
                  <Field label="Qty" error={errors.lines?.[idx]?.declaredQty?.message}>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      {...register(`lines.${idx}.declaredQty`, { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="Notes (optional)">
                    <Input type="text" {...register(`lines.${idx}.notes`)} />
                  </Field>
                  <button
                    type="button"
                    aria-label="Remove line"
                    onClick={() => remove(idx)}
                    className="flex h-11 w-11 items-center justify-center rounded-sm border border-line-strong bg-white text-text-muted hover:border-error hover:text-error"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {errors.lines?.message ? (
            <span className="mt-2 block text-caption text-error">{errors.lines.message}</span>
          ) : null}
        </section>

        <ErrorBanner error={bannerError} onAction={onAction} />

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/psn")}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="lg" withArrow loading={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save as draft"}
          </Button>
        </div>
      </form>
    </div>
  );
}
