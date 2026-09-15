"use client";

/**
 * BackLink — a consistent "← Back" control for storefront/marketplace pages.
 * Pass `onClick` (usually router.back(), to return exactly where the buyer came
 * from) or an `href` for a fixed destination.
 */
import Link from "next/link";

const CLS =
  "mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted transition-colors hover:text-ink";

export function BackLink({
  href,
  onClick,
  label = "Back",
}: {
  href?: string;
  onClick?: () => void;
  label?: string;
}) {
  const inner = (
    <>
      <span aria-hidden>←</span> {label}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={CLS}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={CLS}>
      {inner}
    </button>
  );
}
