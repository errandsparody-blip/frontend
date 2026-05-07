/**
 * PasswordInput — wraps the standard <Input> with a reveal/hide toggle.
 *
 * Design notes
 * ────────────
 * - Layout: positions a button-icon inside a relative wrapper at the right.
 *   The input gets right-padding so caret + autofill icon don't run under
 *   the toggle.
 * - Icons: Eye / EyeOff from lucide-react — already the project's icon
 *   library; no new dependency. Sized 18px to match the body line-height.
 * - Colors: idle `text-text-muted`, hover `text-ink`. Matches the muted →
 *   solid pattern the existing nav links use (admin sidebar, topbar).
 * - State: visibility is component-local. There's no reason to lift it —
 *   nothing else on the page cares whether the user is currently revealing.
 * - Accessibility: button has type="button" so Return inside the password
 *   field still submits the form, role and label flip with state, and
 *   `aria-pressed` exposes the toggle state to screen readers.
 * - Security: the toggle only flips the input's `type` between password and
 *   text; it never copies the value, never logs, never exposes the value
 *   beyond what the user explicitly asked to see.
 */

"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  invalid?: boolean;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, invalid, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const Icon = visible ? EyeOff : Eye;
    const label = visible ? "Hide password" : "Show password";

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          invalid={invalid}
          // Reserve room for the icon button so the value never overlaps it.
          className={cn("pr-12", className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={label}
          aria-pressed={visible}
          // tabIndex stays default — keyboard users can tab to the toggle
          // after the input. We don't want it before the field because the
          // first Tab into the form should land on the input itself.
          className={cn(
            "absolute inset-y-0 right-0 flex items-center px-3",
            "text-text-muted transition-colors duration-fast ease-out",
            "hover:text-ink focus-visible:text-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:rounded-sm",
            // When the field is invalid, lean amber-warning rather than
            // muted, so the icon doesn't fight the red border for attention.
            invalid && "text-error/70 hover:text-error",
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    );
  },
);
