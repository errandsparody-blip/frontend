"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface TotpInputProps {
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * Number of digit slots. Defaults to 6 (TOTP authenticator apps and the
   * legacy email-verify flow). Email verification raised its codes to 8 as
   * part of the M-4 hardening, so that call site passes `length={8}`.
   */
  length?: number;
  /** Called when the user types the final digit. */
  onComplete?: (code: string) => void;
  className?: string;
}

const DEFAULT_LENGTH = 6;

export function TotpInput({
  value,
  onChange,
  invalid,
  disabled,
  autoFocus,
  length,
  onComplete,
  className,
}: TotpInputProps): JSX.Element {
  const LENGTH = length ?? DEFAULT_LENGTH;
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState<string[]>(() => splitToDigits(value, LENGTH));

  useEffect(() => {
    setDigits(splitToDigits(value, LENGTH));
  }, [value, LENGTH]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setDigit = (idx: number, d: string): void => {
    const next = [...digits];
    next[idx] = d.replace(/\D/g, "").slice(-1) ?? "";
    setDigits(next);
    const joined = next.join("");
    onChange(joined);
    if (joined.length === LENGTH && !next.includes("")) onComplete?.(joined);
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Backspace" && !digits[idx]) {
      refs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft") refs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight") refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (text.length === 0) return;
    e.preventDefault();
    const next = splitToDigits(text, LENGTH);
    setDigits(next);
    onChange(next.join(""));
    refs.current[Math.min(text.length, LENGTH - 1)]?.focus();
    if (text.length === LENGTH) onComplete?.(text);
  };

  return (
    <div className={cn("flex gap-2", className)}>
      {Array.from({ length: LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid}
          value={digits[i] ?? ""}
          onChange={(e) => {
            setDigit(i, e.target.value);
            if (e.target.value && i < LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={cn(
            "h-14 w-12 rounded-sm border bg-cream-soft text-center font-mono text-[24px] font-medium tabular-nums",
            "outline-none transition-colors duration-fast ease-out",
            invalid ? "border-error" : "border-line-strong focus:border-ink",
            "focus:ring-2 focus:ring-ink/10",
          )}
        />
      ))}
    </div>
  );
}

function splitToDigits(s: string, length: number): string[] {
  const arr = s.replace(/\D/g, "").slice(0, length).split("");
  while (arr.length < length) arr.push("");
  return arr;
}
