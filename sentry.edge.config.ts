/**
 * Sentry — Next.js Edge runtime (middleware + edge routes).
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENV ?? "development",
  release: process.env.RELEASE_SHA ?? undefined,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
});
