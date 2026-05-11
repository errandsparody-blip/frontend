"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/schemas/auth";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  async function onSubmit(values: ForgotPasswordInput): Promise<void> {
    clear();
    try {
      await api.post<{ ok: true }>("/auth/forgot-password", values);
      setSubmitted(true);
    } catch (err) {
      handle(err);
    }
  }

  if (submitted) {
    return (
      <div>
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[01] Reset password</div>
        <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">Check your email.</h1>
        <p className="mt-3 text-body text-text-muted">
          If an account exists for that email, we&apos;ve sent a reset link. The link is valid for one hour.
        </p>
        <Link href="/login" className="mt-8 inline-block">
          <Button variant="outline">← Back to sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[01] Reset password</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Forgot your password?
      </h1>
      <p className="mt-3 text-body text-text-muted">
        Enter the email you signed up with. We&apos;ll send a single-use link to set a new password.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-5" noValidate>
        <Field label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            invalid={!!errors.email}
            placeholder="vendor@example.com"
            {...register("email")}
          />
        </Field>

        <ErrorBanner
          error={bannerError}
          onAction={(handler) => {
            if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
          }}
        />

        <Button type="submit" variant="primary" size="lg" withArrow loading={isSubmitting}>
          {isSubmitting ? "Sending link" : "Send reset link"}
        </Button>

        <Link href="/login" className="text-center text-body-sm text-text-muted hover:text-ink">
          ← Back to sign in
        </Link>
      </form>
    </div>
  );
}
