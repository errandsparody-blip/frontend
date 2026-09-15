/**
 * Next.js configuration. Strict mode + production-grade defaults.
 * Security headers are set here so the marketing site (which doesn't proxy
 * through the API) still gets the right defaults.
 *
 * Sentry: wrapped with `withSentryConfig` so source maps upload + tunneling
 * to /monitoring is automatic. The wrap is a no-op when SENTRY_DSN is unset.
 */

import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Aligned with the API: don't ship the path on cross-origin navigations.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  // Image optimization: product/store images live on Cloudflare R2
  // (pub-*.r2.dev) and are often large PNGs. Next/Image resizes them to the
  // rendered size and re-encodes to AVIF/WebP on the fly (cached at the edge),
  // so the marketplace ships small, modern images instead of full-res originals.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      // Allow a future custom R2/CDN image domain without a code change.
      ...(process.env.NEXT_PUBLIC_IMAGE_HOST
        ? [{ protocol: "https", hostname: process.env.NEXT_PUBLIC_IMAGE_HOST }]
        : []),
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2_592_000, // 30 days — product images rarely change
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project — set via env so different environments target
  // different Sentry projects.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps in CI; suppress upload locally to keep dev fast.
  silent: !process.env.CI,
  // Hide source maps from the served bundle (keep them server-side for
  // de-symbolicated stacks but not exposed in browser devtools).
  hideSourceMaps: true,
  // Run the Sentry middleware at /monitoring to bypass ad-blockers.
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
