/**
 * Sentry — Next.js server runtime (Node + Edge). Same scrub list as the
 * client config so anything captured during SSR or in API routes gets the
 * same PII protection.
 */

import * as Sentry from "@sentry/nextjs";

const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "code",
  "recoverycode",
  "pendingsecret",
  "token",
  "refreshtoken",
  "accesstoken",
  "secret",
  "apikey",
  "authorization",
  "cookie",
]);

function scrub(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else if (v && typeof v === "object") {
      out[k] = scrub(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENV ?? "development",
  release: process.env.RELEASE_SHA ?? undefined,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,

  beforeSend(event) {
    if (event.request) {
      if (event.request.headers) event.request.headers = scrub(event.request.headers) as typeof event.request.headers;
      if (event.request.cookies) event.request.cookies = scrub(event.request.cookies) as typeof event.request.cookies;
      if (event.request.data && typeof event.request.data === "object") {
        event.request.data = scrub(event.request.data) as typeof event.request.data;
      }
    }
    if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
    if (event.user?.email && typeof event.user.email === "string") {
      const at = event.user.email.indexOf("@");
      event.user.email = at > 0 ? `${event.user.email[0]}***${event.user.email.slice(at)}` : "[redacted]";
    }
    return event;
  },
});
