/**
 * Root-level error boundary. Catches errors thrown from the root layout
 * itself — the only place app/error.tsx can't reach. Per Next.js convention,
 * this file must define its own <html> + <body> because the root layout
 * has crashed and won't render.
 *
 * Kept deliberately light so it can render even when most of the runtime
 * is broken. Fonts, design tokens, and providers are NOT used here on
 * purpose.
 */

"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[root error]", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F1EFE9",
          color: "#0A0A0A",
          fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 480, width: "100%" }}>
          <div
            style={{
              fontFamily: "ui-monospace, Menlo, Consolas, monospace",
              fontSize: 11,
              letterSpacing: "1.6px",
              textTransform: "uppercase",
              color: "#C99428",
            }}
          >
            [ERROR]
          </div>
          <h1
            style={{
              marginTop: 12,
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 500,
              letterSpacing: "-0.4px",
            }}
          >
            We hit a snag.
          </h1>
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.55, color: "#3A3A3A" }}>
            The page couldn&apos;t load. Try refreshing — if the problem persists,
            contact{" "}
            <a href="mailto:support@usa-errands.com" style={{ color: "#0A0A0A" }}>
              support@usa-errands.com
            </a>
            .
          </p>
          {error.digest ? (
            <div
              style={{
                marginTop: 16,
                fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                fontSize: 11,
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "#9C9892",
              }}
            >
              Reference: {error.digest}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 24,
              background: "#0A0A0A",
              color: "#F1EFE9",
              padding: "12px 20px",
              fontFamily: "ui-monospace, Menlo, Consolas, monospace",
              fontSize: 11,
              letterSpacing: "1.4px",
              textTransform: "uppercase",
              border: "none",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
