"use client";

/**
 * NetworkHero — ambient national-shipping-network hero.
 *
 * Third hero option, designed to feel premium and editorial.
 *
 *  - The map IS the hero. A constellation of US cities (hand-placed
 *    at roughly-real coordinates) connected by amber flight-path
 *    arcs all radiating from Miami. There is no literal map outline
 *    — the US shape emerges from the city positions themselves.
 *  - Continuous, low-noise motion. Each route carries a small light
 *    pulse that travels Miami → city on a staggered loop. Every
 *    pulse fires on its own timer so the eye always has something
 *    new to follow, but nothing competes.
 *  - Foreground is intentionally sparse. A single floating "live"
 *    pill overlays the bottom-right with an incrementing shipments-
 *    in-transit counter. Lets the network breathe.
 *
 * Motion gates on `prefers-reduced-motion`: when set, every pulse
 * parks at its city and the counter holds at its current value.
 *
 * Editing notes:
 *  - Add or remove cities by editing the CITIES constant. Position
 *    is in the SVG's 800×500 coordinate space.
 *  - To change the pulse pacing, tweak the per-city `delaySec` /
 *    `durationSec` fields. Stagger keeps the composition quiet.
 *  - The hub city (Miami) is special-cased — larger pulsing
 *    halo, every route originates from it.
 */

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Geometry — viewBox is 800 × 500 (8:5). All city positions live in
// that coordinate space; the SVG scales itself to fill the hero
// container, so these numbers are resolution-independent.
// ---------------------------------------------------------------------------

interface City {
  /** Display name shown under the dot (kept short). */
  name: string;
  /** X coordinate in the 800-wide viewBox. */
  cx: number;
  /** Y coordinate in the 500-tall viewBox. */
  cy: number;
  /** Loop duration for the pulse travelling from Miami → this city. */
  durationSec: number;
  /** Initial delay so pulses don't all start in sync. */
  delaySec: number;
  /** Offset for the label (the dot can be obscured if a label sits
   *  on top of it; nudge the text up or to the side per-city). */
  labelDx?: number;
  labelDy?: number;
}

// Roughly-real US positions for the hub (Miami) + 8 destinations.
// Eight is the sweet spot: dense enough to read as a network,
// sparse enough that no two routes overlap awkwardly.
const HUB: City = {
  name: "MIAMI",
  cx: 580,
  cy: 380,
  durationSec: 0,
  delaySec: 0,
  labelDx: 0,
  labelDy: 24,
};

