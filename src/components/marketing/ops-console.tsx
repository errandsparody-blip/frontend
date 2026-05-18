"use client";

/**
 * OpsConsole — bolder, product-screenshot-style hero card.
 *
 * Sits in the right column of the marketing hero, on top of the
 * full-bleed AtlasBackdrop. Reads as a slice of the real product:
 * one elevated chrome frame with a branded header, a body grid of
 * data-dense panels, and a footer strip of operating metrics.
 *
 * Composition (desktop):
 *
 *   ┌──────────────────────────────────────────┐
 *   │ ☷  LIVE OPS · HOUSTON HQ      ● LIVE     │  header
 *   ├──────────────────────────────────────────┤
 *   │ ┌────────────┐ ┌─────────────────────┐  │
 *   │ │ TODAY      │ │ WALLET · USD        │  │
 *   │ │ 147        │ │ $622.80             │  │
 *   │ │ ▁▂▄▆▇      │ │ + $200.00 deposit  │  │
 *   │ └────────────┘ └─────────────────────┘  │
 *   │ ┌──────────────────────────────────────┐ │
 *   │ │ #1042  ALESANA APPAREL → BROOKLYN    │ │
 *   │ │ USPS Priority · 2.4 lb · 14×11×3 in  │ │
 *   │ │ ●─●─●─◐─○─○                          │ │
 *   │ │ RESV PICK PACK SHIP USPS DLVD        │ │
 *   │ └──────────────────────────────────────┘ │
 *   ├──────────────────────────────────────────┤
 *   │ avg 4.2 days · 99.97% uptime · 0 lost   │  footer
 *   └──────────────────────────────────────────┘
 *                          + a floating delivery toast
 *
 * Every numeric is animated:
 *   - "Today" count ticks up every ~4 s with a refreshing sparkline.
 *   - Wallet line items cycle one-at-a-time; balance flips with each.
 *   - Order timeline walks Reserved → Delivered on a continuous loop
 *     with the status pill swapping from amber to success at the end.
 *   - A "delivered" toast fades in over the chrome every ~9 s,
 *     showing the latest fake order destination.
 *
 * Reduced motion: all loops park at their idle/complete state.
 *
 * Mobile: same chrome, the body grid collapses to a single column.
 * Card stays one unit so the composition reads as designed, not
 * collapsed.
 */

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpsConsole(): JSX.Element {
  return (
    <div className="relative">
      {/* Outer chrome — single elevated frame. The shadow-2 + thick
          border + cream-soft fill differentiate it from the
          backdrop dots and pulses. */}
      <article className="rounded-md border border-line bg-cream-soft shadow-2">
        <Header />

        <div className="grid gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
          {/* Top row — two small panels side by side on sm+; stacked
              on phones so the numbers stay readable. */}
          <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr] sm:gap-4">
            <DashboardPanel />
            <WalletPanel />
          </div>
          {/* Full-width order timeline panel — the centerpiece. */}
          <OrderTimelinePanel />
        </div>

        <Footer />
      </article>

      {/* Floating delivery toast — sits over the top-right corner
          of the chrome. Pops in every ~9 s with a fake destination.
          Pointer-events-none so it never blocks anything underneath
          (which would be a problem on mobile). */}
      <DeliveryToast />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header(): JSX.Element {
  const reduced = useReducedMotion();
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        {/* Brand mark — small amber square + monospace USAE. */}
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-ink font-mono text-[10px] font-bold tracking-[1.4px] text-amber">
          UE
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.6px] text-text">
            Live Ops
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[1.4px] text-text-muted">
            Houston HQ
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="relative inline-flex h-2 w-2">
          {!reduced ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
          ) : null}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.4px] text-success">
          Live
        </span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Dashboard panel — "Today" + sparkline
// ---------------------------------------------------------------------------

function DashboardPanel(): JSX.Element {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(147);
  const [spark, setSpark] = useState<number[]>(() => seedSparkline(14, 4, 12));

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setCount((c) => c + 1 + Math.floor(Math.random() * 3));
      setSpark((d) => [...d.slice(1), 4 + Math.floor(Math.random() * 9)]);
    }, 4000);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
          Today
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-subtle">
          shipped
        </span>
      </div>
      <div className="mt-2 text-[32px] font-medium leading-none tabular-nums tracking-[-0.6px] text-ink">
        {count}
      </div>
      <Sparkline data={spark} className="mt-3 h-9 w-full text-amber" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wallet panel — balance + cycling ledger lines
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
  { label: "Storage · Sm box ×4", amount: "− $4.80", balance: "$622.80" },
  { label: "Refund · #0987", amount: "+ $18.00", balance: "$640.80", positive: true },
];
const WALLET_TICK_MS = 2600;

