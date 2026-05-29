"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ProductImageUploader } from "@/components/portal/product-image-uploader";
import { StorageTierGuide } from "@/components/portal/storage-tier-guide";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api-client";
import { COUNTRIES } from "@/lib/countries";
import {
  createProductSchema,
  storageTierSchema,
  type CreateProductInput,
  type StorageTier,
} from "@/lib/schemas/products";

interface ProductFormProps {
  // `imageUrl` is required on the create-product schema (vendors must
  // upload a photo before save) but legacy products created before
  // that requirement landed have null images. We loosen the prop to
  // accept `string | null` so the edit page can prefill the form
  // without forcing every old row to be patched first.
  initial?: Partial<Omit<CreateProductInput, "imageUrl">> & {
    imageUrl?: string | null;
  };
  submitLabel: string;
  onSubmit: (values: CreateProductInput) => Promise<void>;
  /** Hide the immutable code field on edit. */
  showCode?: boolean;
  /**
   * When true, EVERY field is rendered disabled and a banner explains the
   * lock. Set this on edit pages where at least one SKU has been received
   * under the product. The backend mirrors this — patches that change any
   * lockable field return 400 with code `product_locked`.
   *
   * Vendors who need to change a locked product archive it (status field
   * stays editable for that purpose) and create a new product with the
   * updated details.
   */
  locked?: boolean;
  /**
   * Legacy alias kept for the variant-only lock that pre-dated the
   * full-product lock. Treated identically to `locked` going forward —
   * once any SKU exists, every field is off-limits, not just variant.
   * @deprecated use `locked` instead
   */
  variantLocked?: boolean;
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

// ---------------------------------------------------------------------------
// Storage-tier auto-suggest
// ---------------------------------------------------------------------------
//
// Mirrors the `tier_dimensions` configuration row seeded by the API
// (prisma/seed.ts). KEEP IN SYNC: if the seed values change, update this
// table too. The vendor product form uses these to suggest a tier from
// the typed L×W×H + weight; the vendor can always override.

interface TierEnvelope {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  maxWeightOz: number;
}

// KEEP IN SYNC with prisma/seed.ts → TIER_DIMENSIONS and the public pricing
// guide. These envelopes are used by the suggest-tier helper to pick the
// smallest box a product fits into; if the seed numbers change here without
// the server side following, vendors will see mismatched recommendations.
const TIER_ENVELOPES: Array<{ tier: StorageTier; box: TierEnvelope }> = [
  { tier: "SMALL", box: { lengthIn: 16, widthIn: 12, heightIn: 12, maxWeightOz: 480 } },
  { tier: "MEDIUM", box: { lengthIn: 18, widthIn: 18, heightIn: 16, maxWeightOz: 800 } },
  { tier: "LARGE", box: { lengthIn: 18, widthIn: 18, heightIn: 24, maxWeightOz: 1280 } },
  { tier: "X_LARGE", box: { lengthIn: 24, widthIn: 18, heightIn: 24, maxWeightOz: 1920 } },
];

/**
 * Suggest the smallest tier that fits the given product dimensions and
 * weight. Returns null when not enough info is available (no dimensions
 * AND no weight). When weight alone is given, suggests by weight only.
 *
 * Items larger than X_LARGE return "PALLET" — pallets are negotiated
 * separately, but the suggestion at least nudges the vendor toward
 * support.
 */
function suggestTier(args: {
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  weightOz?: number | null;
}): StorageTier | null {
  const dims =
    args.lengthIn != null && args.widthIn != null && args.heightIn != null;
  const w = args.weightOz != null && args.weightOz > 0 ? args.weightOz : null;
  if (!dims && w == null) return null;

  // Sort the input dimensions so a 4×9×12 product matches a 12×9×4 box.
  const sorted = dims
    ? [args.lengthIn!, args.widthIn!, args.heightIn!].sort((a, b) => b - a)
    : null;

  for (const { tier, box } of TIER_ENVELOPES) {
    if (sorted) {
      const boxSorted = [box.lengthIn, box.widthIn, box.heightIn].sort(
        (a, b) => b - a,
      );
      if (
        sorted[0]! > boxSorted[0]! ||
        sorted[1]! > boxSorted[1]! ||
        sorted[2]! > boxSorted[2]!
      ) {
        continue;
      }
    }
    if (w != null && w > box.maxWeightOz) continue;
    return tier;
  }
  return "PALLET";
}

export function ProductForm({
  initial,
  onSubmit,
  submitLabel,
  showCode = true,
  locked: lockedProp = false,
  variantLocked = false,
}: ProductFormProps): JSX.Element {
  // Either the new full-product lock OR the legacy variant-only flag
  // disables every editable field. Both end up at the same place: an
  // immutable product with stock under it.
  const locked = lockedProp || variantLocked;
  const [serverError, setServerError] = useState<string | null>(null);
  // After a successful save we flash a green "Saved ✓" state on the
  // button for ~1.6 s. Held in component state so the flash survives
  // re-renders triggered by react-hook-form's reset logic, and so the
  // parent's router.push doesn't race the user's perception of "did it
  // actually save?".
  const [savedJustNow, setSavedJustNow] = useState(false);
  // Image is intentionally held outside react-hook-form. The upload is
  // asynchronous (presign → R2 PUT) and updates this state on completion;
  // mixing that into the resolved-form-values flow would force the form
  // to re-validate on every byte. The submit handler injects the URL into
  // the wire payload at the very end.
  const [imageUrl, setImageUrl] = useState<string | null>(
    initial?.imageUrl ?? null,
  );
  // Inline "you need an image" error rendered under the uploader.
  // Cleared as soon as the vendor uploads a file or switches off the
  // create path. Held separately from `serverError` so a network failure
  // banner up top doesn't overwrite the image-specific guidance.
  const [imageError, setImageError] = useState<string | null>(null);
  // Whether a product image is required on this render. Required when
  // creating a brand-new product (showCode is the form's create-vs-edit
  // proxy — it's true on /products/new, false on /products/[id]). Edits
  // stay permissive so existing products created before the requirement
  // landed are still patchable. The locked banner case is also exempt
  // because no field is editable then.
  const imageRequired = showCode && !locked;

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
      storageTier: (initial?.storageTier as StorageTier | undefined) ?? "SMALL",
    },
  });

  const weightUnit = watch("weightUnit");
  const weightValue = watch("weightValue");
  const lengthIn = watch("lengthIn");
  const widthIn = watch("widthIn");
  const heightIn = watch("heightIn");
  const storageTier = watch("storageTier");

  // Compute a suggested tier from the typed dimensions + weight. Returns
  // null when the form doesn't have enough info, in which case the
  // suggestion UI hides itself. The vendor's explicit choice always wins
  // — we never auto-overwrite their selection.
  const suggestedTier = useMemo(() => {
    const w =
      typeof weightValue === "number" && Number.isFinite(weightValue) && weightValue > 0
        ? convertWeight(weightValue, weightUnit ?? "oz", "oz")
        : null;
    return suggestTier({
      lengthIn: typeof lengthIn === "number" ? lengthIn : null,
      widthIn: typeof widthIn === "number" ? widthIn : null,
      heightIn: typeof heightIn === "number" ? heightIn : null,
      weightOz: w,
    });
  }, [lengthIn, widthIn, heightIn, weightValue, weightUnit]);

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
    setSavedJustNow(false);
    // Gate on the image BEFORE any network work. The image lives
    // outside react-hook-form (async R2 upload) so Zod can't catch a
    // missing image at validation time the way it does for the other
    // fields. We surface the requirement inline next to the uploader
    // and bail out so the wire payload is never sent half-built.
    if (imageRequired && !imageUrl) {
      setImageError("A product image is required. Upload a photo before saving.");
      return;
    }
    setImageError(null);
    try {
      const { declaredValueDollars, weightValue, weightUnit: unit, ...rest } = values;
      const weightOz = convertWeight(weightValue, unit, "oz");
      // imageUrl is a non-null URL when we get here in the create path
      // (gated above). On the update path it can still be null — the
      // backend's updateProductSchema accepts null to keep / clear
      // an existing image.
      const wireValues: CreateProductInput = {
        ...rest,
        declaredValueCents: dollarsToCents(declaredValueDollars),
        weightOz: round2(weightOz),
        imageUrl: (imageUrl ?? null) as string,
      };
      await onSubmit(wireValues);
      // Success — flash the confirmation. If the parent navigated away
      // the timeout simply never fires (component unmounted) and the
      // setState call below is a no-op.
      setSavedJustNow(true);
      window.setTimeout(() => setSavedJustNow(false), 1600);
    } catch (err) {
      const e = err as ApiError;
      setServerError(e.message);
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-6" noValidate>
      {locked ? (
        <div
          role="note"
          className="rounded-sm border-l-4 border-amber bg-amber/10 px-5 py-4 text-body-sm"
        >
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
            Locked — product is final
          </div>
          <p className="mt-1 text-text">
            Products are immutable once they&apos;ve been created. Identity, customs,
            weight, dimensions, storage tier, <strong>and the product image</strong>
            {" "}all stay fixed so every PSN, order, and customs declaration tied to
            this product references the same values. To change anything, archive
            this product and create a new one with the corrected details.
          </p>
        </div>
      ) : null}

      {/* Product image — leads the form so the visual asset is the
          first thing the vendor sees. Required on create so admin
          receivers always have a photo to match incoming stock against
          the declaration; surfaced with an asterisk on the label and an
          inline error if the vendor tries to submit empty. */}
      <section>
        <h2 className="mb-2 font-mono text-mono-label uppercase text-text-muted">
          Product image
          {imageRequired ? (
            <span aria-hidden="true" className="ml-1 text-error">
              *
            </span>
          ) : null}
          {imageRequired ? (
            <span className="sr-only"> (required)</span>
          ) : null}
        </h2>
        <ProductImageUploader
          value={imageUrl}
          onChange={(next) => {
            setImageUrl(next);
            // Any successful upload clears the requirement error so
            // the vendor sees an immediate response to fixing it.
            if (next) setImageError(null);
          }}
          disabled={locked}
        />
        {imageError ? (
          <p className="mt-2 text-caption text-error" role="alert">
            {imageError}
          </p>
        ) : imageRequired && !imageUrl ? (
          <p className="mt-2 text-caption text-text-muted">
            Required. The warehouse uses this photo to match your stock
            on arrival.
          </p>
        ) : null}
      </section>

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
              disabled={locked}
              {...register("code")}
            />
          </Field>
        ) : null}
        <Field
          label="Variant"
          error={errors.variant?.message}
          hint={
            locked
              ? "Locked — already used in SKU ids. Archive and create a new product to change."
              : "Default: STD."
          }
        >
          <Input
            type="text"
            placeholder="STD"
            invalid={!!errors.variant}
            disabled={locked}
            {...register("variant")}
          />
        </Field>
        <Field label="Display name" error={errors.name?.message} className="md:col-span-2">
          <Input
            type="text"
            placeholder="T-shirt — Black, M"
            invalid={!!errors.name}
            disabled={locked}
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
            disabled={locked}
            {...register("declaredValueDollars")}
          />
        </Field>
        <Field
          label="Country of origin"
          error={errors.countryOfOrigin?.message}
          hint="Pick from the list, or type the 2-letter ISO code directly (NG, GB, US…)."
        >
          {/* Picker + code input live side-by-side. The picker is the
              primary UI; the code input mirrors the selection and
              remains editable for power users who already know the
              code. Selecting from the dropdown calls setValue() on
              the ISO field so react-hook-form stays the source of
              truth — the dropdown itself is not registered. */}
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <select
              aria-label="Country picker"
              disabled={locked}
              value={(watch("countryOfOrigin") ?? "").toUpperCase()}
              onChange={(e) => {
                setValue("countryOfOrigin", e.target.value, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
              }}
              className="h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">— Select country —</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            <Input
              type="text"
              maxLength={2}
              placeholder="NG"
              aria-label="ISO 3166-1 alpha-2 country code"
              invalid={!!errors.countryOfOrigin}
              disabled={locked}
              {...register("countryOfOrigin", {
                // Normalise to uppercase as the user types so the
                // dropdown's value-match works without a separate
                // effect. The schema also uppercases at submit time
                // but doing it here keeps the UI in sync immediately.
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.toUpperCase();
                  if (v !== e.target.value) {
                    setValue("countryOfOrigin", v, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }
                },
              })}
            />
          </div>
        </Field>
        <Field label="HS code (optional)" error={errors.hsCode?.message}>
          <Input
            type="text"
            placeholder="610910"
            invalid={!!errors.hsCode}
            disabled={locked}
            {...register("hsCode")}
          />
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
                disabled={locked}
                {...register("weightValue")}
              />
              <select
                aria-label="Weight unit"
                value={weightUnit ?? "oz"}
                onChange={(e) => onChangeWeightUnit(e.target.value as WeightUnit)}
                disabled={locked}
                className="h-11 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm uppercase text-text outline-none focus:border-ink disabled:opacity-60"
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
              disabled={locked}
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
              disabled={locked}
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
              disabled={locked}
              {...register("heightIn")}
            />
          </Field>
          {/* Storage tier is no longer collected on the product form.
              Billing is per physical box (migration 0035), so the tier
              that matters is the one the vendor declares on the
              Pre-Shipment Notice for each box they actually ship — not
              a single tier guessed up-front for the product. The
              database column stays on the Product model for legacy
              compatibility but is not surfaced anywhere a vendor or
              operator reads. */}
        </div>
      </section>

     

      {serverError ? (
        <div role="alert" className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error">
          {serverError}
        </div>
      ) : null}

      {/* Success banner — visible feedback that the save round-trip
          completed. Lives above the button so a vendor whose eyes are
          on the button still catches it at the edge of their vision.
          The button itself flashes green at the same time. */}
      {savedJustNow ? (
        <div
          role="status"
          className="rounded-sm border-l-4 border-success bg-success/10 px-4 py-3 text-body-sm text-success"
        >
          Saved ✓ — your changes have been stored.
        </div>
      ) : null}

      {/* Hide the submit row entirely on a locked product — nothing in
          the form is editable any more, so a button labelled "Save"
          would just confuse the vendor. Status changes (archive/restore)
          live outside this form so they remain reachable. */}
      {!locked ? (
        <div className="flex justify-end">
          {/* States:
                - idle:   primary "Save" button
                - saving: dimmed + spinner + "Saving…" copy
                - saved:  green "Saved ✓" flash for 1.6 s
              All three states have visibly distinct colour + label so
              the operator can tell at a glance which one they're in. */}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            withArrow={!isSubmitting && !savedJustNow}
            loading={isSubmitting}
            disabled={isSubmitting || savedJustNow}
            className={
              savedJustNow
                ? "border-success bg-success text-text-inv hover:bg-success/90"
                : undefined
            }
          >
            {isSubmitting ? "Saving…" : savedJustNow ? "Saved ✓" : submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
