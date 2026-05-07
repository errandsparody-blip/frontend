export default function VerifyEmailPage() {
  return (
    <div>
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[02] Verify email</div>
      <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
        Check your inbox.
      </h1>
      <p className="mt-3 text-body text-text-muted">
        We sent a verification link to the email you provided. Click it to activate your account, then come
        back here to set up two-factor authentication and finish onboarding.
      </p>
      <ol className="mt-10 flex flex-col gap-3 border-t border-line pt-6">
        {[
          ["01", "Verify email", "Check your inbox"],
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
