"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { api } from "@/lib/api-client";
import { homeForRole, useAuth, type AuthUser } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";

interface LoginAuthedResponse {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

interface LoginMfaResponse {
  status: "mfa_required";
  challengeToken: string;
  mfaEnrolled: boolean;
}

type LoginResponse = LoginAuthedResponse | LoginMfaResponse;

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  async function onSubmit(values: LoginInput): Promise<void> {
    clear();
    try {
      const r = await api.post<LoginResponse>("/auth/login", values);
      if ("status" in r) {
        // MFA-enrolled users go to the challenge screen.
        router.push(`/login/2fa?ct=${encodeURIComponent(r.challengeToken)}`);
        return;
      }
      // Authenticated.
      //   - mfaEnrolled === false → low-privilege acr="1" token; force MFA enrollment.
      //   - mfaEnrolled === true  → role-appropriate home.
      // Plant the session so the destination layout sees user !== null on mount.
      setSession({ accessToken: r.accessToken, user: r.user });
      router.push(r.user.mfaEnrolled ? homeForRole(r.user) : "/signup/2fa-enroll");
    } catch (err) {
      handle(err);
    }
  }

  // Map handler keys the catalog might emit to actual page-level callbacks.
  // The login page knows how to do "Forgot password" and "Resend verification";
  // anything else falls through and renders without a button.
  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "verifyEmail") {
      router.push("/signup/verify-email");
    } else if (handler === "support") {
      window.location.href = "mailto:support@usa-errands.com";
    } else if (handler === "retry") {
      // Re-submit with the current form state.
      void handleSubmit(onSubmit)();
    }
  }

  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[01] Sign in</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">Welcome back.</h1>
      <p className="mt-3 text-body text-text-muted">
        Use the email and password you signed up with. We&apos;ll prompt for your authenticator code next.
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

        <Field label="Password" error={errors.password?.message}>
          <PasswordInput
            autoComplete="current-password"
            invalid={!!errors.password}
            {...register("password")}
          />
        </Field>

        <ErrorBanner error={bannerError} onAction={onAction} />

        <Button type="submit" variant="primary" size="lg" withArrow loading={isSubmitting}>
          {isSubmitting ? "Signing in" : "Sign in"}
        </Button>

        <div className="flex items-center justify-between text-body-sm">
          <Link href="/forgot-password" className="text-text-muted hover:text-ink">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-text-muted hover:text-ink">
            Create an account →
          </Link>
        </div>
      </form>
    </div>
  );
}
