"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { homeForRole, useAuth, type AuthUser } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";

interface AuthOk {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

// A recovery code is four groups of four chars joined by dashes, e.g.
// abcd-efgh-jkmn-pqrs. We accept it in any case and with surrounding
// whitespace; the backend normalizes before matching.
const RECOVERY_RE = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i;

export default function RecoveryPage() {
  return (
    <Suspense fallback={null}>
      <RecoveryInner />
    </Suspense>
  );
}

function RecoveryInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();
  const challengeToken = params.get("ct") ?? "";

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { bannerError, handle, clear } = useApiErrorHandler();

  const normalized = code.trim().toLowerCase();
  const valid = RECOVERY_RE.test(normalized);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    clear();
    try {
      const r = await api.post<AuthOk>("/auth/2fa/recovery", {
        challengeToken,
        recoveryCode: normalized,
      });
      // Plant the session BEFORE navigating so the destination layout doesn't
      // render with a null user and bounce back to /login.
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
      <div className="font-mono text-mono-eyebrow uppercase text-amber"> Recovery code</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Use a recovery code.
      </h1>
      <p className="mt-3 text-body text-text-muted">
        Enter one of the recovery codes you saved when you set up two-factor
        authentication. Each code works once.
      </p>

      <form onSubmit={submit} className="mt-10 flex flex-col gap-4">
        <Input
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="abcd-efgh-jkmn-pqrs"
          aria-label="Recovery code"
          value={code}
          invalid={!!bannerError}
          disabled={submitting}
          onChange={(e) => setCode(e.target.value)}
          className="font-mono tracking-[1px]"
        />

        <Button type="submit" variant="primary" withArrow disabled={!valid || submitting} loading={submitting}>
          {submitting ? "Verifying…" : "Verify"}
        </Button>
      </form>

      <div className="mt-6">
        <ErrorBanner error={bannerError} onAction={onAction} />
      </div>

      <div className="mt-8 flex items-center justify-between text-body-sm">
        <Link href={`/login/2fa?ct=${encodeURIComponent(challengeToken)}`} className="text-text-muted hover:text-ink">
          ← Use your authenticator app
        </Link>
        <Link href="/login" className="text-text-muted hover:text-ink">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
