"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { TotpInput } from "@/components/ui/totp-input";
import { api } from "@/lib/api-client";
import { homeForRole, useAuth } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";

interface BeginEnrollResponse {
  qrDataUrl: string;
  pendingSecret: string;
}

interface ConfirmEnrollResponse {
  recoveryCodes: string[];
}

export default function MfaEnrollPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState<"loading" | "scan" | "confirm" | "codes">("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [pendingSecret, setPendingSecret] = useState<string>("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const { bannerError, handle, clear } = useApiErrorHandler();

  useEffect(() => {
    let cancelled = false;
    api
      .post<BeginEnrollResponse>("/auth/2fa/enroll")
      .then((r) => {
        if (cancelled) return;
        setQrDataUrl(r.qrDataUrl);
        setPendingSecret(r.pendingSecret);
        setStep("scan");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        handle(err);
      });
    return () => {
      cancelled = true;
    };
    // handle is stable; we want this to fire exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm(submitted: string): Promise<void> {
    if (submitted.length !== 6) return;
    clear();
    try {
      const r = await api.post<ConfirmEnrollResponse>("/auth/2fa/enroll/confirm", {
        pendingSecret,
        code: submitted,
      });
      setRecoveryCodes(r.recoveryCodes);
      setStep("codes");
    } catch (err) {
      handle(err);
      setCode("");
    }
  }

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "signin") router.push("/login");
    else if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
  }

  if (step === "loading") {
    return <div className="text-body text-text-muted">Setting up MFA…</div>;
  }

  if (step === "codes") {
    return (
      <div>
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[04] Save recovery codes</div>
        <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
          Save these somewhere safe.
        </h1>
        <p className="mt-3 text-body text-text-muted">
          Each code works once. If you lose access to your authenticator, use one of these to sign in. We
          will not show them again.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 rounded-md border border-line-strong bg-cream-soft p-5 font-mono text-body-sm">
          {recoveryCodes.map((c) => (
            <code key={c} className="select-all">
              {c}
            </code>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(recoveryCodes.join("\n"));
            }}
          >
            Copy all
          </Button>
          <Button variant="primary" withArrow onClick={() => router.push("/dashboard")}>
            I&apos;ve saved them, continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[03] Set up MFA</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Scan the QR code.
      </h1>
      <p className="mt-3 text-body text-text-muted">
        Use Google Authenticator, 1Password, or any TOTP app. Then type the six-digit code it generates.
      </p>

      {qrDataUrl ? (
        <div className="mt-8 flex flex-col items-start gap-6 sm:flex-row sm:items-start">
          <div className="rounded-md border border-line-strong bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} width={200} height={200} alt="MFA QR code" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-mono-label uppercase text-text-muted">Manual entry secret</div>
            <code className="mt-2 block break-all font-mono text-body-sm text-text">{pendingSecret}</code>
          </div>
        </div>
      ) : null}

      <div className="mt-10">
        <div className="mb-3 font-mono text-mono-label uppercase text-text-muted">
          Code from your authenticator
        </div>
        <TotpInput value={code} onChange={setCode} onComplete={confirm} invalid={!!bannerError} />
      </div>

      <div className="mt-6">
        <ErrorBanner error={bannerError} onAction={onAction} />
      </div>

      {/*
        Skip MFA enrolment. The user is authenticated at this point (they
        landed here after login fired router.push("/signup/2fa-enroll")
        because mfaEnrolled was false), so we send them to their portal
        home rather than the marketing root — that's where the old
        `<Link href="/">` was sending them, which is why nothing felt like
        it was happening: they ended up on the public marketing page,
        signed-in state and all. `homeForRole(user)` resolves to /admin
        for admins, /dashboard for vendors. We fall back to /dashboard if
        the auth context hasn't hydrated yet so the click is never a no-op.
      */}
      <button
        type="button"
        onClick={() => router.push(user ? homeForRole(user) : "/dashboard")}
        className="mt-8 inline-block text-body-sm text-text-muted hover:text-ink"
      >
        Skip for now (not recommended)
      </button>
    </div>
  );
}
