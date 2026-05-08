/**
 * 404 page — Next.js convention. Caught when a route doesn't match any
 * page or when a page calls `notFound()` from `next/navigation`.
 *
 * Brand-consistent so users don't think they've landed on a third-party
 * error page.
 */

import { ErrorPage } from "@/components/errors/error-page";

export default function NotFound() {
  return (
    <ErrorPage
      code="404"
      title="That page isn't here."
      body="The link might be broken, or the page may have moved. Try the dashboard, or sign in if you haven't yet."
      primaryAction={{ label: "Back to dashboard", href: "/" }}
      secondaryAction={{ label: "Sign in", href: "/login" }}
    />
  );
}
