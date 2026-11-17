/**
 * ErrorBanner — intentionally renders nothing.
 *
 * Errors used to show here as an inline card with a colored left edge and a
 * tinted background. That styling was removed on request: errors now surface
 * as a single, consistent centered pop-up modal (see ErrorToastHost, mounted
 * in the root layout) which fires for every error handled by
 * useApiErrorHandler. The pop-up is unmissable regardless of scroll position
 * and persists until dismissed, so an inline banner is redundant.
 *
 * This component is kept as a no-op so the 50+ existing call sites keep
 * compiling without a sweep. Prefer not to add new usages — rely on the
 * pop-up instead.
 */

"use client";

import type { NormalizedError } from "@/lib/errors";

interface ErrorBannerProps {
  error: NormalizedError | null;
  onAction?: (handler: NonNullable<NormalizedError["entry"]["action"]>["handler"]) => void;
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ErrorBanner(_props: ErrorBannerProps): JSX.Element | null {
  return null;
}
