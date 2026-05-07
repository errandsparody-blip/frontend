"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, type ApiError } from "@/lib/api-client";
import { signupSchema, type SignupInput } from "@/lib/schemas/auth";

export default function SignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", businessName: "", country: "" },
  });

  async function onSubmit(values: SignupInput): Promise<void> {
    setServerError(null);
    try {
      await api.post<{ ok: true; userId: string }>("/auth/signup", values);
      router.push("/signup/verify-email");
    } catch (err) {
      const e = err as ApiError;
      setServerError(e.message);
    }
  }

  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[01] Create account</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Set up your business account.
      </h1>
      <p className="mt-3 text-body text-text-muted">
        We'll email a verification link, then walk you through MFA enrollment and KYC.
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
          <Input
            type="password"
            autoComplete="new-password"
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
