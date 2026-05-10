"use client";

/**
 * ReferenceDisplay — surfaces a shopper request reference with a one-click
 * copy button. Used on both the buyer thread page and the admin detail
 * page so the reference is visible at a glance and trivially shareable.
 *
 * Why a shared component: the reference shows up in 3+ places already
 * (buyer header, admin header, queue table, emails). Centralising the
 * label-prefix + copy-button-treatment here keeps them visually
 * consistent and means we only have one place to evolve the affordance.
 *
 * The copy button uses `navigator.clipboard` and falls back silently if
 * the API isn't available (older browsers, insecure contexts) — copying
 * is a convenience, not a critical path.
 */

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface ReferenceDisplayProps {
  /** The reference itself, e.g. "SHP-000042". */
  reference: string;
  /** Optional parent reference shown after the main one with an arrow. */
  parentReference?: string | null;
  /** Visual emphasis. "lg" is for the page header; "sm" for inline contexts. */
  size?: "sm" | "lg";
}

export function ReferenceDisplay({
  reference,
  parentReference,
  size = "lg",
}: ReferenceDisplayProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(reference);
        setCopied(true);
        // Reset the icon back to the clipboard after a short beat so the
        // affordance is obvious if the admin needs to copy again later.
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* clipboard refused — silent fallback, the value is still selectable */
    }
  }

  const valueClass =
    size === "lg"
      ? "font-mono text-h3 font-semibold tabular-nums tracking-[0.4px] text-ink"
      : "font-mono text-body font-semibold tabular-nums text-ink";

  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        Order reference
      </div>
      <div className="flex items-center gap-3">
        <span className={valueClass} aria-label={`Order reference ${reference}`}>
          {reference}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-cream-soft px-2 font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted hover:border-ink hover:text-ink"
          aria-label={copied ? "Copied" : "Copy reference"}
          title={copied ? "Copied" : "Copy reference"}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy
            </>
          )}
        </button>
      </div>
      {parentReference ? (
        <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
          ↳ Addition to {parentReference}
        </div>
      ) : null}
    </div>
  );
}