function WalletPanel(): JSX.Element {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(reduced ? WALLET_ENTRIES.length : 1);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setVisible((v) => (v >= WALLET_ENTRIES.length ? 1 : v + 1));
    }, WALLET_TICK_MS);
    return () => clearInterval(t);
  }, [reduced]);

  const balance =
    WALLET_ENTRIES[visible - 1]?.balance ?? WALLET_ENTRIES[0]?.balance ?? "";

  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
          Wallet · USD
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-amber">
          live ledger
        </span>
      </div>
      <div className="mt-1 text-[26px] font-medium leading-none tabular-nums tracking-[-0.4px] text-ink">
        {balance}
      </div>
      <ol className="mt-3 space-y-1.5">
        {WALLET_ENTRIES.map((entry, i) => {
          const shown = i < visible;
          return (
            <li
              key={entry.label}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order timeline panel — the centerpiece. Order metadata + 6-step
// progress bar that walks through states on a continuous loop.
// ---------------------------------------------------------------------------

const TIMELINE_STEPS = [
  { short: "RESV", long: "Reserved" },
  { short: "PICK", long: "Picked" },
  { short: "PACK", long: "Packed" },
  { short: "SHIP", long: "Shipped" },
  { short: "USPS", long: "Out for delivery" },
  { short: "DLVD", long: "Delivered" },
] as const;
const TIMELINE_TICK_MS = 1400;
const TIMELINE_FINAL_HOLD_MS = 2400;

function OrderTimelinePanel(): JSX.Element {
  const reduced = useReducedMotion();
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
  const currentLong = isDelivered
    ? "Delivered"
    : (TIMELINE_STEPS[Math.max(step - 1, 0)]?.long ?? "");

  return (
    <div className="rounded-md border border-line bg-white p-4 sm:p-5">
      {/* Order metadata row — order#, vendor, destination, carrier. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-[1.2px] text-ink">
            #1042
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
            Alesana Apparel
          </span>
        </div>
        <span
          className={cn(
            "rounded-xs px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[1.3px] transition-colors duration-300",
            isDelivered
              ? "bg-success/10 text-success"
              : "bg-amber/10 text-amber",
          )}
        >
          {currentLong}
        </span>
      </div>

      {/* Destination + carrier line. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
        <span className="font-medium text-text">Brooklyn, NY 11201</span>
        <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
          USPS Priority · 2.4 lb · 14×11×3 in
        </span>
      </div>

      {/* Progress bar — six pill nodes connected by hairline rails.
          Done nodes are success-green with a check, the current node
          is amber, the rest are muted. */}
      <ol className="mt-4 grid grid-cols-6 gap-1">
        {TIMELINE_STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step - 1 && !isDelivered;
          return (
            <li key={s.short} className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-300",
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
                  "font-mono text-[9px] font-semibold uppercase tracking-[1.2px] transition-colors duration-300",
                  done || current ? "text-text" : "text-text-subtle",
                )}
              >
                {s.short}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer — operating metrics ticker
// ---------------------------------------------------------------------------

function Footer(): JSX.Element {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line bg-cream px-4 py-2.5 sm:px-5">
      <FooterMetric label="avg ship" value="4.2 days" />
      <FooterMetric label="uptime" value="99.97%" />
      <FooterMetric label="lost / 30d" value="0" />
    </footer>
  );
}

function FooterMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted">
        {label}
      </span>
      <span className="font-mono text-[10px] font-semibold tabular-nums text-ink">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delivery toast — periodic "just delivered" notification overlay
// ---------------------------------------------------------------------------

const TOAST_DESTINATIONS = [
  { order: "#1039", city: "Austin, TX" },
  { order: "#1040", city: "Brooklyn, NY" },
  { order: "#1041", city: "Seattle, WA" },
  { order: "#1042", city: "Atlanta, GA" },
  { order: "#1043", city: "Chicago, IL" },
] as const;
const TOAST_INTERVAL_MS = 6500;
const TOAST_VISIBLE_MS = 3200;

function DeliveryToast(): JSX.Element | null {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let timeout: ReturnType<typeof setTimeout>;
    function loop(): void {
      setIdx((i) => (i + 1) % TOAST_DESTINATIONS.length);
      setVisible(true);
      timeout = setTimeout(() => {
        setVisible(false);
        timeout = setTimeout(loop, TOAST_INTERVAL_MS - TOAST_VISIBLE_MS);
      }, TOAST_VISIBLE_MS);
    }
    // First fire after a short delay so the rest of the chrome
    // paints before the toast pops over the top of it.
    timeout = setTimeout(loop, 1800);
    return () => clearTimeout(timeout);
  }, [reduced]);

  if (reduced) return null;

  const destination = TOAST_DESTINATIONS[idx] ?? TOAST_DESTINATIONS[0];
  if (!destination) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute -right-2 top-14 z-20 flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 shadow-2 transition-all duration-500",
        visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success">
        <svg viewBox="0 0 8 8" className="h-3 w-3 text-white">
          <path
            d="M1.5 4l1.6 1.6L6.5 2.2"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[1.4px] text-success">
          Delivered
        </span>
        <span className="font-mono text-[10px] text-text">
          {destination.order} → {destination.city}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline + helpers
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}): JSX.Element {
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
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);
  return reduced;
}

function seedSparkline(n: number, min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const wave = Math.sin((i / n) * Math.PI * 1.7) * 0.42 + 0.5;
    out.push(Math.round(min + wave * (max - min)));
  }
  return out;
}
