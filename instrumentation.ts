/**
 * Next.js instrumentation hook. Loaded once per server start (Node + Edge
 * runtimes have separate processes). Defers to the runtime-specific Sentry
 * config so we don't pull `@sentry/node` into the Edge bundle.
 *
 * Implementation Plan §9.2 (Observability).
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
