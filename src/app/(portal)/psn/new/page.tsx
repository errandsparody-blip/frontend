"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api, type ApiError } from "@/lib/api-client";
import type { PublicProduct } from "@/lib/schemas/products";
import {
  createPsnSchema,
  type CreatePsnInput,
  type PublicPsn,
  type StorageTier,
} from "@/lib/schemas/psn";

const TIERS: StorageTier[] = ["SMALL", "MEDIUM", "LARGE", "X_LARGE", "PALLET"];

// Subset of the seed config needed for the live preview.
const ONBOARDING_TOTAL_CENTS: Record<StorageTier, number | null> = {
  SMALL: 3400,
  MEDIUM: 5500,
  LARGE: 8500,
  X_LARGE: 12000,
  PALLET: null, // negotiated
};

export default function NewPsnPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  // The API caps `limit` at 100. Asking for more makes Zod reject with 400
  // and the page silently falls into the empty state below.
  // TODO: paginate properly once a vendor has >100 active products.
  const productsQ = useQuery({
    queryKey: ["products", { status: "ACTIVE" }],
    queryFn: () =>
      api.get<{ items: PublicProduct[]; nextCursor: string | null }>("/products?limit=100&status=ACTIVE"),
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreatePsnInput>({
    resolver: zodResolver(createPsnSchema),
    defaultValues: {
      declaredBoxCounts: { SMALL: 0, MEDIUM: 0, LARGE: 0, X_LARGE: 0, PALLET: 0 },
      lines: [],
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const declaredBoxCounts = watch("declaredBoxCounts");

  const liveFeeCents = TIERS.reduce((acc, tier) => {
    const count = Number(declaredBoxCounts?.[tier] ?? 0);
    if (count <= 0) return acc;
    const per = ONBOARDING_TOTAL_CENTS[tier];
    if (per === null) return acc; // pallet → negotiated
    return acc + per * count;
  }, 0);
  const hasNegotiated = (declaredBoxCounts?.PALLET ?? 0) > 0;

  async function onSubmit(values: CreatePsnInput): Promise<void> {
    setServerError(null);
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
      const e = err as ApiError;
      setServerError(e.message);
    }
  }

  if (productsQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading products…</div>;
  }
  // Distinguish "the request failed" from "no products yet" — they're very
  // different problems and conflating them masked a query-cap bug for a
  // while. Show the real error so the next regression is obvious.
  if (productsQ.error) {
    return (
      <div
        role="alert"
        className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error"
      >
        Couldn&apos;t load your products: {(productsQ.error as ApiError).message ?? "Unknown error."}
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
        description="Declare every product and box you're shipping. The onboarding fee is computed from the box mix at submit."
      />

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
              ${(liveFeeCents / 100).toFixed(2)}
              {hasNegotiated ? (
                <span className="ml-2 font-mono text-body-sm text-amber">+ pallet quote</span>
              ) : null}
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

        {serverError ? (
          <div role="alert" className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error">
            {serverError}
          </div>
        ) : null}

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
