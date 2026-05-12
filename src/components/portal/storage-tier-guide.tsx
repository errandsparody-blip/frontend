"use client";

/**
 * Storage tier UI — two exports off the SAME live data source:
 *
 *   1. `StorageTierGuide` — small "Info" button + modal table.
 *   2. `StorageTierCards` — large inline grid (one card per tier).
 *
 * Both fetch `GET /v1/fees/storage-tiers`, which reads from the same
 * config rows (`fee_schedule` + `tier_dimensions`) that drive the actual
 * wallet debit at PSN submit. If finance bumps a price in the admin
 * config editor, vendors see the new number on their next page load —
 * the displayed amount can NEVER disagree with what the wallet charges.
 *
 * On API failure we fall back to the conservative seed defaults from
 * `lib/storage-tiers.ts` so the panel always renders something useful.
 */

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api-client";
import {
  cubicFeetFrom,
  cubicInchesFrom,
  FALLBACK_TIERS,
  formatCentsAsDollars,
  formatDimensionsLabel,
  STORAGE_TIER_MATCH_INSTRUCTION,
  STORAGE_TIER_NOTES,
  STORAGE_TIER_ORDER,
  TIER_METADATA,
  type StorageTierDimensions,
  type StorageTierKey,
  type StorageTierOnboarding,
  type StorageTiersResponse,
} from "@/lib/storage-tiers";

// =============================================================================
// Shared data hook — one place that knows how to fetch + fall back.
// Both the modal and the inline cards use it so a single network round
// trip per page render covers every surface that needs the data.
// =============================================================================

