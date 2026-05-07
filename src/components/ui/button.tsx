/**
 * Button — sharp rectangle (4 px radius), mono caps label, optional trailing
 * arrow. Three intents: primary (ink), amber (single most important promo),
 * outline (secondary). Implementation Plan / Design System v1.0.
 */

"use client";

import { ArrowRight } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "amber" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  withArrow?: boolean;
  loading?: boolean;
}

const baseClasses =
  "inline-flex items-center justify-center gap-3 font-mono text-mono-label uppercase " +
  "tracking-[1.5px] font-semibold border border-transparent rounded-sm " +
  "transition-colors duration-fast ease-out select-none whitespace-nowrap " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-60 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-text-inv hover:bg-ink-elev",
  amber: "bg-amber text-ink hover:bg-amber-hi",
  outline: "bg-cream text-ink border-line-strong hover:border-ink",
  ghost: "bg-transparent text-ink hover:bg-cream-soft",
  danger: "bg-error text-text-inv hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[11px]",
  md: "h-11 px-5",
  lg: "h-14 px-7 text-[13px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", withArrow = false, loading = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      className={cn(baseClasses, variants[variant], sizes[size], className)}
      {...rest}
    >
      <span>{children}</span>
      {withArrow ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
    </button>
  );
});
