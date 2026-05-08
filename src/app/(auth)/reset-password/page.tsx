"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { TotpInput } from "@/components/ui/totp-input";
import { api } from "@/lib/api-client";
import { useApiErrorHandler, type NormalizedError } from "@/lib/errors";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/schemas/auth";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [requireMfa, setRequireMfa] = useState(false);
  const [done, setDone] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: "", mfaCode: "" },
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const mfaCode = watch("mfaCode") ?? "";

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  async function onSubmit(values: ResetPasswordInput): Promise<void> {
    clear();
    try {
      await api.post<{ ok: true }>("/auth/reset-password", {
        token,
        newPassword: values.newPassword,
        mfaCode: values.mfaCode || undefined,
      });
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      const n: NormalizedError = handle(err);
      // Special case: mfa_required toggles a UI mode (reveal MFA field).
      // The catalog still renders the title/body in the banner.
      if (n.code === "mfa_required") {
        setRequireMfa(true);
      }
    }
  }

  if (!token) {
    return (
      <div>
        <h1 className="text-display font-medium tracking-[-0.8px] text-ink">Reset link invalid.</h1>
        <p className="mt-3 text-body text-text-muted">
          The link is missing its token. Request a fresh reset email.
        </p>
        <Link href="/forgot-password" className="mt-6 inline-block">
          <Button variant="primary" withArrow>
            Request new link
          </Button>
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <h1 className="text-display font-medium tracking-[-0.8px] text-ink">Password updated.</h1>
        <p className="mt-3 text-body text-text-muted">
          All previous sessions were revoked. Redirecting you to sign in…
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[02] Set new password</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Choose a new password.
      </h1>
      <p className="mt-3 text-body text-text-muted">
        At least 12 characters. We check it against known data breaches before accepting it.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-5" noValidate>
        <input type="hidden" {...register("token")} value={token} />

        <Field label="New password" error={errors.newPassword?.message}>
          <PasswordInput
            autoComplete="new-password"
            invalid={!!errors.newPassword}
            {...register("newPassword")}
          />
        </Field>

        {requireMfa ? (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[1.4px] text-text-muted">
              Authenticator code
            </span>
            <TotpInput
              value={mfaCode}
              onChange={(v) => setValue("mfaCode", v, { shouldValidate: true })}
              invalid={!!errors.mfaCode}
            />
            {errors.mfaCode ? (
              <span className="text-caption text-error">{errors.mfaCode.message}</span>
            ) : null}
          </div>
        ) : null}

        <ErrorBanner
          error={bannerError}
          onAction={(handler) => {
            if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
          }}
        />

        <Button type="submit" variant="primary" size="lg" withArrow loading={isSubmitting}>
          {isSubmitting ? "Updating" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
