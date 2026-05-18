"use client";

/**
 * LiveOpsHero — animated product-proof hero composition.
 *
 * Replaces the static parcel photo with a layered scene of three
 * floating UI cards that mirror real product surfaces:
 *
 *   1. Dashboard tile (top-right) — "Today" with an order count that
 *      ticks up + an amber sparkline.
 *   2. Shipment timeline (center) — Order #1042 progressing through
 *      five states (Reserved → Picked → Packed → Handed to USPS →
 *      Delivered) on a continuous loop.
 *   3. Wallet receipt (bottom-left) — Wallet · USD with ledger lines
 *      appearing one at a time and the balance flipping with each row.
 *
 * Behind the cards: a soft cream-to-amber gradient + a faint dot grid
 * + a single pulsing amber dot positioned where Miami sits on an
 * implied US plane (the lower-right of the scene). No literal map
 * silhouette in v1 — keeps the composition focused on the cards.
 *
 * Motion notes:
 *   - All cards animate via local `useState` + `setInterval` (no
 *     animation library — keeps the marketing bundle lean).
 *   - Respects `prefers-reduced-motion`: when set, intervals never
 *     start and every card freezes at its complete/idle state.
 *   - Mobile (< md) gets a distinct layout: a single card visible at
 *     a time, auto-rotating through all three. The desktop three-card
 *     tableau doesn't shrink well on phones; a designed mobile
 *     composition reads as intentional rather than collapsed.
 *
 * To iterate on the data shown, edit the constants at the bottom of
 * this file. To swap a card out entirely, drop it from `MOBILE_CARDS`
 * and from the desktop render block.
 */

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function LiveOpsHero(): JSX.Element {
  return (
    <>
      {/* Desktop tableau — three floating cards, layered. */}
      <div className="hidden md:block">
        <DesktopScene />
      </div>
      {/* Mobile — one card at a time, auto-rotating. Same cards, same
          animations, smaller stage. */}
      <div className="md:hidden">
        <MobileScene />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop scene — three floating cards
// ---------------------------------------------------------------------------

function DesktopScene(): JSX.Element {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-gradient-to-br from-cream-soft via-cream to-amber/10 shadow-2">
      <Backdrop />

      {/* Wallet card — lower-left, sits behind the timeline so the
          timeline reads as the focal centerpiece. */}
      <div className="absolute bottom-5 left-5 z-10">
        <WalletCard />
      </div>

      {/* Dashboard tile — top-right, balances the wallet diagonally. */}
      <div className="absolute right-5 top-5 z-20">
        <DashboardCard />
      </div>

      {/* Timeline — slightly off-centre, foreground. Higher shadow
          tier so it visually pops above the other two. */}
      <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-[40%]">
        <TimelineCard elevated />
      </div>

      {/* Brand accent strip — same amber tape as the previous hero so
          the LEDGR fingerprint stays consistent across the redesign. */}
      <div
        aria-hidden
        className="absolute -left-3 top-12 h-1.5 w-24 -rotate-6 bg-amber shadow-1"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile scene — one card at a time
// ---------------------------------------------------------------------------

const MOBILE_ROTATION_MS = 4500;

function MobileScene(): JSX.Element {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % 3), MOBILE_ROTATION_MS);
    return () => clearInterval(t);
  }, [reduced]);

  // Keying on idx forces React to remount the inner card so its own
  // animations restart cleanly each rotation — no stale state, no
  // ghost timers leaking across cycles.
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-gradient-to-br from-cream-soft via-cream to-amber/10 shadow-2">
      <Backdrop />
      <div className="absolute inset-0 flex items-center justify-center p-5">
        <div key={idx} className="w-full max-w-[280px] animate-[fadeIn_400ms_ease-out]">
          {idx === 0 ? <DashboardCard /> : null}
          {idx === 1 ? <TimelineCard /> : null}
          {idx === 2 ? <WalletCard /> : null}
        </div>
      </div>
      {/* Pagination dots — three faint pills, the active one filled
          amber. Tells the user "this is rotating" without being noisy. */}
      <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors duration-300",
              i === idx ? "bg-amber" : "bg-line-strong/60",
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backdrop — gradient + faint dot grid + pulsing Miami marker
// ---------------------------------------------------------------------------

