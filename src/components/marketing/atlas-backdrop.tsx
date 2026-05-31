"use client";

/**
 * AtlasBackdrop — section-level shipping-network backdrop for the
 * marketing hero. Renders the same Miami-hub + radiating-routes
 * composition as the previous NetworkHero, but full-bleed across
 * the entire hero section instead of confined to a single card.
 *
 * Visual goals:
 *  - Reads as an atlas: muted, ambient, "always on" rather than
 *    foreground-active.
 *  - Stays readable behind the headline + body copy on the left:
 *    a cream → transparent gradient scrim is layered above the
 *    SVG on the left third so type contrast never drops.
 *  - Keeps the same low-noise pulse-staggering as NetworkHero —
 *    eight routes, eight different durations, eight different
 *    delays, never in sync.
 *
 * Geometry note:
 *  This component owns a wider viewBox (1600 × 700) than the old
 *  NetworkHero (800 × 500) because it now spans the full hero
 *  section. Cities are re-placed at coordinates that read as a US
 *  outline at that wider aspect; do NOT copy the old NetworkHero
 *  coords here, they're calibrated for a card crop.
 *
 * Reduced motion: every pulse parks at its destination city; the
 * hub halo holds at rest. No content is hidden — accessibility
 * baseline + low-power device courtesy.
 */

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Geometry — full-bleed viewBox. Coordinates calibrated for the
// hero section's natural aspect (~2:1 on desktop). City positions
// approximate the US lower-48 in a stylised way.
// ---------------------------------------------------------------------------

interface City {
  name: string;
  cx: number;
  cy: number;
  durationSec: number;
  delaySec: number;
  labelDx?: number;
  labelDy?: number;
}

// Austin is the real warehouse — the hub of the network. Cities
// are positioned so the hub sits in the LOWER-CENTRE of the canvas
// (clearly visible below the card on desktop) and destinations
// radiate UP and OUT. Routes that head toward the right pass
// through the card area — the dashed lines still read past the
// card edges, and the pulses are visible at both ends of the
// route. This keeps the network legible even where the foreground
// composition overlaps it.
const HUB: City = {
  name: "HOUSTON",
  cx: 720,
  cy: 620,
  durationSec: 0,
  delaySec: 0,
  labelDy: 32,
};

