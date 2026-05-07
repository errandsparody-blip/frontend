"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { api, type ApiError } from "@/lib/api-client";

const acceptSchema = z
  .object({
    password: z
      .string()
      .min(12, "At least 12 characters.")
      .max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
type AcceptInput = z.infer<typeof acceptSchema>;

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  );
}

function AcceptInviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInput>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const mut = useMutation({
    mutationFn: (input: AcceptInput) =>
      api.post<{ userId: string; email: string }>("/auth/invitations/accept", {
        token,
        password: input.password,
      }),
    onSuccess: (r) => {
      setSubmitError(null);
      setSuccess({ email: r.email });
      // Bounce to login after a moment.
      setTimeout(() => router.push("/login"), 2000);
    },
    onError: (err) => setSubmitError((err as ApiError).message ?? "Failed to accept invitation."),
  });

  if (!token) {
    return (
      <div className="mx-auto max-w-md rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
        This invite link is missing the token. Ask your teammate to re-send the invitation.
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="rounded-md border-l-4 border-success bg-success/10 px-5 py-4">
          <div className="font-mono text-mono-label uppercase text-success">Invitation accepted</div>
          <p className="mt-1 text-body-sm text-text">
            Welcome, <span className="font-medium">{success.email}</span>. You&apos;ll be redirected to sign in
            and enrol two-factor authentication.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[01] Accept invitation</div>
        <h1 className="mt-2 text-h1 font-semibold tracking-[-0.4px] text-ink">Set your password</h1>
        <p className="mt-2 text-body-sm text-text-muted">
          You&apos;ve been invited to join a USA Errands account. Set a password to finish — you&apos;ll enrol two-factor
          authentication on your first sign-in.
        </p>
      </div>

      <form
        onSubmit={handleSubmit((v) => mut.mutate(v))}
        className="flex flex-col gap-4 rounded-md border border-line bg-white p-8"
        noValidate
      >
        <Field
          label="Password"
          error={errors.password?.message}
          hint="At least 12 characters. We block known-breached passwords automatically."
        >
          <PasswordInput
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register("password")}
          />
        </Field>
        <Field label="Confirm password" error={errors.confirmPassword?.message}>
          <PasswordInput
            autoComplete="new-password"
            invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
        </Field>

        {submitError ? (
          <div role="alert" className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-2 text-body-sm text-error">
            {submitError}
          </div>
        ) : null}

        <Button type="submit" variant="amber" size="lg" withArrow loading={isSubmitting || mut.isPending}>
          Accept and continue
        </Button>
      </form>
    </div>
  );
}