function Backdrop(): JSX.Element {
  return (
    <div aria-hidden className="absolute inset-0">
      {/* Faint dot grid — adds editorial texture without competing
          with the cards. 4% alpha is enough to read at full-resolution
          but doesn't muddy small viewports. */}
      <div
        className="absolute inset-0 text-ink opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* Miami marker — pulsing amber dot anchored where Florida
          would sit on an implied US plane. No literal map outline in
          v1; the position alone implies geography. */}
      <div className="absolute bottom-[18%] right-[18%]">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber shadow-1" />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 1 — Dashboard "Today"
// ---------------------------------------------------------------------------

function DashboardCard(): JSX.Element {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(124);
  const [spark, setSpark] = useState<number[]>(() =>
    seedSparkline(12, 4, 11),
  );

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      // Bias the random walk upward — orders only ever grow during a
      // day; the count should never visibly decrement on screen.
      setCount((c) => c + 1 + Math.floor(Math.random() * 3));
      setSpark((d) => [...d.slice(1), 4 + Math.floor(Math.random() * 8)]);
    }, 3800);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <article className="w-[180px] rounded-md border border-line bg-white p-4 shadow-1">
      <header className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
          Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative inline-flex h-1.5 w-1.5">
            {!reduced ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            ) : null}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[1px] text-success">
            Live
          </span>
        </span>
      </header>
      <div className="mt-2 text-[28px] font-medium leading-none tabular-nums tracking-[-0.5px] text-ink">
        {count}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
        Orders shipped
      </div>
      <Sparkline data={spark} className="mt-3 h-8 w-full text-amber" />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Card 2 — Shipment timeline
// ---------------------------------------------------------------------------

const TIMELINE_STEPS = [
  "Reserved",
  "Picked",
  "Packed",
  "Handed to USPS",
  "Delivered",
] as const;
const TIMELINE_TICK_MS = 1500;
// Hold the "Delivered" state at the end for an extra beat before the
// loop resets — gives the eye time to register the green badge.
const TIMELINE_FINAL_HOLD_MS = 2200;

