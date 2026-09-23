"use client";

/**
 * AddressAutocomplete — a Google-Places-backed typeahead for the checkout.
 *
 * The buyer starts typing their address; suggestions (US/CA, restricted by the
 * selected country) drop in. Picking one fetches the structured address and
 * calls onPick, which fills the form fields. Falls back silently to manual
 * entry when the backend has no Places key. Debounced; one Places session token
 * per fill for correct Google billing.
 */
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { marketplaceApi, type AddressPrediction, type StructuredAddress } from "@/lib/storefront-api";

function newSessionToken(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function AddressAutocomplete({
  country,
  onPick,
  className,
}: {
  country: string;
  onPick: (address: StructuredAddress) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef<string>(newSessionToken());
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced suggestion fetch.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await marketplaceApi.addressAutocomplete(q, country, sessionRef.current);
        if (!cancelled) {
          setResults(res.predictions);
          setOpen(res.predictions.length > 0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, country]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function choose(p: AddressPrediction) {
    setOpen(false);
    setQuery(p.description);
    try {
      const res = await marketplaceApi.addressDetails(p.placeId, sessionRef.current);
      if (res.address) onPick(res.address);
    } catch {
      /* ignore — buyer can still fill fields manually */
    } finally {
      // A new session token after a completed autocomplete session (Google billing).
      sessionRef.current = newSessionToken();
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-text-2">Find your address</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Start typing your street address…"
            autoComplete="off"
            className="w-full rounded-lg border border-line-strong bg-white py-2.5 pl-9 pr-3 text-[14px] text-ink outline-none transition-colors focus:border-ink"
          />
        </div>
      </label>
      {open && results.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-2">
          {results.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                onClick={() => choose(p)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-cream-soft"
              >
                <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-subtle" aria-hidden />
                <span>{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-[11px] text-text-subtle">
        {loading ? "Searching…" : "Pick a suggestion to fill your address, or enter it manually below."}
      </p>
    </div>
  );
}
