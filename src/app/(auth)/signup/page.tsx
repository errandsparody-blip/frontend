"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { api } from "@/lib/api-client";
import { COUNTRIES } from "@/lib/countries";
import { useApiErrorHandler } from "@/lib/errors";
import { signupSchema } from "@/lib/schemas/auth";

// Tiny helper — turn an ISO 3166-1 alpha-2 code into its regional flag emoji.
// Inlined here (vs imported) to keep the auth bundle lean — it's two lines.
function isoToFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + code.charCodeAt(0) - 65) + String.fromCodePoint(A + code.charCodeAt(1) - 65);
}

// ---------------------------------------------------------------------------
// NOTE — VENDOR-AGREEMENT CHECKBOX TEMPORARILY DISABLED
//
// The signup page used to wrap `signupSchema` with an extra
// `agreementAccepted: z.literal(true)` field and render a tick-box that gated
// form submission. That has been commented out (here + in the JSX below) so
// signup no longer requires acceptance at this step. Vendors are still bound
// to the Vendor Agreement, Terms of Service, and Privacy Policy — they
// re-accept the *versioned* document inside the portal post-KYC at
// `/legal/vendor-agreement?reaccept=1`, which writes timestamp + IP + version
// to the audit log (the legally durable record).
//
// To restore the checkbox: revert this file (the original block is preserved
// verbatim inside the `/* ... */` comments). No backend change is required
// either way — the API has never accepted `agreementAccepted` on the wire.
// ---------------------------------------------------------------------------
/*
const signupFormSchema = signupSchema.extend({
  agreementAccepted: z.literal(true, {
    errorMap: () => ({
      message: "Tick the box to confirm you accept the Vendor Agreement.",
    }),
  }),
});
type SignupFormInput = z.infer<typeof signupFormSchema>;
*/
type SignupFormInput = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();

  const form = useForm<SignupFormInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      businessName: "",
      country: "",
      // agreementAccepted: false as unknown as true,   // disabled — see note above
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  async function onSubmit(values: SignupFormInput): Promise<void> {
    clear();
    try {
      // The API schema doesn't accept `agreementAccepted`; with the checkbox
      // disabled it's no longer on the form, so we forward `values` as-is.
      // (Vendors re-accept the versioned agreement post-KYC.)
      await api.post<{ ok: true; userId: string }>("/auth/signup", values);
      // Carry the email through so the verify form can pre-fill it for the
      // POST /auth/verify-email request without making the user retype.
      router.push(`/signup/verify-email?email=${encodeURIComponent(values.email)}`);
    } catch (err) {
      handle(err);
    }
  }

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "signin") router.push("/login");
    else if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
    else if (handler === "retry") void handleSubmit(onSubmit)();
  }

  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[01] Create account</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Set up your business account.
      </h1>
      <p className="mt-3 text-body text-text-muted">
        We&apos;ll email an 8-digit code, then walk you through MFA enrollment and KYC.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-5" noValidate>
        <Field label="Business name" error={errors.businessName?.message}>
          <Input
            type="text"
            autoComplete="organization"
            invalid={!!errors.businessName}
            placeholder="Alesana Apparel"
            {...register("businessName")}
          />
        </Field>

        <Field
          label="Country"
          error={errors.country?.message}
          hint="Pick the country your business operates from."
        >
          {/*
            Native <select> — accessible, keyboard-friendly, and the OS
            picker on mobile is genuinely better than any custom dropdown.
            Option labels show the flag, dial code, ISO, and country name
            so the closed face of the select is informative even when
            truncated by narrow viewports. Underlying value is still the
            2-letter ISO code that the API expects.
          */}
          <select
            autoComplete="country"
            aria-invalid={errors.country ? true : undefined}
            className="block h-12 w-full appearance-none rounded-sm border border-line-strong bg-cream-soft px-3 pr-10 text-body text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 truncate"
            {...register("country")}
          >
            <option value="">Select a country…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {isoToFlag(c.code)} {c.dialCode} {c.code} · {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            invalid={!!errors.email}
            placeholder="vendor@example.com"
            {...register("email")}
          />
        </Field>

        <Field
          label="Password"
          error={errors.password?.message}
          hint="At least 12 characters. We check it against known data breaches."
        >
          <PasswordInput
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register("password")}
          />
        </Field>

        <ErrorBanner error={bannerError} onAction={onAction} />

        {/*
          --- Vendor-agreement consent block (temporarily disabled) ---
          Vendors are still bound by the Vendor Agreement, Terms, and Privacy
          Policy — they re-accept the versioned document post-KYC at
          /legal/vendor-agreement?reaccept=1, which is the legally durable
          signature (timestamp + IP + version written to the audit log).
          Restore by uncommenting the block below AND re-enabling the
          schema/default near the top of this file.

        <div>
          <label className="flex items-start gap-3 rounded-sm border border-line-strong bg-cream-soft p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-amber"
              aria-invalid={!!errors.agreementAccepted}
              aria-describedby={errors.agreementAccepted ? "agreement-error" : undefined}
              {...register("agreementAccepted")}
            />
            <span className="text-body-sm text-text">
              I have read and accept the{" "}
              <Link
                href="/legal/vendor-agreement"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink underline-offset-4 hover:underline"
              >
                USA Errands Vendor Agreement
              </Link>
              ,{" "}
              <Link
                href="/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink underline-offset-4 hover:underline"
              >
                Terms of Service
              </Link>
              , and{" "}
              <Link
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.agreementAccepted ? (
            <span id="agreement-error" className="mt-2 block text-caption text-error">
              {errors.agreementAccepted.message}
            </span>
          ) : null}
        </div>
        */}

        <Button type="submit" variant="primary" size="lg" withArrow loading={isSubmitting}>
          {isSubmitting ? "Creating account" : "Create account"}
        </Button>

        <div className="text-center text-body-sm text-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