const CITIES: ReadonlyArray<City> = [
  { name: "SEATTLE",     cx: 120, cy: 110, durationSec: 6.5, delaySec: 0.0,  labelDy: -10 },
  { name: "LOS ANGELES", cx: 140, cy: 280, durationSec: 6.0, delaySec: 1.4,  labelDx: 8, labelDy: 18 },
  { name: "DENVER",      cx: 290, cy: 230, durationSec: 5.0, delaySec: 2.7,  labelDy: 18 },
  { name: "CHICAGO",     cx: 470, cy: 200, durationSec: 4.0, delaySec: 0.8,  labelDy: -10 },
  { name: "HOUSTON",     cx: 410, cy: 360, durationSec: 3.5, delaySec: 3.1,  labelDy: 18 },
  { name: "ATLANTA",     cx: 520, cy: 320, durationSec: 2.8, delaySec: 1.9,  labelDx: -10, labelDy: 18 },
  { name: "NEW YORK",    cx: 660, cy: 175, durationSec: 4.5, delaySec: 2.3,  labelDy: -10 },
  { name: "BOSTON",      cx: 710, cy: 140, durationSec: 4.8, delaySec: 3.5,  labelDy: -10 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NetworkHero(): JSX.Element {
  const reduced = useReducedMotion();

  // Live shipments counter — increments by 1–2 every ~3 s. Reset
  // visual baseline each mount so the badge always starts at a
  // friendly round number rather than the last server-rendered one.
  const [count, setCount] = useState(47);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setCount((c) => c + 1 + Math.floor(Math.random() * 2));
    }, 3200);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <div className="relative aspect-[8/5] overflow-hidden rounded-md border border-line bg-gradient-to-br from-cream-soft via-cream to-amber/10 shadow-2 md:aspect-[4/3]">
      <svg
        viewBox="0 0 800 500"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-label={`A stylised national shipping network: Miami at the hub with eight routes radiating to major US cities, each carrying a small pulse of light. ${count} shipments currently in transit.`}
        role="img"
      >
        <defs>
          {/* Soft radial wash centered behind Miami so the hub feels
              like the brightest spot on the map — visual gravity. */}
          <radialGradient id="hub-glow" cx={HUB.cx} cy={HUB.cy} r="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e0a526" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#e0a526" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#e0a526" stopOpacity="0" />
          </radialGradient>
          {/* Drop shadow shared by the city dots so they sit on the
              canvas with a hint of depth instead of looking pasted. */}
          <filter id="dot-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#1a1a1a" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Radial wash anchored on the hub. */}
        <rect width="800" height="500" fill="url(#hub-glow)" />

        {/* Background constellation — sparse halftone-ish dot field
            for editorial texture. Two opacities give it depth. */}
        <g aria-hidden>
          {CONSTELLATION_DOTS.map(([cx, cy, r, o], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="#1a1a1a" opacity={o} />
          ))}
        </g>

        {/* Routes — drawn before the city dots so the dots sit on top
            of the line endpoints. Each route is a gentle curve with
            its control point pulled toward the centre of the canvas
            so the routes "arc" instead of running as flat lines. */}
        {CITIES.map((city) => {
          const d = routePath(HUB, city);
          return (
            <g key={`route-${city.name}`}>
              {/* The static route stroke — very faint amber. */}
              <path
                d={d}
                fill="none"
                stroke="#e0a526"
                strokeOpacity="0.35"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeDasharray="2 4"
              />
            </g>
          );
        })}

        {/* Travelling light pulses — separate render pass so each
            pulse stays above all routes regardless of paint order.
            CSS `offset-path` makes each pulse follow its specific
            route precisely; staggered delays keep the network
            visually quiet but always alive. */}
        {CITIES.map((city) => {
          const d = routePath(HUB, city);
          return (
            <g
              key={`pulse-${city.name}`}
              style={
                !reduced
                  ? {
                      offsetPath: `path("${d}")`,
                      offsetDistance: "0%",
                      animation: `package-travel ${city.durationSec}s ${city.delaySec}s ease-in-out infinite`,
                    }
                  : {
                      offsetPath: `path("${d}")`,
                      offsetDistance: "100%",
                    }
              }
            >
              {/* Outer halo + inner core. The halo softens the eye
                  catch so the pulse reads as ambient, not jittery. */}
              <circle r="6" fill="#e0a526" opacity="0.2" />
              <circle r="2.5" fill="#e0a526" />
            </g>
          );
        })}

        {/* City dots — destinations. Each pulses gently on its own
            cycle. The label sits below (or above, per-city). */}
        {CITIES.map((city) => (
          <CityMarker key={city.name} city={city} reduced={reduced} />
        ))}

        {/* Miami hub — special-cased with a bigger pulsing halo and
            a brighter label. The whole composition reads off this one
            anchor point. */}
        <g filter="url(#dot-shadow)">
          <circle
            cx={HUB.cx}
            cy={HUB.cy}
            r="14"
            fill="#e0a526"
            opacity="0.22"
            className={!reduced ? "[animation:delivered-pulse_2600ms_ease-out_infinite]" : ""}
            style={{ transformOrigin: `${HUB.cx}px ${HUB.cy}px` }}
          />
          <circle cx={HUB.cx} cy={HUB.cy} r="6" fill="#e0a526" />
          <circle cx={HUB.cx} cy={HUB.cy} r="2.5" fill="#fbeac0" />
        </g>
        <text
          x={HUB.cx}
          y={HUB.cy + 28}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="11"
          fontWeight="700"
          letterSpacing="2"
          fill="#1a1a1a"
        >
          MIAMI · HUB
        </text>
      </svg>

      {/* Floating "live network" pill — the only foreground UI.
          Sits in the lower-right where the map has natural empty
          space. Glassmorphic to feel layered without screaming. */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-10">
        <div className="flex items-center gap-2.5 rounded-full border border-line/80 bg-white/85 px-3 py-2 shadow-1 backdrop-blur-sm">
          <span className="relative inline-flex h-2 w-2">
            {!reduced ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            ) : null}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
            In transit
          </span>
          <span className="font-mono text-[13px] font-semibold tabular-nums text-ink">
            {count}
          </span>
        </div>
      </div>

      {/* Amber tape — brand fingerprint kept consistent with prior
          hero iterations. */}
      <div
        aria-hidden
        className="absolute -left-3 top-12 h-1.5 w-24 -rotate-6 bg-amber shadow-1"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// City marker — dot + label, with a gentle individual pulse loop
