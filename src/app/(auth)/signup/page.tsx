"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import { signupSchema } from "@/lib/schemas/auth";

// Client-only extension — the API schema can't add `agreementAccepted` without
// a mirrored backend change, so we wrap signupSchema here, validate the
// checkbox, then strip the field before POSTing. The acceptance is still
// captured properly: after email + 2FA + KYC the vendor lands on
// /legal/vendor-agreement?reaccept=1 and signs the current published version,
// which records timestamp + IP + version on the audit trail.
const signupFormSchema = signupSchema.extend({
  agreementAccepted: z.literal(true, {
    errorMap: () => ({
      message: "Tick the box to confirm you accept the Vendor Agreement.",
    }),
  }),
});
type SignupFormInput = z.infer<typeof signupFormSchema>;

export default function SignupPage() {
  const router = useRouter();

  const form = useForm<SignupFormInput>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      email: "",
      password: "",
      businessName: "",
      country: "",
      agreementAccepted: false as unknown as true,
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
      // Strip the client-only consent field before sending — the API schema
      // doesn't accept it. The vendor formally re-accepts the versioned
      // agreement after KYC via /legal/vendor-agreement.
      const { agreementAccepted: _ignored, ...payload } = values;
      void _ignored;
      await api.post<{ ok: true; userId: string }>("/auth/signup", payload);
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
        We&apos;ll email a 6-digit code, then walk you through MFA enrollment and KYC.
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

        <Field label="Country (ISO code)" error={errors.country?.message} hint="Two letters: NG, GB, US.">
          <Input
            type="text"
            autoComplete="country"
            maxLength={2}
            invalid={!!errors.country}
            placeholder="NG"
            {...register("country")}
          />
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
