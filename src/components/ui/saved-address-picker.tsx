"use client";

/**
 * SavedAddressPicker — remembers full recipient/shipping address blocks
 * in localStorage and lets the user re-fill a whole form from one click,
 * instead of retyping a repeat destination.
 *
 * Display + fill only. The parent form calls `rememberAddress(...)` on a
 * successful submit so we only store addresses that were actually used.
 */

import { X } from "lucide-react";
import { useState } from "react";

import { rememberEntry, savedAgo, useSuggestions } from "@/lib/suggestions";

const NAMESPACE = "recipient-address";

export interface AddressRecord {
  recipientName: string;
  recipientPhone?: string;
  recipientEmail?: string;
  shipAddressLine1: string;
  shipAddressLine2?: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry?: string;
}

/** Stable de-dupe key for an address. */
function addressKey(a: AddressRecord): string {
  return [a.recipientName, a.shipAddressLine1, a.shipPostalCode]
    .map((s) => (s ?? "").trim().toLowerCase())
    .join("|");
}

/** Remember an address the vendor actually used (call on submit success). */
export function rememberAddress(a: AddressRecord): void {
  if (!a.shipAddressLine1?.trim() || !a.shipPostalCode?.trim()) return;
  rememberEntry<AddressRecord>(NAMESPACE, addressKey(a), a);
}

function oneLine(a: AddressRecord): string {
  const l2 = a.shipAddressLine2 ? `, ${a.shipAddressLine2}` : "";
  return `${a.shipAddressLine1}${l2}, ${a.shipCity} ${a.shipState} ${a.shipPostalCode}`;
}

export function SavedAddressPicker({
  onPick,
}: {
  onPick: (a: AddressRecord) => void;
}): JSX.Element | null {
  const { entries, remove } = useSuggestions<AddressRecord>(NAMESPACE);
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-cream px-3 font-mono text-mono-label uppercase tracking-[1.2px] text-text hover:border-ink"
      >
        Saved addresses ({entries.length})
      </button>
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-[min(28rem,90vw)] overflow-auto rounded-sm border border-line-strong bg-white py-1 shadow-lg">
          {entries.map((e) => (
            <li
              key={e.key}
              className="group flex items-start justify-between gap-2 px-3 py-2 hover:bg-cream-soft"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  onPick(e.value);
                  setOpen(false);
                }}
              >
                <div className="truncate text-body-sm font-semibold text-ink">
                  {e.value.recipientName}
                </div>
                <div className="truncate text-body-sm text-text-muted">{oneLine(e.value)}</div>
                <div className="mt-0.5 font-mono text-mono-label uppercase tracking-[1px] text-text-subtle">
                  saved {savedAgo(e.savedAt)}
                </div>
              </button>
              <button
                type="button"
                aria-label="Remove saved address"
                className="shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-error"
                onClick={() => remove(e.key)}
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
