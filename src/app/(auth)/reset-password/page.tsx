"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TotpInput } from "@/components/ui/totp-input";
import { api, type ApiError } from "@/lib/api-client";
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

  const [serverError, setServerError] = useState<string | null>(null);
  const [requireMfa, setRequireMfa] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: "", mfaCode: "" },
  });

  const mfaCode = watch("mfaCode") ?? "";

  async function onSubmit(values: ResetPasswordInput): Promise<void> {
    setServerError(null);
    try {
      await api.post<{ ok: true }>("/auth/reset-password", {
        token,
        newPassword: values.newPassword,
        mfaCode: values.mfaCode || undefined,
      });
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      const e = err as ApiError;
      if (e.code === "mfa_required") {
        setRequireMfa(true);
        setServerError("Please add your authenticator code to complete the reset.");
        return;
      }
      setServerError(e.message);
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
          <Input
            type="password"
            autoComplete="new-password"
            invalid={!!errors.newPassword}
            {...register("newPassword")}
            autoFocus
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

        {serverError ? (
          <div
            role="alert"
            className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error"
          >
            {serverError}
          </div>
        ) : null}

        <Button type="submit" variant="primary" size="lg" withArrow loading={isSubmitting}>
          {isSubmitting ? "Updating" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
