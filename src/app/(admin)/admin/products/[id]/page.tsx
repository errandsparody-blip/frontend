"use client";

/**
 * Admin override for product details.
 *
 * Vendors lock products at creation so they can't under-declare
 * weights and dodge shipping costs after the fact. The warehouse
 * weighs and measures every incoming unit — and the receiving fee
 * the vendor already paid covers that work. This page is the
 * operator's path to correct the record when physical measurements
 * differ from what the vendor declared.
 *
 * Backend: PATCH /v1/admin/products/:id. SUPER_ADMIN only.
 * Every edit writes an audit row (`product.admin_edited`) with the
 * actor id, before/after snapshots, and the operator's reason note.
 *
 * The corrected values propagate immediately to the vendor's
 * dashboard — they read from the same Product row, just with the
 * `locked: true` flag preventing them from editing it back.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StorageTier = "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE" | "PALLET";

interface AdminProduct {
  id: string;
  code: string;
  name: string;
  variant: string;
  hsCode: string | null;
  countryOfOrigin: string;
  declaredValueCents: number;
  weightOz: number;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  storageTier: StorageTier;
  imageUrl: string | null;
  status: "ACTIVE" | "ARCHIVED";
  vendorId: string;
  vendorBusinessName: string;
}

// Form schema — mirrors the backend's `adminEditProductSchema`.
// Numeric fields use `z.coerce.number()` so the `<input type="number">`
// strings become real numbers automatically.
const formSchema = z.object({
  weightOz: z.coerce.number().positive("Must be greater than 0"),
  lengthIn: z.coerce.number().positive("Must be greater than 0").optional(),
  widthIn: z.coerce.number().positive("Must be greater than 0").optional(),
  heightIn: z.coerce.number().positive("Must be greater than 0").optional(),
  declaredValueCents: z.coerce.number().int().nonnegative("Cannot be negative"),
  hsCode: z
    .string()
    .trim()
    .min(4, "HS code must be at least 4 characters")
    .max(12, "HS code must be at most 12 characters")
    .optional()
    .or(z.literal("")),
  countryOfOrigin: z
    .string()
    .trim()
    .length(2, "Use the 2-letter ISO country code (e.g. US, CN, NG)")
    .regex(/^[A-Z]{2}$/, "Use uppercase letters only"),
  storageTier: z.enum(["SMALL", "MEDIUM", "LARGE", "X_LARGE", "PALLET"]),
  reason: z
    .string()
    .trim()
    .min(3, "Add a short reason so finance can reconcile this edit later")
    .max(280, "Keep the reason under 280 characters"),
});

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminProductEditPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const { bannerError, handle, clear } = useApiErrorHandler();

  const productQ = useQuery({
    queryKey: ["admin", "product", params.id],
    queryFn: () => api.get<AdminProduct>(`/admin/products/${params.id}`),
    enabled: !!params.id,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    // Defaults are filled in from the loaded product below via reset().
    defaultValues: {
      weightOz: 0,
      declaredValueCents: 0,
      countryOfOrigin: "US",
      storageTier: "SMALL",
      reason: "",
    },
  });

  // When the product loads, prime the form with the current values so
  // the operator sees what's there before they edit.
  if (productQ.data && !form.formState.isDirty && form.getValues("weightOz") === 0) {
    const p = productQ.data;
    form.reset({
      weightOz: p.weightOz,
      lengthIn: p.lengthIn ?? undefined,
      widthIn: p.widthIn ?? undefined,
      heightIn: p.heightIn ?? undefined,
      declaredValueCents: p.declaredValueCents,
      hsCode: p.hsCode ?? "",
      countryOfOrigin: p.countryOfOrigin,
      storageTier: p.storageTier,
      reason: "",
    });
  }

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      // Only send fields that changed from the loaded product, so
      // the audit row reflects the actual diff. The backend also
      // dedups no-ops, but trimming the payload makes the audit log
      // easier to read.
      const p = productQ.data!;
      const patch: Record<string, unknown> = { reason: values.reason };
      if (values.weightOz !== p.weightOz) patch.weightOz = values.weightOz;
      if (values.lengthIn !== (p.lengthIn ?? undefined)) patch.lengthIn = values.lengthIn ?? null;
      if (values.widthIn !== (p.widthIn ?? undefined)) patch.widthIn = values.widthIn ?? null;
      if (values.heightIn !== (p.heightIn ?? undefined)) patch.heightIn = values.heightIn ?? null;
      if (values.declaredValueCents !== p.declaredValueCents)
        patch.declaredValueCents = values.declaredValueCents;
      const normalisedHs = values.hsCode?.trim() || null;
      if (normalisedHs !== p.hsCode) patch.hsCode = normalisedHs ?? undefined;
      if (values.countryOfOrigin !== p.countryOfOrigin)
        patch.countryOfOrigin = values.countryOfOrigin;
      if (values.storageTier !== p.storageTier) patch.storageTier = values.storageTier;
      return api.patch<AdminProduct>(`/admin/products/${params.id}`, patch);
    },
    onMutate: clear,
    onSuccess: async () => {
      setSavedAt(new Date().toLocaleString());
      await qc.invalidateQueries({ queryKey: ["admin", "product", params.id] });
      // Also nudge any caches the vendor side hits so the next request
      // gets fresh data — the most-likely caller is the admin SKU
      // detail page which re-derives weight/dims via the SKU's product.
      await qc.invalidateQueries({ queryKey: ["admin", "sku"] });
    },
    onError: (err) => handle(err),
  });

  if (productQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (productQ.error || !productQ.data) {
    return (
      <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">Product not found</div>
        <p className="mt-1 text-body-sm text-text">
          Confirm the id is correct or return to the inventory list.
        </p>
      </div>
    );
  }

  const p = productQ.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`[02] Catalogue / ${p.code}`}
        title={p.name}
        description={`${p.vendorBusinessName} · variant ${p.variant} · admin override`}
        actions={
          <Link
            href="/admin/inventory"
            className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back to inventory
          </Link>
        }
      />

      {/* Audit warning — the operator should know the vendor sees
          these values on their dashboard before clicking save. */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
        <div>
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
            Admin override
          </div>
          <p className="mt-1 text-body-sm text-text">
            The vendor cannot edit this product themselves. Your changes here
            apply to every future shipping quote, customs declaration, and
            storage charge based on this product, and the vendor will see the
            new values on their dashboard immediately. Every save is recorded
            in the audit log with your account and the reason you provide.
          </p>
        </div>
      </div>

      {savedAt ? (
        <div
          role="status"
          className="rounded-md border-l-4 border-success bg-success/10 px-5 py-3 text-body-sm text-text"
        >
          Saved at {savedAt}. The new values are now live for this vendor.
        </div>
      ) : null}

      <ErrorBanner error={bannerError} />

      <form
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="flex flex-col gap-6 rounded-md border border-line bg-white p-6"
      >
        {/* Weight + dimensions — the shipping-cost half. */}
        <section className="flex flex-col gap-4">
          <header>
            <h2 className="text-h3 font-semibold text-ink">Weight &amp; dimensions</h2>
            <p className="mt-1 text-body-sm text-text-muted">
              Use the warehouse-measured values. Carriers reweigh every
              parcel; if our declared values are wrong we either over-charge
              the vendor or eat the difference ourselves.
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Weight (oz)">
              <Input
                id="weightOz"
                type="number"
                step="0.1"
                min="0"
                {...form.register("weightOz")}
              />
              <Hint>
                Was <strong>{p.weightOz} oz</strong>
              </Hint>
              <FieldError msg={form.formState.errors.weightOz?.message} />
            </Field>
            <Field label="Storage tier">
              <select
                id="storageTier"
                {...form.register("storageTier")}
                className="h-11 w-full rounded-sm border border-line-strong bg-white px-3 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              >
                <option value="SMALL">Small box</option>
                <option value="MEDIUM">Medium box</option>
                <option value="LARGE">Large box</option>
                <option value="X_LARGE">Extra-large box</option>
                <option value="PALLET">Pallet</option>
              </select>
              <Hint>
                Was <strong>{p.storageTier.replace("_", "-")}</strong>
              </Hint>
              <FieldError msg={form.formState.errors.storageTier?.message} />
            </Field>
            <Field label="Length (in)">
              <Input id="lengthIn" type="number" step="0.1" min="0" {...form.register("lengthIn")} />
              <Hint>Was {p.lengthIn != null ? <strong>{p.lengthIn} in</strong> : "—"}</Hint>
              <FieldError msg={form.formState.errors.lengthIn?.message} />
            </Field>
            <Field label="Width (in)">
              <Input id="widthIn" type="number" step="0.1" min="0" {...form.register("widthIn")} />
              <Hint>Was {p.widthIn != null ? <strong>{p.widthIn} in</strong> : "—"}</Hint>
              <FieldError msg={form.formState.errors.widthIn?.message} />
            </Field>
            <Field label="Height (in)">
              <Input id="heightIn" type="number" step="0.1" min="0" {...form.register("heightIn")} />
              <Hint>Was {p.heightIn != null ? <strong>{p.heightIn} in</strong> : "—"}</Hint>
              <FieldError msg={form.formState.errors.heightIn?.message} />
            </Field>
          </div>
        </section>

        {/* Customs — declared value, HS code, country. */}
        <section className="flex flex-col gap-4 border-t border-line pt-6">
          <header>
            <h2 className="text-h3 font-semibold text-ink">Customs &amp; value</h2>
            <p className="mt-1 text-body-sm text-text-muted">
              Declared value, HS code, and country of origin are submitted on
              every customs form. Correct these when the vendor&apos;s filing
              wouldn&apos;t pass an inspection.
            </p>
          </header>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Declared value (cents)">
              <Input
                id="declaredValueCents"
                type="number"
                step="1"
                min="0"
                {...form.register("declaredValueCents")}
              />
              <Hint>
                Was <strong>${(p.declaredValueCents / 100).toFixed(2)}</strong>
              </Hint>
              <FieldError msg={form.formState.errors.declaredValueCents?.message} />
            </Field>
            <Field label="HS code">
              <Input id="hsCode" {...form.register("hsCode")} placeholder="6109.10" />
              <Hint>Was {p.hsCode ? <strong>{p.hsCode}</strong> : "—"}</Hint>
              <FieldError msg={form.formState.errors.hsCode?.message} />
            </Field>
            <Field label="Country of origin">
              <Input
                id="countryOfOrigin"
                {...form.register("countryOfOrigin")}
                placeholder="US"
                maxLength={2}
                style={{ textTransform: "uppercase" }}
              />
              <Hint>
                Was <strong>{p.countryOfOrigin}</strong>
              </Hint>
              <FieldError msg={form.formState.errors.countryOfOrigin?.message} />
            </Field>
          </div>
        </section>

        {/* Reason — required for audit. */}
        <section className="flex flex-col gap-4 border-t border-line pt-6">
          <Field label="Reason for this change">
            <textarea
              id="reason"
              rows={3}
              {...form.register("reason")}
              placeholder="e.g. Warehouse re-weighed at intake; vendor declared 8 oz but units are 12 oz."
              className="w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
            />
            <Hint>
              Recorded on the audit log so finance can reconcile if the vendor disputes a charge.
            </Hint>
            <FieldError msg={form.formState.errors.reason?.message} />
          </Field>
        </section>

        <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
          <Link
            href="/admin/inventory"
            className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            Cancel
          </Link>
          <Button type="submit" variant="primary" loading={save.isPending} withArrow>
            Save override
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny helpers — kept private to this page.
// ---------------------------------------------------------------------------

function Hint({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="mt-1 font-mono text-[11px] text-text-muted">{children}</div>;
}

function FieldError({ msg }: { msg?: string }): JSX.Element | null {
  if (!msg) return null;
  return <div className="mt-1 font-mono text-[11px] text-error">{msg}</div>;
}