function TimelineCard({ elevated = false }: { elevated?: boolean }): JSX.Element {
  const reduced = useReducedMotion();
  // `step` walks 0 → 5 (the last value means "all done, show Delivered").
  const [step, setStep] = useState(reduced ? TIMELINE_STEPS.length : 0);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    function tick(next: number): void {
      if (cancelled) return;
      setStep(next);
      const delay =
        next === TIMELINE_STEPS.length ? TIMELINE_FINAL_HOLD_MS : TIMELINE_TICK_MS;
      timeout = setTimeout(
        () => tick(next === TIMELINE_STEPS.length ? 0 : next + 1),
        delay,
      );
    }
    timeout = setTimeout(() => tick(1), TIMELINE_TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [reduced]);

  const isDelivered = step >= TIMELINE_STEPS.length;
  const currentLabel = isDelivered
    ? "Delivered"
    : TIMELINE_STEPS[Math.max(step - 1, 0)];

  return (
    <article
      className={cn(
        "w-[260px] rounded-md border border-line bg-white",
        elevated ? "shadow-2" : "shadow-1",
      )}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
          Order #1042
        </span>
        <span
          className={cn(
            "rounded-xs px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1.2px] transition-colors duration-300",
            isDelivered
              ? "bg-success/10 text-success"
              : "bg-amber/10 text-amber",
          )}
        >
          {currentLabel}
        </span>
      </header>
      <ol className="space-y-2 px-4 py-4 font-mono text-[11px]">
        {TIMELINE_STEPS.map((label, i) => {
          // A step is "done" once `step` has advanced past it. The
          // current step shows an amber dot; future steps show a
          // muted neutral dot.
          const done = i < step;
          const current = i === step - 1 && !isDelivered;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-3 w-3 items-center justify-center rounded-full transition-colors duration-300",
                  done && !current
                    ? "bg-success"
                    : current
                      ? "bg-amber"
                      : "bg-line-strong",
                )}
              >
                {done && !current ? (
                  <svg viewBox="0 0 8 8" className="h-2 w-2 text-white">
                    <path
                      d="M1.5 4l1.6 1.6L6.5 2.2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
              <span
                className={cn(
                  "transition-colors duration-300",
                  done || current ? "text-text" : "text-text-subtle",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Card 3 — Wallet receipt
// ---------------------------------------------------------------------------

interface WalletEntry {
  label: string;
  amount: string;
  balance: string;
  positive?: boolean;
}

const WALLET_ENTRIES: ReadonlyArray<WalletEntry> = [
  { label: "Stripe deposit", amount: "+ $200.00", balance: "$640.00", positive: true },
  { label: "Fulfillment · #1042", amount: "− $12.40", balance: "$627.60" },
  { label: "Storage burn", amount: "− $4.80", balance: "$622.80" },
];
const WALLET_TICK_MS = 2400;

function WalletCard(): JSX.Element {
  const reduced = useReducedMotion();
  // Number of entries currently visible, 1-3. The balance shown is
  // always the balance after the most recent visible entry.
  const [visible, setVisible] = useState(reduced ? WALLET_ENTRIES.length : 1);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setVisible((v) => (v >= WALLET_ENTRIES.length ? 1 : v + 1));
    }, WALLET_TICK_MS);
    return () => clearInterval(t);
  }, [reduced]);

  const balance = WALLET_ENTRIES[visible - 1]?.balance ?? "$640.00";

  return (
    <article className="w-[230px] rounded-md border border-line bg-white p-4 shadow-1">
      <header className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
          Wallet · USD
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[1px] text-amber">
          Live ledger
        </span>
      </header>
      <div className="mt-1 text-[24px] font-medium leading-none tabular-nums tracking-[-0.4px] text-ink">
        {balance}
      </div>
      <ol className="mt-3 space-y-1.5">
        {WALLET_ENTRIES.map((entry, i) => {
          const shown = i < visible;
          return (
            <li
              key={entry.label}
              // We render all rows always (avoids height shift) and
              // animate them in via opacity + a small upward slide.
              // Using transition over render-toggles keeps the layout
              // stable for the rest of the card.
              className={cn(
                "flex items-center justify-between gap-2 font-mono text-[10px] transition-all duration-500",
                shown ? "opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              <span className="truncate text-text-muted">{entry.label}</span>
              <span
                className={cn(
                  "tabular-nums",
                  entry.positive ? "text-success" : "text-text",
                )}
              >
                {entry.amount}
              </span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — minimal inline SVG, no library
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}): JSX.Element {
  // Memoise the polyline points so we don't recompute on every render
  // — the data array changes every few seconds, but the render
  // pipeline runs more often than that (parent state, scroll, etc.).
  const points = useMemo(() => {
    if (data.length === 0) return "";
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    return data
      .map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * 100;
        const y = 100 - ((v - min) / range) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [data]);

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        // vector-effect keeps the stroke from getting stretched to
        // 2 × the horizontal scale when the SVG is wider than tall.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the user has the `prefers-reduced-motion: reduce`
 * media query set. Used by every animated card to opt out of motion
 * — accessibility baseline, also avoids CPU on low-power devices.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches);
    // Safari < 14 used addListener; modern browsers use addEventListener.
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);
  return reduced;
}

/**
 * Generate a deterministic-ish sparkline seed of `n` points each in
 * [min, max]. Used to render a meaningful chart on first paint before
 * the random-walk effect takes over.
 */
function seedSparkline(n: number, min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // Gentle sinusoidal shape so the first paint looks like a real
    // intraday trend, not pure noise.
    const wave = Math.sin((i / n) * Math.PI * 1.6) * 0.4 + 0.5;
    const range = max - min;
    out.push(Math.round(min + wave * range));
  }
  return out;
}
