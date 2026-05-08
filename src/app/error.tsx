/**
 * Next.js app-router error boundary. Catches anything thrown during
 * rendering of any non-root segment. Sentry is wired separately via the
 * @sentry/nextjs auto-instrumentation, so we just render a useful page.
 *
 * Note: this file MUST be a client component per Next.js convention.
 */

"use client";

import { useEffect } from "react";

import { ErrorPage } from "@/components/errors/error-page";

interface ErrorPageBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalErrorBoundary({ error, reset }: ErrorPageBoundaryProps) {
  useEffect(() => {
    // Sentry's Next.js SDK already auto-captures unhandled render errors,
    // but logging here gives us a paper trail in the browser console for
    // local dev. The digest is the bit Sentry uses to correlate the
    // server- and client-side traces of the same error.
    // eslint-disable-next-line no-console
    console.error("[render error]", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <ErrorPage
      code="[ERROR]"
      title="Something broke on this page."
      body="We've been notified. Try again, or head back to the dashboard. If it keeps happening, get in touch."
      primaryAction={{ label: "Try again", onClick: () => reset() }}
      secondaryAction={{ label: "Back to dashboard", href: "/" }}
      {...(error.digest ? { correlationId: error.digest } : {})}
    />
  );
}
