"use client";

/**
 * StorageTierGuide — a button + modal that explains how the platform's
 * storage tiers are sized and priced. Used on the PSN pages and on the
 * product form so vendors can quickly look up which tier a product
 * belongs in without leaving the screen.
 *
 * Data here mirrors the operations team's pricing card (the PDF in the
 * shared drive). Numbers MUST stay in sync — if the pricing card moves,
 * update both. The frontend doesn't fetch this from the API because:
 *   - It's reference info, not transactional data.
 *   - The PSN page already issues plenty of queries; one fewer is one
 *     fewer waterfall.
 *   - Pricing changes are quarterly at most.
 */

import { Info, X } from "lucide-react";
import { useEffect, useState } from "react";

interface TierRow {
  tier: string;
  dimensionsInches: string;
  dimensionsCm: string;
  cubicInches: string;
  cubicFeet: string;
  monthlyPrice: string;
}

const TIERS: ReadonlyArray<TierRow> = [
  {
    tier: "Small",
    dimensionsInches: "16 × 12 × 12",
    dimensionsCm: "40 × 30 × 30",
    cubicInches: "2,304",
    cubicFeet: "1.33 ft³",
    monthlyPrice: "$9 / month",
  },
  {
    tier: "Medium",
    dimensionsInches: "18 × 18 × 16",
    dimensionsCm: "45 × 45 × 40",
    cubicInches: "5,184",
    cubicFeet: "3.00 ft³",
    monthlyPrice: "$15 / month",
  },
  {
    tier: "Large",
    dimensionsInches: "18 × 18 × 24",
    dimensionsCm: "45 × 45 × 60",
    cubicInches: "7,776",
    cubicFeet: "4.50 ft³",
    monthlyPrice: "$22 / month",
  },
  {
    tier: "X-Large",
    dimensionsInches: "24 × 18 × 24",
    dimensionsCm: "60 × 45 × 60",
    cubicInches: "10,368",
    cubicFeet: "6.00 ft³",
    monthlyPrice: "$30 / month",
  },
  {
    tier: "Standard Pallet",
    dimensionsInches: "40 × 48 × 60",
    dimensionsCm: "102 × 122 × 152",
    cubicInches: "115,200",
    cubicFeet: "66.67 ft³",
    monthlyPrice: "$25 – $40 / month",
  },
];

const OPERATIONAL_NOTES: ReadonlyArray<string> = [
  "Storage fees are billed on the 1st day of every month.",
  "Pricing is based on occupied warehouse space and inventory handling requirements.",
  "Oversized or irregular inventory may require custom pricing.",
  "Quarterly storage audits may be conducted to optimize inventory usage and reduce unnecessary storage costs.",
  "Pallet storage pricing varies based on stackability, turnover rate, and special handling.",
];

interface Props {
  /** Customise the trigger label — defaults to "Storage tier guide". */
  triggerLabel?: string;
  /** Render as a compact icon-only button. */
  iconOnly?: boolean;
}

export function StorageTierGuide({
  triggerLabel = "Storage tier guide",
  iconOnly = false,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);

  // Close on Escape — keyboard parity with the X button.
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Lock body scroll while the modal is open so the page underneath
  // doesn't scroll on touch / wheel.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={
          iconOnly
            ? "inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-white text-text-muted hover:border-ink hover:text-ink"
            : "inline-flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-white px-3 font-mono text-mono-label uppercase tracking-[1.2px] text-text hover:border-ink"
        }
      >
        <Info className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
        {iconOnly ? <span className="sr-only">{triggerLabel}</span> : triggerLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="USA Errands storage tier pricing guide"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8"
        >
          {/* Backdrop — a real <button> so keyboard users can dismiss
              by tabbing to it and pressing Enter. The button fills the
              viewport and sits behind the card via z-order. */}
          <button
            type="button"
            aria-label="Close pricing guide"
            onClick={() => setOpen(false)}
            className="fixed inset-0 -z-10 cursor-default bg-ink/40"
          />
          <div className="relative w-full max-w-3xl rounded-md border border-line bg-white p-8 shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-cream-soft hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <header className="mb-6">
              <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
                Pricing guide
              </div>
              <h2 className="mt-1 text-h2 font-semibold text-ink">
                USA Errands storage tiers
              </h2>
              <p className="mt-2 text-body-sm text-text-muted">
                Recommended dimensions, cubic volume, and monthly storage price
                for each tier. Pick the smallest tier your product fits into so
                you don&apos;t over-pay for warehouse space.
              </p>
            </header>

            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-body-sm">
                <thead className="bg-cream-soft">
                  <tr>
                    <Th>Tier</Th>
                    <Th>Dimensions (in)</Th>
                    <Th>Dimensions (cm)</Th>
                    <Th align="right">Cubic in</Th>
                    <Th align="right">Cubic ft</Th>
                    <Th align="right">Monthly</Th>
                  </tr>
                </thead>
                <tbody>
                  {TIERS.map((t) => (
                    <tr key={t.tier} className="border-t border-line">
                      <Td strong>{t.tier}</Td>
                      <Td>{t.dimensionsInches}</Td>
                      <Td>{t.dimensionsCm}</Td>
                      <Td align="right">{t.cubicInches}</Td>
                      <Td align="right">{t.cubicFeet}</Td>
                      <Td align="right" strong>
                        {t.monthlyPrice}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="mt-6">
              <h3 className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
                Operational notes
              </h3>
              <ul className="mt-3 flex flex-col gap-2 text-body-sm text-text">
                {OPERATIONAL_NOTES.map((note) => (
                  <li key={note} className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </section>

            <p className="mt-6 text-caption text-text-muted">
              Need a custom arrangement (cold storage, hazmat, fragile pallets)?
              Get in touch with the operations team — pallet pricing is
              negotiable for high-turnover or stackable inventory.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

// Tiny th/td helpers so the modal markup stays compact. Local to this
// file because they're styled specifically for the guide table.
function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}): JSX.Element {
  return (
    <th
      className={
        "px-3 py-2 font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  strong,
}: {
  children: React.ReactNode;
  align?: "right";
  strong?: boolean;
}): JSX.Element {
  return (
    <td
      className={
        "px-3 py-2 " +
        (align === "right" ? "text-right " : "") +
        (strong ? "font-semibold text-ink " : "text-text")
      }
    >
      {children}
    </td>
  );
}