// ---------------------------------------------------------------------------

function CityMarker({ city, reduced }: { city: City; reduced: boolean }): JSX.Element {
  const labelX = city.cx + (city.labelDx ?? 0);
  const labelY = city.cy + (city.labelDy ?? 18);
  return (
    <g>
      <g filter="url(#dot-shadow)">
        {/* Soft outer halo with its own pulse. Random-ish delay per
            city (derived from the route delay) so haloes don't all
            breathe in sync — that would feel mechanical. */}
        <circle
          cx={city.cx}
          cy={city.cy}
          r="9"
          fill="#e0a526"
          opacity="0.16"
          className={
            !reduced
              ? "[animation:delivered-pulse_3200ms_ease-out_infinite]"
              : ""
          }
          style={{
            transformOrigin: `${city.cx}px ${city.cy}px`,
            animationDelay: `${city.delaySec}s`,
          }}
        />
        <circle cx={city.cx} cy={city.cy} r="4" fill="#1a1a1a" />
        <circle cx={city.cx} cy={city.cy} r="1.6" fill="#fbeac0" />
      </g>
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="9"
        fontWeight="600"
        letterSpacing="1.4"
        fill="#1a1a1a"
        opacity="0.55"
      >
        {city.name}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a quadratic-bezier path from the hub to a destination city
 * with the control point pulled toward the canvas centre so the
 * curve arcs gently rather than running as a flat line. The bow
 * amount scales with distance so close cities don't get an absurd
 * arc and far cities still have visible curvature.
 */
function routePath(from: City, to: City): string {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const mx = (from.cx + to.cx) / 2;
  const my = (from.cy + to.cy) / 2;
  // Perpendicular offset for the bezier control point — push it
  // toward the upper part of the canvas so every route arcs UP
  // (visually conveys "flight path"). The amount scales with the
  // route length divided by a constant.
  const len = Math.hypot(dx, dy);
  const bow = Math.min(60, len * 0.18);
  // Perpendicular unit vector (-dy, dx) / len, then offset along
  // it. We negate so the bow goes "up" on screen (smaller y).
  const cx = mx + (-dy / len) * -bow;
  const cy = my + (dx / len) * -bow;
  return `M ${from.cx} ${from.cy} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to.cx} ${to.cy}`;
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

// ---------------------------------------------------------------------------
// Background constellation dots — handcrafted positions so the field
// reads as designed rather than algorithmic. Concentrated slightly
// in the upper-left / lower-right corners to balance the map weight.
// ---------------------------------------------------------------------------

const CONSTELLATION_DOTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [62, 60, 1.1, 0.14],
  [184, 38, 1.3, 0.18],
  [310, 72, 1, 0.12],
  [420, 42, 1.2, 0.16],
  [540, 84, 1, 0.12],
  [664, 36, 1.3, 0.18],
  [758, 86, 1, 0.12],
  [42, 168, 1.2, 0.14],
  [732, 220, 1, 0.12],
  [80, 412, 1.3, 0.16],
  [56, 466, 1, 0.12],
  [196, 462, 1.2, 0.14],
  [336, 458, 1, 0.1],
  [768, 450, 1.3, 0.16],
  [712, 470, 1, 0.12],
  [262, 64, 0.9, 0.1],
  [392, 76, 0.9, 0.1],
  [612, 70, 0.9, 0.1],
];
