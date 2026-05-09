"use client";

/**
 * Public Personal Shopper intake page.
 *
 * Anyone with the URL can submit — no account required. Submission:
 *   1. Validates locally with Zod (cents, URL shape, length caps).
 *   2. POSTs /v1/shopper which creates the request, mints a magic-link
 *      token, and returns a Stripe Checkout URL.
 *   3. Redirects the buyer to Stripe Checkout for the upfront payment.
 *
 * Address is intentionally optional at intake — the admin captures it in
 * the chat thread if missing. We don't want a busy form to be the reason
 * the buyer bounces.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import {
  createShopperRequestSchema,
  type CreateShopperRequestInput,
  type CreateShopperRequestResponse,
} from "@/lib/schemas/shopper";

// Form-level shape: dollar inputs convert to cents on submit. We never let
// the user type cents directly — UI mismatch with retail prices is a
// tested cause of buyer drop-off.
type LineFormShape = {
  productUrl: string;
  productNotes?: string;
  quantity: number;
  estimatedUnitPriceDollars: number;
};

type FormShape = {
  buyerEmail: string;
  buyerName?: string;
  lines: LineFormShape[];
  initialMessage?: string;
  // Address fields kept flat for simpler form binding; we re-nest on submit.
  shipToggle: boolean;
  recipientName?: string;
  recipientPhone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

const DEFAULT_LINE: LineFormShape = {
  productUrl: "",
  productNotes: "",
  quantity: 1,
  estimatedUnitPriceDollars: 0,
};

export default function ShopperIntakePage(): JSX.Element {
  const [confirming, setConfirming] = useState(false);

  const form = useForm<FormShape>({
    defaultValues: {
      buyerEmail: "",
      buyerName: "",
      lines: [{ ...DEFAULT_LINE }],
      initialMessage: "",
      shipToggle: false,
      country: "US",
    },
    // We don't apply zodResolver directly to FormShape because the form has
    // dollar-denominated prices + a flat address block. Validation runs
    // through the wire schema in onSubmit instead — clearer for the reader
    // and lets us surface mapped errors in the right input.
  });
  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const { bannerError, handle, clear } = useApiErrorHandler(form);
  const showShipping = watch("shipToggle");
  const lines = watch("lines");

  // Live total — pure UI hint; backend recomputes authoritatively.
  const itemsTotalCents = lines.reduce((sum, line) => {
    const qty = Number(line.quantity ?? 0);
    const cents = Math.round(Number(line.estimatedUnitPriceDollars ?? 0) * 100);
    if (!Number.isFinite(qty) || !Number.isFinite(cents) || qty <= 0 || cents <= 0) return sum;
    return sum + qty * cents;
  }, 0);

  const mutate = useMutation({
    mutationFn: (payload: CreateShopperRequestInput) =>
      api.post<CreateShopperRequestResponse>("/shopper", payload),
    onSuccess: (data) => {
      // The Stripe-hosted Checkout URL is opaque to us — we don't sniff it.
      // We DO refuse to navigate to anything that's not https:// to defend
      // against a misconfigured backend or man-in-the-middle from leaking
      // credentials.
      if (typeof window !== "undefined" && data.payUrl.startsWith("https://")) {
        window.location.assign(data.payUrl);
      }
    },
    onError: (err) => handle(err),
  });

  async function onSubmit(values: FormShape): Promise<void> {
    clear();
    setConfirming(false);

    // Convert dollars → cents for each line.
    const linesCents = values.lines.map((line) => ({
      productUrl: line.productUrl,
      productNotes: line.productNotes && line.productNotes.length > 0 ? line.productNotes : undefined,
      quantity: Number(line.quantity),
      estimatedUnitPriceCents: Math.round(Number(line.estimatedUnitPriceDollars) * 100),
    }));

    // Build a wire-shape payload then validate with the shared schema.
    const payload: Partial<CreateShopperRequestInput> = {
      buyerEmail: values.buyerEmail,
      buyerName: values.buyerName?.trim() ? values.buyerName.trim() : undefined,
      lines: linesCents,
      initialMessage:
        values.initialMessage?.trim() && values.initialMessage.trim().length > 0
          ? values.initialMessage.trim()
          : undefined,
    };
    if (values.shipToggle) {
      payload.shippingAddress = {
        recipientName: values.recipientName ?? "",
        recipientPhone: values.recipientPhone || undefined,
        line1: values.line1 ?? "",
        line2: values.line2 || undefined,
        city: values.city ?? "",
        state: (values.state ?? "").toUpperCase(),
        postalCode: values.postalCode ?? "",
        country: (values.country ?? "US").toUpperCase(),
      };
    }

    const parsed = createShopperRequestSchema.safeParse(payload);
    if (!parsed.success) {
      // Surface the FIRST issue per path next to the input it belongs to.
      // We flatten dotted paths back to the form's flat field names where
      // they differ (shippingAddress.* → flat).
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        const flat = path
          .replace(/^shippingAddress\./, "")
          .replace(/^lines\.(\d+)\.estimatedUnitPriceCents$/, "lines.$1.estimatedUnitPriceDollars");
        setError(flat as never, { type: "manual", message: issue.message });
      }
      return;
    }

    mutate.mutate(parsed.data);
  }

  return (
    <div className="mx-auto max-w-[64rem] px-8 py-12">
      <PageHeader
        eyebrow="[ Personal shopper ]"
        title="Buy from any U.S. store"
        description="Paste the product link, pay an estimate up front, and we ship to you. Final price reconciled after we buy."
      />

      {bannerError ? (
        <div className="mt-6">
          <ErrorBanner
            error={bannerError}
            onAction={(handler) => {
              if (handler === "support") {
                window.location.href = "mailto:support@usa-errands.com";
              } else if (handler === "retry") {
                clear();
              }
            }}
          />
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-8" noValidate>
        {/* Buyer */}
        <section className="rounded-md border border-line bg-white p-8">
          <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">You</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Email" error={errors.buyerEmail?.message}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register("buyerEmail", { required: "Required." })}
              />
            </Field>
            <Field label="Name (optional)" error={errors.buyerName?.message}>
              <Input
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                {...register("buyerName")}
              />
            </Field>
          </div>
        </section>

        {/* Lines */}
        <section className="rounded-md border border-line bg-white p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-mono-label uppercase text-text-muted">Items</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ ...DEFAULT_LINE })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add item
            </Button>
          </div>

          <div className="flex flex-col gap-5">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-4 rounded-sm border border-line bg-cream-soft p-5 md:grid-cols-[2fr_80px_140px_auto]"
              >
                <Field
                  label={`Item ${index + 1} URL`}
                  error={errors.lines?.[index]?.productUrl?.message}
                >
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://www.target.com/p/…"
                    {...register(`lines.${index}.productUrl`, { required: "Required." })}
                  />
                </Field>
                <Field
                  label="Qty"
                  error={errors.lines?.[index]?.quantity?.message}
                >
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                  />
                </Field>
                <Field
                  label="Est. unit price ($)"
                  error={errors.lines?.[index]?.estimatedUnitPriceDollars?.message}
                >
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    {...register(`lines.${index}.estimatedUnitPriceDollars`, {
                      valueAsNumber: true,
                    })}
                  />
                </Field>
                <div className="flex items-end justify-end">
                  {fields.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="flex h-9 w-9 items-center justify-center rounded-sm text-text-muted hover:bg-error/10 hover:text-error"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="md:col-span-4">
                  <Field
                    label="Notes (size, color, model — optional)"
                    error={errors.lines?.[index]?.productNotes?.message}
                  >
                    <Input
                      type="text"
                      placeholder="size M, black"
                      {...register(`lines.${index}.productNotes`)}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-mono text-mono-label uppercase text-text-muted">
              Items estimate
            </span>
            <span className="font-mono text-h2 tabular-nums">
              ${(itemsTotalCents / 100).toFixed(2)}
            </span>
          </div>
        </section>

        {/* Shipping (optional) */}
        <section className="rounded-md border border-line bg-white p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-mono-label uppercase text-text-muted">
              Shipping address
            </h2>
            <label className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                {...register("shipToggle")}
                className="h-4 w-4 accent-amber"
              />
              Add now (otherwise we&apos;ll ask in chat)
            </label>
          </div>
          {showShipping ? (
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Recipient name" error={errors.recipientName?.message}>
                <Input type="text" autoComplete="name" {...register("recipientName")} />
              </Field>
              <Field label="Phone (optional)" error={errors.recipientPhone?.message}>
                <Input type="tel" autoComplete="tel" {...register("recipientPhone")} />
              </Field>
              <Field label="Address line 1" error={errors.line1?.message}>
                <Input type="text" autoComplete="address-line1" {...register("line1")} />
              </Field>
              <Field label="Line 2 (optional)" error={errors.line2?.message}>
                <Input type="text" autoComplete="address-line2" {...register("line2")} />
              </Field>
              <Field label="City" error={errors.city?.message}>
                <Input type="text" autoComplete="address-level2" {...register("city")} />
              </Field>
              <Field label="State (2-letter)" error={errors.state?.message}>
                <Input
                  type="text"
                  maxLength={2}
                  autoComplete="address-level1"
                  {...register("state")}
                />
              </Field>
              <Field label="Postal code" error={errors.postalCode?.message}>
                <Input type="text" autoComplete="postal-code" {...register("postalCode")} />
              </Field>
              <Field label="Country (2-letter)" error={errors.country?.message}>
                <Input type="text" maxLength={2} {...register("country")} />
              </Field>
            </div>
          ) : null}
        </section>

        {/* Initial message */}
        <section className="rounded-md border border-line bg-white p-8">
          <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">
            Anything else? (optional)
          </h2>
          <textarea
            rows={3}
            maxLength={5000}
            placeholder="Special instructions, gift wrap, time sensitivity…"
            className="w-full rounded-sm border border-line-strong bg-cream-soft px-4 py-3 text-body text-text outline-none placeholder:text-text-subtle focus:border-ink focus:ring-2 focus:ring-ink/10"
            {...register("initialMessage")}
          />
        </section>

        {/* Confirm + submit */}
        <section className="rounded-md border border-line bg-cream-soft p-6">
          <p className="text-body-sm text-text-muted">
            You&apos;ll be redirected to Stripe to pay <strong>${(itemsTotalCents / 100).toFixed(2)} + service fee</strong>{" "}
            up front. After we procure your items we&apos;ll either invoice the actual difference + shipping, or
            refund you. By submitting, you agree to our{" "}
            <Link href="/legal/terms" className="underline">
              Terms
            </Link>
            .
          </p>

          {/* Set the recovery expectation up front so a buyer who closes
              the tab knows exactly what to do. The thread has no password —
              the only way back is the magic-link email or a saved bookmark
              of the thread URL. */}
          <div className="mt-4 rounded-sm border border-amber/40 bg-amber/10 px-4 py-3 text-body-sm text-text">
            <strong className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
              How to come back
            </strong>
            <p className="mt-1">
              We&apos;ll email a private link to <strong>your address above</strong>. That email
              (and every later one we send you) is the only way back to your conversation —
              there&apos;s no password and no login. Bookmark the page when it loads, and keep
              the email so you can return any time.
            </p>
          </div>

          <label className="mt-4 flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              checked={confirming}
              onChange={(e) => setConfirming(e.target.checked)}
              className="h-4 w-4 accent-amber"
            />
            I understand and agree.
          </label>
          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              variant="amber"
              size="lg"
              withArrow
              disabled={!confirming || mutate.isPending || itemsTotalCents <= 0}
              loading={mutate.isPending}
            >
              {mutate.isPending ? "Redirecting…" : "Continue to payment"}
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
