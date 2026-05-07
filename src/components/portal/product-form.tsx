"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api-client";
import { createProductSchema, type CreateProductInput } from "@/lib/schemas/products";

interface ProductFormProps {
  initial?: Partial<CreateProductInput>;
  submitLabel: string;
  onSubmit: (values: CreateProductInput) => Promise<void>;
  /** Hide the immutable code field on edit. */
  showCode?: boolean;
}

export function ProductForm({
  initial,
  onSubmit,
  submitLabel,
  showCode = true,
}: ProductFormProps): JSX.Element {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      code: initial?.code ?? "",
      name: initial?.name ?? "",
      variant: initial?.variant ?? "STD",
      hsCode: initial?.hsCode ?? "",
      countryOfOrigin: initial?.countryOfOrigin ?? "",
      declaredValueCents: initial?.declaredValueCents ?? 0,
      weightOz: initial?.weightOz ?? 0,
      lengthIn: initial?.lengthIn ?? 0,
      widthIn: initial?.widthIn ?? 0,
      heightIn: initial?.heightIn ?? 0,
    },
  });

  async function submit(values: CreateProductInput): Promise<void> {
    setServerError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      const e = err as ApiError;
      setServerError(e.message);
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-6" noValidate>
      <section className="grid gap-5 md:grid-cols-2">
        {showCode ? (
          <Field
            label="Product code"
            error={errors.code?.message}
            hint="Uppercase, digits, hyphens. Becomes part of the SKU id."
          >
            <Input
              type="text"
              autoComplete="off"
              placeholder="TSH-BLK-M"
              invalid={!!errors.code}
              {...register("code")}
            />
          </Field>
        ) : null}
        <Field label="Variant" error={errors.variant?.message} hint="Default: STD.">
          <Input type="text" placeholder="STD" invalid={!!errors.variant} {...register("variant")} />
        </Field>
        <Field label="Display name" error={errors.name?.message} className="md:col-span-2">
          <Input
            type="text"
            placeholder="T-shirt — Black, M"
            invalid={!!errors.name}
            {...register("name")}
          />
        </Field>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <Field
          label="Declared value (cents)"
          error={errors.declaredValueCents?.message}
          hint="Customs valuation. 1500 = $15.00."
        >
          <Input
            type="number"
            min={0}
            step={1}
            invalid={!!errors.declaredValueCents}
            {...register("declaredValueCents")}
          />
        </Field>
        <Field label="Country of origin" error={errors.countryOfOrigin?.message} hint="ISO code: NG, GB, US.">
          <Input
            type="text"
            maxLength={2}
            placeholder="NG"
            invalid={!!errors.countryOfOrigin}
            {...register("countryOfOrigin")}
          />
        </Field>
        <Field label="HS code (optional)" error={errors.hsCode?.message}>
          <Input type="text" placeholder="610910" invalid={!!errors.hsCode} {...register("hsCode")} />
        </Field>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Dimensions</h2>
        <div className="grid gap-5 md:grid-cols-4">
          <Field label="Weight (oz)" error={errors.weightOz?.message}>
            <Input type="number" min={0} step={0.1} invalid={!!errors.weightOz} {...register("weightOz")} />
          </Field>
          <Field label="Length (in)" error={errors.lengthIn?.message}>
            <Input type="number" min={0} step={0.1} invalid={!!errors.lengthIn} {...register("lengthIn")} />
          </Field>
          <Field label="Width (in)" error={errors.widthIn?.message}>
            <Input type="number" min={0} step={0.1} invalid={!!errors.widthIn} {...register("widthIn")} />
          </Field>
          <Field label="Height (in)" error={errors.heightIn?.message}>
            <Input type="number" min={0} step={0.1} invalid={!!errors.heightIn} {...register("heightIn")} />
          </Field>
        </div>
      </section>

      {serverError ? (
        <div role="alert" className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error">
          {serverError}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="lg" withArrow loading={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
