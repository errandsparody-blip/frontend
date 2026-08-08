"use client";

/**
 * SuggestInput — a text input that suggests values you've saved before
 * for the same field, backed by localStorage (see lib/suggestions).
 *
 * Suggestions show on focus, filter as you type (substring, case-
 * insensitive), are ordered most-recent-first, and each shows when it was
 * saved. Click one to fill the field. A small × removes a suggestion.
 *
 * This component only DISPLAYS + fills suggestions — remembering is done
 * by the parent form on successful submit (rememberText), so we don't
 * pollute the store with half-typed values.
 */

import { X } from "lucide-react";
import { useRef, useState, type InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/input";
import { savedAgo, useSuggestions } from "@/lib/suggestions";

type SuggestInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  /** Storage namespace for this field, e.g. "return-carrier". */
  namespace: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** Max suggestions to show (default 6). */
  limit?: number;
};

export function SuggestInput({
  namespace,
  value,
  onChange,
  invalid,
  limit = 6,
  className,
  onFocus,
  onBlur,
  ...rest
}: SuggestInputProps): JSX.Element {
  const { entries, remove } = useSuggestions<string>(namespace);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = value.trim().toLowerCase();
  const matches = entries
    .filter((e) => (q ? e.key.includes(q) && e.key !== q : true))
    .slice(0, limit);

  return (
    <div className="relative">
      <Input
        {...rest}
        type={rest.type ?? "text"}
        value={value}
        invalid={invalid}
        className={className}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Delay so a click on a suggestion registers before we close.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
          onBlur?.(e);
        }}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-sm border border-line-strong bg-white py-1 shadow-lg">
          {matches.map((m) => (
            <li key={m.key} className="group flex items-center justify-between gap-2 px-3 py-2 hover:bg-cream-soft">
              <button
                type="button"
                className="flex-1 truncate text-left text-body-sm text-text"
                // preventDefault on mousedown keeps the input focused so
                // this click registers before the blur-close fires.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  onChange(m.value);
                  setOpen(false);
                }}
              >
                {m.value}
              </button>
              <span className="shrink-0 font-mono text-mono-label uppercase tracking-[1px] text-text-subtle">
                {savedAgo(m.savedAt)}
              </span>
              <button
                type="button"
                aria-label="Remove suggestion"
                className="shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-error"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => remove(m.key)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
