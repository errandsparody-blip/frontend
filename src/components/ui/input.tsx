"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-sm border bg-cream-soft px-4 text-body text-text",
        "placeholder:text-text-subtle outline-none transition-colors duration-fast ease-out",
        invalid ? "border-error" : "border-line-strong hover:border-text/40 focus:border-ink",
        "focus:ring-2 focus:ring-ink/10",
        className,
      )}
      {...rest}
    />
  );
});
