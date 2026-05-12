"use client";

/**
 * Storage tier UI — two exports off the same shared data:
 *
 *   1. `StorageTierGuide` — small "Info" button + modal table. Used in
 *      tight spots like the product form where we don't have room for a
 *      full inline panel.
 *
 *   2. `StorageTierCards` — large, prominent inline card grid (one per
 *      tier). Used on the PSN list + PSN new pages so vendors see the
 *      pricing without an extra click. Each card shows a scaled "box"
 *      icon so the size hierarchy reads at a glance, plus stocking +
 *      first-month storage as separate lines, plus the combined total.
 *
 * Tier data lives in `lib/storage-tiers.ts`. Both this file and the
 * marketing /pricing page import from there so they never drift.
 */

import { AlertTriangle, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  STORAGE_TIERS,
  STORAGE_TIER_MATCH_INSTRUCTION,
  STORAGE_TIER_NOTES,
  type StorageTier,
} from "@/lib/storage-tiers";

// =============================================================================
// StorageTierGuide — small button + modal (legacy, kept for product-form)
// =============================================================================

interface ModalProps {
  /** Customise the trigger label — defaults to "Storage tier guide". */
  triggerLabel?: string;
  /** Render as a compact icon-only button. */
  iconOnly?: boolean;
}

export function StorageTierGuide({
  triggerLabel = "Storage tier guide",
  iconOnly = false,
}: ModalProps): JSX.Element {
  const [open, setOpen] = useState(false);

  // Close on Escape — keyboard parity with the X button.
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Lock body scroll while the modal is open so the page underneath
  // doesn't move on touch / wheel.
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
                Per-box pricing. Pick the smallest tier your product fits into so
                you don&apos;t over-pay for warehouse space.
              </p>
            </header>

            {/* Match-instruction callout. Sits above the table so vendors
                read the rule BEFORE eyeballing the prices and rushing to
                pick a tier. */}
            <MatchInstruction />

            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-body-sm">
                <thead className="bg-cream-soft">
                  <tr>
                    <Th>Tier</Th>
                    <Th>Size</Th>
                    <Th align="right">Stocking</Th>
                    <Th align="right">First-month storage</Th>
                    <Th align="right">Total at submit</Th>
                  </tr>
                </thead>
                <tbody>
                  {STORAGE_TIERS.map((t) => (
                    <tr key={t.tier} className="border-t border-line">
                      <Td strong>{t.tier}</Td>
                      <Td>{t.sizeInches}</Td>
                      <Td align="right">{t.stocking}</Td>
                      <Td align="right">{t.storage}</Td>
                      <Td align="right" strong>
                        {t.total}
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
                {STORAGE_TIER_NOTES.map((note) => (
                  <li key={note} className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}

// =============================================================================
// StorageTierCards — inline panel with one card per tier
// =============================================================================

interface CardsProps {
  /**
   * Whether to wrap the cards in their own bordered section + heading.
   * Default: true. Pass `false` if the parent is already a section.
   */
  framed?: boolean;
  /** Override the panel heading text. */
  heading?: string;
  /** Override the panel description text. */
  description?: string;
}

/**
 * Five tier cards in a responsive grid. Each card carries:
 *   • a scaled "box" SVG so the size hierarchy reads visually,
 *   • the tier name + size constraints,
 *   • the stocking and first-month storage fees on separate lines,
 *   • the combined "total at submit" as the headline number.
 *
 * Designed to be noticeable: amber eyebrow, cream-soft backdrop, +
 * a subtle amber accent border on the largest tier so the eye lands
 * somewhere. The whole panel sits inline on the PSN list / new
 * pages — no modal click required.
 */
export function StorageTierCards({
  framed = true,
  heading = "Pricing by tier",
  description = "Per-box stocking + first-month storage. Pick the smallest tier your product fits into.",
}: CardsProps = {}): JSX.Element {
  const inner = (
    <>
      <header className="mb-5 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-mono-eyebrow uppercase tracking-[1.4px] text-amber">
            [ Pricing guide ]
          </div>
          <h2 className="mt-1 text-h2 font-semibold tracking-[-0.2px] text-ink">
            {heading}
          </h2>
          <p className="mt-1 text-body-sm text-text-muted">{description}</p>
        </div>
        {/* Quick legend so the visual scale is unambiguous. */}
        <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          Smaller → Larger
        </div>
      </header>

      {/* Match-instruction callout. We render it INSIDE the panel so it
          reads as part of the pricing guide, not as a separate banner —
          but it gets stronger visual weight (warning icon, amber border)
          so it's the first thing the eye lands on after the heading. */}
      <div className="mb-5">
        <MatchInstruction />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STORAGE_TIERS.map((tier) => (
          <TierCard key={tier.tier} tier={tier} />
        ))}
      </div>

      <ul className="mt-5 grid gap-2 text-body-sm text-text-muted md:grid-cols-2">
        {STORAGE_TIER_NOTES.map((note) => (
          <li key={note} className="flex items-start gap-2">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </>
  );

  if (!framed) return <div>{inner}</div>;

  return (
    <section
      aria-label="USA Errands storage tier pricing"
      className="rounded-md border border-line bg-cream-soft p-6 md:p-8"
    >
      {inner}
    </section>
  );
}

/**
 * Single tier card. The "box" graphic at the top is a CSS-scaled square
 * — we keep a fixed container height (96px) and scale the inner box
 * down so all five cards align cleanly. The "Pallet" tier picks up an
 * amber accent border to draw the eye to the negotiated-pricing rail.
 */
function TierCard({ tier }: { tier: StorageTier }): JSX.Element {
  const isPallet = tier.tier === "Pallet";
  // Map scale 1..5 to a visual percentage. 1 = ~40%, 5 = 100%.
  const sizePct = 30 + (tier.scale - 1) * 17;

  return (
    <article
      className={
        "flex flex-col rounded-md border bg-white p-5 shadow-sm transition-colors " +
        (isPallet
          ? "border-amber/60 ring-1 ring-amber/30"
          : "border-line hover:border-line-strong")
      }
    >
      {/* Scaled box graphic — drawn with two rounded rectangles so it
          reads as a stylised parcel rather than a flat square. */}
      <div className="mb-4 flex h-[88px] items-end justify-center">
        <div
          aria-hidden
          className="relative"
          style={{ width: `${sizePct}%`, height: `${sizePct}%` }}
        >
          <div className="absolute inset-0 rounded-sm border-2 border-ink bg-cream-soft" />
          {/* Vertical "tape" strip in amber, mirrors the SiteMark logo. */}
          <div className="absolute inset-y-0 left-1/2 w-[18%] -translate-x-1/2 bg-amber/70" />
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <h3 className="text-h3 font-semibold text-ink">{tier.tier}</h3>
        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          T{tier.scale}
        </span>
      </div>
      <p className="mt-1 text-body-sm text-text-muted">{tier.sizeInches}</p>

      <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-3 font-mono text-body-sm tabular-nums">
        <div className="flex items-baseline justify-between">
          <dt className="text-text-muted">Stocking</dt>
          <dd className="text-ink">{tier.stocking}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-muted">Storage / month</dt>
          <dd className="text-ink">{tier.storage}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          Total at submit
        </span>
        <span
          className={
            "font-mono text-h2 font-semibold tabular-nums " +
            (isPallet ? "text-amber" : "text-ink")
          }
        >
          {tier.total}
        </span>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// MatchInstruction — the "match your box to the tier" callout. Rendered
// at the top of both the inline cards panel AND the modal guide so the
// rule is impossible to miss. Amber-accented with a warning icon so it
// reads as actionable, not decorative.
// ---------------------------------------------------------------------------

function MatchInstruction(): JSX.Element {
  const { eyebrow, headline, body } = STORAGE_TIER_MATCH_INSTRUCTION;
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-md border-l-4 border-amber bg-amber/10 px-4 py-3"
    >
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-amber"
        aria-hidden
      />
      <div>
        <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
          {eyebrow}
        </div>
        <div className="mt-0.5 text-body font-semibold text-ink">
          {headline}
        </div>
        <p className="mt-1 text-body-sm text-text">{body}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny th/td helpers for the modal table.
// ---------------------------------------------------------------------------

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
