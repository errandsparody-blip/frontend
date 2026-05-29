"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { TotpInput } from "@/components/ui/totp-input";
import { api } from "@/lib/api-client";
import { homeForRole, useAuth, type AuthUser } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";

interface AuthOk {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

export default function TwoFactorVerifyPage() {
  return (
    <Suspense fallback={null}>
      <TwoFactorVerifyInner />
    </Suspense>
  );
}

function TwoFactorVerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();
  const challengeToken = params.get("ct") ?? "";

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // No react-hook-form here — the TotpInput is custom — so we pass undefined.
  // mfa_invalid is catalog-tagged surface=inline+field=code, but without a
  // form context the hook still surfaces it through the banner channel.
  const { bannerError, handle, clear } = useApiErrorHandler();

  async function verify(submitted: string): Promise<void> {
    if (submitted.length !== 6) return;
    setSubmitting(true);
    clear();
    try {
      const r = await api.post<AuthOk>("/auth/2fa/verify", {
        challengeToken,
        code: submitted,
      });
      // Plant the session into AuthContext BEFORE navigating. Otherwise
      // the destination layout renders with `user === null` (since the
      // initial /auth/refresh ran before we had any cookie) and immediately
      // bounces back to /login.
      setSession({ accessToken: r.accessToken, user: r.user });
      router.push(homeForRole(r.user));
    } catch (err) {
      handle(err);
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "signin") router.push("/login");
    else if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
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
      <div className="font-mono text-mono-eyebrow uppercase text-amber"> Two-factor auth</div>
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
          invalid={!!bannerError}
          disabled={submitting}
        />
      </div>

      <div className="mt-6">
        <ErrorBanner error={bannerError} onAction={onAction} />
      </div>

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