function useStorageTiers(): {
  data: StorageTiersResponse;
  isLoading: boolean;
  isFallback: boolean;
} {
  const q = useQuery({
    queryKey: ["fees", "storage-tiers"],
    queryFn: () => api.get<StorageTiersResponse>("/fees/storage-tiers"),
    // Storage tier prices change quarterly at most — cache aggressively
    // so the panel doesn't re-fetch on every tab switch.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  if (q.data) return { data: q.data, isLoading: false, isFallback: false };
  // Loading and error states both render the fallback — `isLoading=true`
  // keeps callers free to render a skeleton if they want, but the data
  // they get back is always a valid response shape.
  return { data: FALLBACK_TIERS, isLoading: q.isLoading, isFallback: !q.isLoading };
}

/**
 * Convenience: read everything a card needs for ONE tier off the
 * loaded response. Returns null when the tier somehow doesn't exist in
 * the response (defensive — should never happen with a healthy seed).
 */
function tierView(
  data: StorageTiersResponse,
  tier: StorageTierKey,
): {
  label: string;
  scale: 1 | 2 | 3 | 4 | 5;
  onboarding: StorageTierOnboarding;
  monthlyStorageCents: number | null;
  dims: StorageTierDimensions | undefined;
  isNegotiated: boolean;
  stockingCents: number | null;
  firstMonthStorageCents: number | null;
  totalCents: number | null;
} | null {
  const onboarding = data.onboarding[tier];
  if (!onboarding) return null;
  const meta = TIER_METADATA[tier];
  const isNegotiated = "negotiated" in onboarding && onboarding.negotiated === true;
  return {
    label: meta.label,
    scale: meta.scale,
    onboarding,
    monthlyStorageCents: data.monthlyStorage[tier],
    dims: data.dimensions?.[tier],
    isNegotiated,
    stockingCents: isNegotiated ? null : (onboarding as { stockingCents: number }).stockingCents,
    firstMonthStorageCents: isNegotiated
      ? null
      : (onboarding as { firstMonthStorageCents: number }).firstMonthStorageCents,
    totalCents: isNegotiated ? null : (onboarding as { totalCents: number }).totalCents,
  };
}

// =============================================================================
// StorageTierGuide — modal (used by product-form)
// =============================================================================

interface ModalProps {
  triggerLabel?: string;
  iconOnly?: boolean;
}

export function StorageTierGuide({
  triggerLabel = "Storage tier guide",
  iconOnly = false,
}: ModalProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const { data, isFallback } = useStorageTiers();

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

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
          <button
            type="button"
            aria-label="Close pricing guide"
            onClick={() => setOpen(false)}
            className="fixed inset-0 -z-10 cursor-default bg-ink/40"
          />
          <div className="relative w-full max-w-4xl rounded-md border border-line bg-white p-8 shadow-xl">
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
              {isFallback ? <FallbackNotice /> : null}
            </header>

            <MatchInstruction />

            <div className="mt-4 overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-body-sm">
                <thead className="bg-cream-soft">
                  <tr>
                    <Th>Tier</Th>
                    <Th>Dimensions</Th>
                    <Th align="right">Cubic in</Th>
                    <Th align="right">Cubic ft</Th>
                    <Th align="right">Stocking</Th>
                    <Th align="right">First-month storage</Th>
                    <Th align="right">Monthly storage</Th>
                    <Th align="right">Total at submit</Th>
                  </tr>
                </thead>
                <tbody>
                  {STORAGE_TIER_ORDER.map((tier) => {
                    const v = tierView(data, tier);
                    if (!v) return null;
                    const ci = cubicInchesFrom(v.dims);
                    const cf = cubicFeetFrom(v.dims);
                    return (
                      <tr key={tier} className="border-t border-line">
                        <Td strong>{v.label}</Td>
                        <Td>{formatDimensionsLabel(v.dims)}</Td>
                        <Td align="right">{ci != null ? ci.toLocaleString() : "—"}</Td>
                        <Td align="right">{cf != null ? `${cf.toFixed(2)} ft³` : "—"}</Td>
                        <Td align="right">
                          {v.isNegotiated ? "Negotiated" : formatCentsAsDollars(v.stockingCents)}
                        </Td>
                        <Td align="right">
                          {v.isNegotiated
                            ? "Negotiated"
                            : formatCentsAsDollars(v.firstMonthStorageCents)}
                        </Td>
                        <Td align="right">
                          {v.monthlyStorageCents == null
                            ? "Negotiated"
                            : `${formatCentsAsDollars(v.monthlyStorageCents)} / mo`}
                        </Td>
                        <Td align="right" strong>
                          {v.isNegotiated ? "—" : formatCentsAsDollars(v.totalCents)}
                        </Td>
                      </tr>
                    );
                  })}
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
// StorageTierCards — inline panel (used on PSN list + PSN new)
// =============================================================================

interface CardsProps {
  framed?: boolean;
  heading?: string;
  description?: string;
}

export function StorageTierCards({
  framed = true,
  heading = "Pricing by tier",
  description = "Per-box stocking + first-month storage. Live from the same config that drives your wallet at PSN submit.",
}: CardsProps = {}): JSX.Element {
  const { data, isLoading, isFallback } = useStorageTiers();

  // Build the tier views once per render so the JSX below stays small.
  const tiers = useMemo(
    () =>
      STORAGE_TIER_ORDER.map((t) => ({ key: t, view: tierView(data, t) })).filter(
        (x): x is { key: StorageTierKey; view: NonNullable<ReturnType<typeof tierView>> } =>
          x.view !== null,
      ),
    [data],
  );

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
          {isFallback ? (
            <div className="mt-2">
              <FallbackNotice />
            </div>
          ) : null}
        </div>
        <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          Smaller → Larger
        </div>
      </header>

      <div className="mb-5">
        <MatchInstruction />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {tiers.map(({ key, view }) => (
          <TierCard
            key={key}
            tierKey={key}
            view={view}
            loading={isLoading && !isFallback}
          />
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

// =============================================================================
// Single tier card
// =============================================================================

function TierCard({
  tierKey,
  view,
  loading,
}: {
  tierKey: StorageTierKey;
  view: NonNullable<ReturnType<typeof tierView>>;
  loading: boolean;
}): JSX.Element {
  const isPallet = tierKey === "PALLET";
  const sizePct = 30 + (view.scale - 1) * 17;
  const cubicIn = cubicInchesFrom(view.dims);
  const cubicFt = cubicFeetFrom(view.dims);

  return (
    <article
      className={
        "flex flex-col rounded-md border bg-white p-5 shadow-sm transition-colors " +
        (isPallet
          ? "border-amber/60 ring-1 ring-amber/30"
          : "border-line hover:border-line-strong") +
        (loading ? " opacity-70" : "")
      }
    >
      {/* Scaled "box" graphic — visual cue for the tier's size. */}
      <div className="mb-4 flex h-[88px] items-end justify-center">
        <div
          aria-hidden
          className="relative"
          style={{ width: `${sizePct}%`, height: `${sizePct}%` }}
        >
          <div className="absolute inset-0 rounded-sm border-2 border-ink bg-cream-soft" />
          <div className="absolute inset-y-0 left-1/2 w-[18%] -translate-x-1/2 bg-amber/70" />
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <h3 className="text-h3 font-semibold text-ink">{view.label}</h3>
        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          T{view.scale}
        </span>
      </div>
      <p className="mt-1 text-body-sm text-text-muted">{formatDimensionsLabel(view.dims)}</p>

      {/* Cubic info — surfaced as a small inline row so vendors can match
          their actual box volume against the tier ceiling. */}
      <div className="mt-2 flex items-baseline justify-between font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
        <span>
          Cubic:{" "}
          <span className="text-text">
            {cubicIn != null ? cubicIn.toLocaleString() : "—"} in³
          </span>
        </span>
        <span className="text-text">
          {cubicFt != null ? `${cubicFt.toFixed(2)} ft³` : "—"}
        </span>
      </div>

      <dl className="mt-3 flex flex-col gap-2 border-t border-line pt-3 font-mono text-body-sm tabular-nums">
        <Row
          label="Stocking"
          value={view.isNegotiated ? "Negotiated" : formatCentsAsDollars(view.stockingCents)}
          muted={view.isNegotiated}
        />
        <Row
          label="First-month storage"
          value={
            view.isNegotiated ? "Negotiated" : formatCentsAsDollars(view.firstMonthStorageCents)
          }
          muted={view.isNegotiated}
        />
        <Row
          label="Storage / month"
          value={
            view.monthlyStorageCents == null
              ? "Negotiated"
              : formatCentsAsDollars(view.monthlyStorageCents)
          }
          muted={view.monthlyStorageCents == null}
        />
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
          {view.isNegotiated ? "—" : formatCentsAsDollars(view.totalCents)}
        </span>
      </div>
    </article>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className={muted ? "text-text-muted" : "text-ink"}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match-instruction callout — appears at the top of both the cards
// panel and the modal so the rule is impossible to miss.
// ---------------------------------------------------------------------------

function MatchInstruction(): JSX.Element {
  const { eyebrow, headline, body } = STORAGE_TIER_MATCH_INSTRUCTION;
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-md border-l-4 border-amber bg-amber/10 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
      <div>
        <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
          {eyebrow}
        </div>
        <div className="mt-0.5 text-body font-semibold text-ink">{headline}</div>
        <p className="mt-1 text-body-sm text-text">{body}</p>
      </div>
    </div>
  );
}

/**
 * Banner shown when we couldn't reach the API and are falling back to
 * the seed defaults. Vendors get a clear "these numbers might not match
 * what gets charged" warning rather than silently being misled.
 */
function FallbackNotice(): JSX.Element {
  return (
    <div
      role="status"
      className="inline-flex items-center gap-2 rounded-sm border border-line bg-cream px-2.5 py-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />
      Showing fallback defaults — couldn&apos;t reach pricing service.
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
