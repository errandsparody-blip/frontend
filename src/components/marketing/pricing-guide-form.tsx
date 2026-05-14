"use client";

/**
 * Pricing-guide lead-capture form.
 *
 * Renders the "Get Our Full Price Guide" dark-themed panel on the
 * /pricing page. POSTs to `/v1/marketing/pricing-guide` which:
 *   1. Stores the lead in the pricing_guide_leads table
 *   2. Emails the visitor the PDF (attached) within a couple of seconds
 *
 * Endpoint always returns 200 OK to avoid user-enumeration. The form
 * shows a success state on response and never reveals whether the
 * email actually delivered — that's intentional. If the visitor
 * doesn't see the email in ~5 minutes the support email link gets
 * them help.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, FileText, Check } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { COUNTRIES } from "@/lib/countries";

// The form schema mirrors the API's Zod schema. Kept in sync by
// convention; if the API tightens validation the API still wins (the
// server-side schema is the source of truth).
const formSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Please enter your business name.")
    .max(120, "Business name is too long."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(200, "Email is too long."),
  country: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "Pick your country from the list."),
});
type FormInput = z.infer<typeof formSchema>;

/**
 * Resolve the API base URL. We use the SAME env var as the rest of
 * the app (`NEXT_PUBLIC_API_BASE_URL`, defined in `lib/api-client.ts`).
 * That var ALREADY includes the `/v1` prefix, so callers append only
 * the rest of the path. Falls back to the local dev API so this
 * component is testable without env vars.
 *
 * Without the matching env var on Vercel the previous wiring resolved
 * to an empty string and `fetch("/v1/...")` hit the marketing domain
 * — Vercel returned 404 and the form showed a generic error.
 */
function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1";
}

export function PricingGuideForm(): JSX.Element {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { businessName: "", email: "", country: "" },
  });

  async function onSubmit(values: FormInput): Promise<void> {
    setServerError(null);
    try {
      // NEXT_PUBLIC_API_BASE_URL already ends with /v1, so the path here
      // is just /marketing/pricing-guide (no double /v1 prefix).
      const res = await fetch(`${getApiBase()}/marketing/pricing-guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        // Rate-limit (429) is the most likely non-2xx here.
        if (res.status === 429) {
          setServerError(
            "Too many requests from this network. Wait a few minutes and try again.",
          );
        } else {
          setServerError("Something went wrong. Please try again or email us directly.");
        }
        return;
      }
      setSubmitted(true);
    } catch {
      setServerError(
        "Couldn't reach our server. Check your connection and try again.",
      );
    }
  }

  if (submitted) {
    return (
      <section className="rounded-md border border-line bg-ink p-8 text-text-inv md:p-10">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber/40 bg-amber/10 text-amber">
            <Check className="h-7 w-7" aria-hidden />
          </div>
          <h3 className="mt-5 text-h3 font-semibold leading-tight text-text-inv">
            Check your inbox
          </h3>
          <p className="mt-3 text-body text-text-inv/75">
            We&apos;ve sent the full pricing guide as a PDF attachment.
            It should land within a minute or two — give your spam
            folder a glance if you don&apos;t see it.
          </p>
          <p className="mt-4 text-body-sm text-text-inv/60">
            Questions? Reply to the email or write to{" "}
            <a
              href="mailto:hello@myusaerrands.com"
              className="text-amber underline-offset-4 hover:underline"
            >
              hello@myusaerrands.com
            </a>
            .
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-line bg-ink p-6 text-text-inv md:p-10">
      <div className="mx-auto max-w-md">
        {/* Icon + headline — mirrors the screenshot composition: file-with-$
            glyph centred, "Get Our Full Price Guide" with "Full" in gold. */}
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-amber/40 bg-ink text-amber">
            <FileText className="h-7 w-7" aria-hidden />
          </div>
        </div>
        <h2 className="mt-5 text-center text-h2 font-semibold leading-tight tracking-[-0.3px] text-text-inv">
          Get Our <span className="text-amber">Full</span>
          <br />
          Price Guide
        </h2>
        <p className="mt-4 text-center text-body text-text-inv/65">
          Enter your details below and we&apos;ll email you our complete pricing guide.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 flex flex-col gap-5">
          {/* Business name */}
          <div>
            <label
              htmlFor="pgf-business"
              className="block text-body-sm font-semibold text-text-inv"
            >
              Business Name <span className="text-amber">*</span>
            </label>
            <input
              id="pgf-business"
              type="text"
              autoComplete="organization"
              placeholder="Your business name"
              className="mt-2 block h-12 w-full rounded-md border border-text-inv/15 bg-transparent px-4 text-body text-text-inv placeholder:text-text-inv/40 focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/30"
              aria-invalid={errors.businessName ? true : undefined}
              {...register("businessName")}
            />
            {errors.businessName ? (
              <p className="mt-1 text-caption text-error">{errors.businessName.message}</p>
            ) : null}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="pgf-email"
              className="block text-body-sm font-semibold text-text-inv"
            >
              Email Address <span className="text-amber">*</span>
            </label>
            <input
              id="pgf-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-2 block h-12 w-full rounded-md border border-text-inv/15 bg-transparent px-4 text-body text-text-inv placeholder:text-text-inv/40 focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/30"
              aria-invalid={errors.email ? true : undefined}
              {...register("email")}
            />
            {errors.email ? (
              <p className="mt-1 text-caption text-error">{errors.email.message}</p>
            ) : null}
          </div>

          {/* Country */}
          <div>
            <label
              htmlFor="pgf-country"
              className="block text-body-sm font-semibold text-text-inv"
            >
              Country <span className="text-amber">*</span>
            </label>
            <select
              id="pgf-country"
              autoComplete="country"
              defaultValue=""
              className="mt-2 block h-12 w-full appearance-none rounded-md border border-text-inv/15 bg-transparent bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke-width%3D%221.5%22%20stroke%3D%22%23C99428%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22M19.5%208.25l-7.5%207.5-7.5-7.5%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px_20px] bg-[right_12px_center] bg-no-repeat px-4 pr-12 text-body text-text-inv focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/30"
              aria-invalid={errors.country ? true : undefined}
              {...register("country")}
            >
              <option value="" className="bg-ink text-text-inv/40">
                Select your country
              </option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-ink text-text-inv">
                  {c.name}
                </option>
              ))}
            </select>
            {errors.country ? (
              <p className="mt-1 text-caption text-error">{errors.country.message}</p>
            ) : null}
          </div>

          {serverError ? (
            <div
              role="alert"
              className="rounded-md border-l-4 border-error bg-error/15 px-3 py-2 text-body-sm text-text-inv"
            >
              {serverError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-amber text-body font-semibold text-ink transition-colors hover:bg-amber-hi disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Sending…" : "Send Me the Price Guide"}
          </button>

          <div className="mt-2 flex items-center justify-center gap-2 text-caption text-text-inv/55">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
            Your information is secure and will not be shared.
          </div>
        </form>
      </div>
    </section>
  );
}
