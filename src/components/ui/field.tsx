"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  className?: string;
}

export function Field({ label, children, error, hint, className }: FieldProps): JSX.Element {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-mono text-[11px] uppercase tracking-[1.4px] text-text-muted">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-caption text-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-caption text-text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
