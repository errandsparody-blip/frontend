"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TotpInput } from "@/components/ui/totp-input";
import { api, setAccessToken, type ApiError } from "@/lib/api-client";

interface AuthOk {
  accessToken: string;
  expiresAt: string;
  user: { id: string; email: string };
}

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const challengeToken = params.get("ct") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function verify(submitted: string): Promise<void> {
    if (submitted.length !== 6) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.post<AuthOk>("/auth/2fa/verify", {
        challengeToken,
        code: submitted,
      });
      setAccessToken(r.accessToken);
      router.push("/dashboard");
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  if (!challengeToken) {
    return (
      <div>
        <h1 className="text-display font-medium tracking-[-0.8px] text-ink">Session expired.</h1>
        <p className="mt-3 text-body text-text-muted">
          The challenge link is missing. Please sign in again.
        </p>
        <Link href="/login" className="mt-6 inline-block">
          <Button variant="primary" withArrow>
            Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[02] Two-factor auth</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Enter your code.
      </h1>
      <p className="mt-3 text-body text-text-muted">
        Open your authenticator app and type the six-digit code. The code refreshes every 30 seconds.
      </p>

      <div className="mt-10">
        <TotpInput
          value={code}
          onChange={setCode}
          onComplete={verify}
          invalid={!!error}
          disabled={submitting}
          autoFocus
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between text-body-sm">
        <Link href={`/login/recovery?ct=${encodeURIComponent(challengeToken)}`} className="text-text-muted hover:text-ink">
          Use a recovery code instead
        </Link>
        <Link href="/login" className="text-text-muted hover:text-ink">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
