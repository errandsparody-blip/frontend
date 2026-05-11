/**
 * Email verification — code form. The user lands here after signup with the
 * email address carried in the URL (?email=...). The 6-digit code arrives by
 * email; they type it into this form and we POST it back to the API.
 *
 * On success, redirect to /login?verified=1 — the user signs in fresh, and
 * the post-login flow handles MFA enrollment. We don't enroll MFA here for
 * security reasons (don't tie security state to a session that just clicked
 * an email link / typed a code from email).
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TotpInput } from "@/components/ui/totp-input";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import { verifyEmailSchema, type VerifyEmailInput } from "@/lib/schemas/auth";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialEmail = params.get("email") ?? "";

  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resending, setResending] = useState(false);

  const form = useForm<VerifyEmailInput>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { email: initialEmail, code: "" },
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const email = watch("email");
  const code = watch("code") ?? "";

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  async function onSubmit(values: VerifyEmailInput): Promise<void> {
    clear();
    try {
      // noRefresh: this is unauthenticated. A 4xx must NOT trigger the
      // api-client's auto-refresh dance.
      await api.post<{ ok: true }>(
        "/auth/verify-email",
        values,
        { noRefresh: true },
      );
      router.push("/login?verified=1");
    } catch (err) {
      handle(err);
      // verify_invalid is catalog-tagged surface=inline+field=code, but the
      // user also benefits from clearing the input so they can retype the
      // freshest code from the new email.
      setValue("code", "", { shouldValidate: false });
    }
  }

  async function onResend(): Promise<void> {
    if (!email) {
      setResendStatus("error");
      return;
    }
    setResending(true);
    setResendStatus("sending");
    try {
      // noRefresh: same reason as above — unauthenticated endpoint.
      await api.post<{ ok: true }>(
        "/auth/resend-verify-email",
        { email },
        { noRefresh: true },
      );
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[02] Verify email</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Check your inbox.
      </h1>
      <p className="mt-3 text-body text-text-muted">
        We sent a 6-digit code to{" "}
        {initialEmail ? (
          <strong className="text-ink">{initialEmail}</strong>
        ) : (
          "your email"
        )}
        . Enter it below to activate your account. The code expires in 15 minutes.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-5" noValidate>
        {!initialEmail ? (
          <Field label="Email" error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              invalid={!!errors.email}
              placeholder="vendor@example.com"
              {...register("email")}
            />
          </Field>
        ) : (
          <input type="hidden" {...register("email")} value={initialEmail} />
        )}

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[1.4px] text-text-muted">
            Verification code
          </span>
          <TotpInput
            value={code}
            onChange={(v) => setValue("code", v, { shouldValidate: true })}
            invalid={!!errors.code}
          />
          {errors.code ? (
            <span className="text-caption text-error">{errors.code.message}</span>
          ) : null}
        </div>

        <ErrorBanner
          error={bannerError}
          onAction={(handler) => {
            if (handler === "verifyEmail") void onResend();
            else if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
          }}
        />


        <Button
          type="submit"
          variant="primary"
          size="lg"
          withArrow
          loading={isSubmitting}
          disabled={code.length !== 6}
        >
          {isSubmitting ? "Verifying" : "Verify email"}
        </Button>

        <div className="text-center text-body-sm text-text-muted">
          Didn&apos;t get the code?{" "}
          <button
            type="button"
            onClick={onResend}
            disabled={resending || resendStatus === "sent"}
            className="text-ink underline-offset-4 hover:underline disabled:opacity-60 disabled:no-underline"
          >
            {resendStatus === "sent"
              ? "Sent — check your inbox"
              : resending
                ? "Sending…"
                : "Resend code"}
          </button>
          {resendStatus === "error" ? (
            <span className="block mt-1 text-error">
              Couldn&apos;t resend right now. Wait a minute and try again.
            </span>
          ) : null}
        </div>

        <div className="text-center text-body-sm text-text-muted">
          Already verified?{" "}
          <Link href="/login" className="text-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
      </form>

      <ol className="mt-12 flex flex-col gap-3 border-t border-line pt-6">
        {[
          ["01", "Verify email", "Enter the code"],
          ["02", "Set up MFA", "Authenticator app or recovery codes"],
          ["03", "Submit KYC", "Government ID + business reg."],
          ["04", "Accept agreement", "Vendor terms + wallet T&Cs"],
        ].map(([n, title, sub]) => (
          <li key={n} className="flex items-baseline gap-4">
            <span className="font-mono text-mono-label text-text-subtle">{n}</span>
            <div>
              <div className="font-medium text-text">{title}</div>
              <div className="text-body-sm text-text-muted">{sub}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
