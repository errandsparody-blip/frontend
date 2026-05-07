/**
 * Email verification handler — the page the user lands on after clicking the
 * link in the verification email.
 *
 * Backend contract:
 *   GET /v1/auth/verify-email?token=<token>
 *     → 200 { ok: true }                 success, status flips to ACTIVE
 *     → 400 { code: "verify_invalid" }   token bad / expired / already used
 *
 * The token is consumed exactly once on mount. We guard against React 18
 * Strict Mode's double-invocation by using a ref so the second invocation
 * sees that the request is already in flight.
 *
 * After success we route to /login. The user still has to enroll MFA before
 * the account is fully usable, but that step happens AFTER the first sign-in
 * (security: don't enroll MFA on a session that just clicked an email link).
 */

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, type ApiError } from "@/lib/api-client";

type Status = "verifying" | "success" | "invalid" | "missing" | "network";

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
  const token = params.get("token");

  const [status, setStatus] = useState<Status>(token ? "verifying" : "missing");
  const requested = useRef(false);

  useEffect(() => {
    if (!token) return;
    // React Strict Mode invokes effects twice in dev. The token is single-use
    // server-side, so the second invocation would always 400. Guard at the
    // client too.
    if (requested.current) return;
    requested.current = true;

    void (async () => {
      try {
        await api.get<{ ok: true }>(
          `/auth/verify-email?token=${encodeURIComponent(token)}`,
        );
        setStatus("success");
        // Brief pause so the user sees the success state, then continue.
        setTimeout(() => router.push("/login?verified=1"), 1500);
      } catch (err) {
        const e = err as ApiError;
        if (e.code === "verify_invalid" || e.status === 400) {
          setStatus("invalid");
        } else {
          setStatus("network");
        }
      }
    })();
  }, [token, router]);

  if (status === "missing") {
    return (
      <Frame eyebrow="[02] Verify email" title="This link is missing its token.">
        <p className="mt-3 text-body text-text-muted">
          Make sure you copied the full link from your email. If it&apos;s broken
          across two lines in your client, try opening it in a different inbox.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/login">
            <Button variant="primary" size="lg" withArrow>
              Go to sign in
            </Button>
          </Link>
        </div>
      </Frame>
    );
  }

  if (status === "verifying") {
    return (
      <Frame eyebrow="[02] Verify email" title="Verifying your email…">
        <p className="mt-3 text-body text-text-muted">
          One moment while we confirm the link is valid.
        </p>
      </Frame>
    );
  }

  if (status === "success") {
    return (
      <Frame eyebrow="[02] Verified" title="Your email is verified.">
        <p className="mt-3 text-body text-text-muted">
          Sign in next to set up two-factor authentication and finish onboarding.
          Redirecting you now…
        </p>
      </Frame>
    );
  }

  if (status === "invalid") {
    return (
      <Frame eyebrow="[02] Verify email" title="This link is no longer valid.">
        <p className="mt-3 text-body text-text-muted">
          Verification links expire after 24 hours and can only be used once.
          Sign in to request a fresh one — we&apos;ll send a new email automatically
          if your account still needs verification.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/login">
            <Button variant="primary" size="lg" withArrow>
              Continue to sign in
            </Button>
          </Link>
        </div>
      </Frame>
    );
  }

  // status === "network"
  return (
    <Frame eyebrow="[02] Verify email" title="We couldn’t reach our server.">
      <p className="mt-3 text-body text-text-muted">
        Check your connection and try the link again. If the problem persists,
        contact support and include the link from your email.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Button
          variant="primary"
          size="lg"
          withArrow
          onClick={() => {
            requested.current = false;
            setStatus("verifying");
          }}
        >
          Retry
        </Button>
      </div>
    </Frame>
  );
}

interface FrameProps {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}

function Frame({ eyebrow, title, children }: FrameProps) {
  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">{eyebrow}</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        {title}
      </h1>
      {children}
    </div>
  );
}
