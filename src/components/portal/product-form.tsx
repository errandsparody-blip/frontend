"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

// ---------------------------------------------------------------------------
// Form-shape vs wire-shape
// ---------------------------------------------------------------------------
//
// The API stores money in CENTS (`declaredValueCents`) and weight in OUNCES
// (`weightOz`). Both are precise machine-friendly units. The form lets the
// vendor type the values they're comfortable with — dollars for money, and
// any of oz/lb/g/kg for weight — and converts to the canonical wire shape
// at the submit boundary. Same pattern as the fee schedule editor.

type WeightUnit = "oz" | "lb" | "g" | "kg";

const WEIGHT_UNITS: Array<{ value: WeightUnit; label: string }> = [
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
];

// Multipliers from each unit → ounces (the wire format). Numbers chosen
// from the standard NIST conversion factors; rounded to a precision that
// round-trips through Number cleanly for typical product weights.
const TO_OZ: Record<WeightUnit, number> = {
  oz: 1,
  lb: 16,
  g: 0.0352739619,
  kg: 35.2739619,
};

function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to || !Number.isFinite(value)) return value;
  const inOz = value * TO_OZ[from];
  return inOz / TO_OZ[to];
}

const WEIGHT_UNIT_STORAGE_KEY = "usa-errands.preferred-weight-unit";

function readPreferredUnit(): WeightUnit {
  if (typeof window === "undefined") return "oz";
  const v = window.localStorage.getItem(WEIGHT_UNIT_STORAGE_KEY);
  if (v === "oz" || v === "lb" || v === "g" || v === "kg") return v;
  return "oz";
}

const formSchema = createProductSchema
  .omit({ declaredValueCents: true, weightOz: true })
  .extend({
    declaredValueDollars: z.coerce
      .number()
      .nonnegative("Cannot be negative.")
      .max(1_000_000, "Too large."),
    weightValue: z.coerce
      .number()
      .positive("Must be greater than zero.")
      .max(50_000, "Too large for one parcel."),
    weightUnit: z.enum(["oz", "lb", "g", "kg"]),
  });
type FormInput = z.infer<typeof formSchema>;

const centsToDollars = (c: number): number => Math.round(c) / 100;
const dollarsToCents = (d: number): number => Math.round(d * 100);
const round2 = (n: number): number => Math.round(n * 100) / 100;

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
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    // Initial unit is "oz" — this is what we'll have on first render
    // (server + first client render, to avoid hydration mismatch). We
    // upgrade to the user's preferred unit in a useEffect below.
    defaultValues: {
      code: initial?.code ?? "",
      name: initial?.name ?? "",
      variant: initial?.variant ?? "STD",
      hsCode: initial?.hsCode ?? "",
      countryOfOrigin: initial?.countryOfOrigin ?? "",
      declaredValueDollars: centsToDollars(initial?.declaredValueCents ?? 0),
      weightValue: round2(initial?.weightOz ?? 0),
      weightUnit: "oz",
      // Dimensions are optional — left as empty string so a vendor who hasn't
      // measured the box yet can leave them blank without tripping the
      // `positive()` Zod check. The schema's `optionalDimension` collapses
      // empty / null / undefined to undefined on submit.
      lengthIn:
        initial?.lengthIn != null
          ? initial.lengthIn
          : (undefined as unknown as number),
      widthIn:
        initial?.widthIn != null
          ? initial.widthIn
          : (undefined as unknown as number),
      heightIn:
        initial?.heightIn != null
          ? initial.heightIn
          : (undefined as unknown as number),
    },
  });

  const weightUnit = watch("weightUnit");

  // Apply the user's preferred unit after mount (localStorage isn't
  // available during SSR, so we can't use it to seed defaultValues
  // without risking a hydration mismatch). Convert the displayed value
  // along with the unit so the same physical weight stays selected.
  useEffect(() => {
    const preferred = readPreferredUnit();
    if (preferred !== "oz") {
      const current = Number(getValues("weightValue") ?? 0);
      setValue("weightValue", round2(convertWeight(current, "oz", preferred)));
      setValue("weightUnit", preferred);
    }
    // We deliberately run this only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChangeWeightUnit(next: WeightUnit): void {
    const current = Number(getValues("weightValue") ?? 0);
    const previous = getValues("weightUnit");
    if (next === previous) return;
    setValue("weightValue", round2(convertWeight(current, previous, next)), {
      shouldValidate: false,
    });
    setValue("weightUnit", next, { shouldValidate: false, shouldDirty: true });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, next);
    }
  }

  async function submit(values: FormInput): Promise<void> {
    setServerError(null);
    try {
      const { declaredValueDollars, weightValue, weightUnit: unit, ...rest } = values;
      const weightOz = convertWeight(weightValue, unit, "oz");
      const wireValues: CreateProductInput = {
        ...rest,
        declaredValueCents: dollarsToCents(declaredValueDollars),
        weightOz: round2(weightOz),
      };
      await onSubmit(wireValues);
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
          label="Declared value (USD)"
          error={errors.declaredValueDollars?.message}
          hint="Customs valuation. Enter dollars and cents — e.g. 15.00 for $15."
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="15.00"
            invalid={!!errors.declaredValueDollars}
            {...register("declaredValueDollars")}
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
          <Field
            label="Weight"
            error={errors.weightValue?.message ?? errors.weightUnit?.message}
            hint={
              weightUnit === "oz"
                ? "Pick a different unit on the right if you prefer."
                : `Stored internally in oz · ${weightUnit} is your preference.`
            }
          >
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                invalid={!!errors.weightValue}
                className="flex-1"
                {...register("weightValue")}
              />
              <select
                aria-label="Weight unit"
                value={weightUnit ?? "oz"}
                onChange={(e) => onChangeWeightUnit(e.target.value as WeightUnit)}
                className="h-11 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm uppercase text-text outline-none focus:border-ink"
              >
                {WEIGHT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field
            label="Length (in)"
            hint="Optional — improves carrier rate accuracy."
            error={errors.lengthIn?.message}
          >
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder="—"
              invalid={!!errors.lengthIn}
              {...register("lengthIn")}
            />
          </Field>
          <Field
            label="Width (in)"
            hint="Optional."
            error={errors.widthIn?.message}
          >
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder="—"
              invalid={!!errors.widthIn}
              {...register("widthIn")}
            />
          </Field>
          <Field
            label="Height (in)"
            hint="Optional."
            error={errors.heightIn?.message}
          >
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder="—"
              invalid={!!errors.heightIn}
              {...register("heightIn")}
            />
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