const CITIES: ReadonlyArray<City> = [
  { name: "SEATTLE",     cx: 180,  cy: 130, durationSec: 6.4, delaySec: 0.0,  labelDy: -14 },
  { name: "LOS ANGELES", cx: 220,  cy: 360, durationSec: 5.4, delaySec: 1.5,  labelDx: 10, labelDy: 22 },
  { name: "DENVER",      cx: 470,  cy: 280, durationSec: 4.0, delaySec: 2.8,  labelDy: 22 },
  // { name: "CHICAGO",     cx: 820,  cy: 230, durationSec: 3.6, delaySec: 0.9,  labelDy: -14 },
  { name: "ATLANTA",     cx: 980,  cy: 470, durationSec: 3.6, delaySec: 2.0,  labelDx: -12, labelDy: 22 },
  { name: "MIAMI",       cx: 1140, cy: 580, durationSec: 4.8, delaySec: 3.3,  labelDy: 22 },
  { name: "NEW YORK",    cx: 1300, cy: 220, durationSec: 5.0, delaySec: 2.4,  labelDy: -14 },
  { name: "BOSTON",      cx: 1420, cy: 180, durationSec: 5.4, delaySec: 3.7,  labelDy: -14 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AtlasBackdrop(): JSX.Element {
  const reduced = useReducedMotion();

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <svg
        viewBox="0 0 1600 700"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {/* Hub glow — soft radial wash anchored on Miami. Slightly
              larger than the NetworkHero version because the section
              is so much wider; the wash needs to read as "this point
              is the centre" from across the full hero. */}
          <radialGradient
            id="atlas-hub-glow"
            cx={HUB.cx}
            cy={HUB.cy}
            r="560"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#e0a526" stopOpacity="0.16" />
            <stop offset="55%" stopColor="#e0a526" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#e0a526" stopOpacity="0" />
          </radialGradient>
          {/* Drop shadow shared by city dots — feathered enough to
              suggest depth without "stickered onto canvas" feel. */}
          <filter id="atlas-dot-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor="#1a1a1a" floodOpacity="0.16" />
          </filter>
        </defs>

        <rect width="1600" height="700" fill="url(#atlas-hub-glow)" />

        {/* Background constellation — sparse halftone-ish texture
            scattered through the empty quadrants. Helps the
            backdrop feel "designed" instead of empty. */}
        <g>
          {CONSTELLATION_DOTS.map(([cx, cy, r, o], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="#1a1a1a" opacity={o} />
          ))}
        </g>

        {/* Routes — dashed amber arcs from Miami to each city. */}
        {CITIES.map((city) => (
          <path
            key={`route-${city.name}`}
            d={routePath(HUB, city)}
            fill="none"
            stroke="#e0a526"
            strokeOpacity="0.32"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeDasharray="3 6"
          />
        ))}

        {/* Travelling light pulses — separate paint pass so they
            sit above every route. Each pulse uses CSS offset-path
            to follow its specific arc; staggered delays mean the
            network always has motion but never in sync. */}
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
                  : { offsetPath: `path("${d}")`, offsetDistance: "100%" }
              }
            >
              <circle r="8" fill="#e0a526" opacity="0.22" />
              <circle r="3" fill="#e0a526" />
            </g>
          );
        })}

        {/* City dots + labels. */}
        {CITIES.map((city) => (
          <CityMarker key={city.name} city={city} reduced={reduced} />
        ))}

        {/* Miami — bigger pulsing halo + brighter label. */}
        <g filter="url(#atlas-dot-shadow)">
          <circle
            cx={HUB.cx}
            cy={HUB.cy}
            r="18"
            fill="#e0a526"
            opacity="0.24"
            className={
              !reduced
                ? "[animation:delivered-pulse_2800ms_ease-out_infinite]"
                : ""
            }
            style={{ transformOrigin: `${HUB.cx}px ${HUB.cy}px` }}
          />
          <circle cx={HUB.cx} cy={HUB.cy} r="8" fill="#e0a526" />
          <circle cx={HUB.cx} cy={HUB.cy} r="3" fill="#fbeac0" />
        </g>
        <text
          x={HUB.cx}
          y={HUB.cy + 32}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="12"
          fontWeight="700"
          letterSpacing="2.4"
          fill="#1a1a1a"
        >
          Austin · HUB
        </text>
      </svg>

      {/* Cream scrim from the left edge — softer than before so
          the atlas reads through the headline column instead of
          being almost completely washed out. Just enough scrim to
          keep the body copy contrast comfortable; the network
          dots and pulses peek through. */}
      <div
        className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-cream/85 via-cream/45 to-transparent md:from-cream/85 md:via-cream/30 md:w-[46%]"
      />
      {/* Very subtle bottom fade — lighter than before so the
          Austin hub (now sitting in the lower portion of the
          canvas) reads cleanly all the way to the section edge
          where it's most likely to be visible. */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-cream/70 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// City marker
// ---------------------------------------------------------------------------

function CityMarker({ city, reduced }: { city: City; reduced: boolean }): JSX.Element {
  const labelX = city.cx + (city.labelDx ?? 0);
  const labelY = city.cy + (city.labelDy ?? 22);
  return (
    <g>
      <g filter="url(#atlas-dot-shadow)">
        <circle
          cx={city.cx}
          cy={city.cy}
          r="11"
          fill="#e0a526"
          opacity="0.18"
          className={
            !reduced
              ? "[animation:delivered-pulse_3400ms_ease-out_infinite]"
              : ""
          }
          style={{
            transformOrigin: `${city.cx}px ${city.cy}px`,
            animationDelay: `${city.delaySec}s`,
          }}
        />
        <circle cx={city.cx} cy={city.cy} r="5" fill="#1a1a1a" />
        <circle cx={city.cx} cy={city.cy} r="1.8" fill="#fbeac0" />
      </g>
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="10"
        fontWeight="600"
        letterSpacing="1.8"
        fill="#1a1a1a"
        opacity="0.6"
      >
        {city.name}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function routePath(from: City, to: City): string {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const mx = (from.cx + to.cx) / 2;
  const my = (from.cy + to.cy) / 2;
  const len = Math.hypot(dx, dy);
  const bow = Math.min(90, len * 0.18);
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
// Background constellation — handcrafted positions tuned to this
// 1600×700 viewBox. Light density, slightly heavier in the empty
// upper-left and lower-right corners.
// ---------------------------------------------------------------------------

const CONSTELLATION_DOTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [80, 70, 1.2, 0.14],
  [200, 38, 1.4, 0.16],
  [360, 80, 1, 0.1],
  [500, 50, 1.2, 0.14],
  [680, 90, 1, 0.1],
  [840, 50, 1.3, 0.16],
  [1020, 100, 1, 0.1],
  [1200, 60, 1.2, 0.14],
  [1380, 100, 1, 0.1],
  [1520, 70, 1.3, 0.14],
  [60, 220, 1, 0.1],
  [1520, 280, 1.2, 0.14],
  [120, 600, 1.3, 0.16],
  [80, 660, 1, 0.1],
  [340, 640, 1.2, 0.14],
  [560, 630, 1, 0.1],
  [780, 660, 1.1, 0.12],
  [1500, 620, 1.2, 0.14],
  [1440, 670, 1, 0.1],
  [1280, 650, 1.1, 0.12],
];
