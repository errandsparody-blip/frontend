"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, setAccessToken, type ApiError } from "@/lib/api-client";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";

interface LoginAuthedResponse {
  accessToken: string;
  expiresAt: string;
  user: { id: string; email: string; mfaEnrolled: boolean };
}

interface LoginMfaResponse {
  status: "mfa_required";
  challengeToken: string;
  mfaEnrolled: boolean;
}

type LoginResponse = LoginAuthedResponse | LoginMfaResponse;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput): Promise<void> {
    setServerError(null);
    try {
      const r = await api.post<LoginResponse>("/auth/login", values);
      if ("status" in r) {
        // MFA-enrolled users go to the challenge screen.
        router.push(`/login/2fa?ct=${encodeURIComponent(r.challengeToken)}`);
        return;
      }
      // Authenticated. Two sub-cases:
      //   - mfaEnrolled === false → user has an acr="1" token. Force them to
      //     finish MFA enrollment before going anywhere else.
      //   - mfaEnrolled === true  → fully authenticated, go to dashboard.
      setAccessToken(r.accessToken);
      router.push(r.user.mfaEnrolled ? "/dashboard" : "/signup/2fa-enroll");
    } catch (err) {
      const e = err as ApiError;
      setServerError(e.message);
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
          <Input
            type="password"
            autoComplete="current-password"
            invalid={!!errors.password}
            {...register("password")}
          />
        </Field>

        {serverError ? (
          <div
            role="alert"
            className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error"
          >
            {serverError}
          </div>
        ) : null}

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
