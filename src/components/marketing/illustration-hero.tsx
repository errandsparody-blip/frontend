"use client";

/**
 * IllustrationHero — bespoke editorial illustration of the warehouse-
 * to-doorstep flow, with three subtle continuous animations.
 *
 * The alternative to LiveOpsHero. Less product-proof, more brand /
 * mood. A single hand-coded SVG composition in the brand palette:
 *
 *   - LEFT: a stylised warehouse silhouette (roof + loading bay + a
 *     small "USAE" letterform on the wall).
 *   - CENTER: a dashed amber arc curving from the warehouse roof up
 *     and across to the doorstep on the right. The arc draws itself
 *     in once on mount.
 *   - RIGHT: a stylised house facade with a delivered package on
 *     the doorstep, and a pulsing green checkmark above it.
 *   - TOP-RIGHT: a small mono label badge with the avg ship time.
 *   - Background: cream-to-amber gradient + a faint scattered
 *     constellation pattern echoing the section's `bg-constellation`.
 *
 * Continuous motion:
 *   1. Arc: `stroke-dashoffset` draw-in on first paint, then idle.
 *   2. Package icon: travels along the arc on a 7 s loop using
 *      CSS `offset-path` (modern browsers; degrades gracefully).
 *   3. Checkmark: a soft `delivered-pulse` scale-and-fade loop.
 *
 * Motion is gated by `prefers-reduced-motion` — when set, the arc
 * paints fully drawn from the start, the package stays at the
 * destination, and the checkmark holds at rest.
 *
 * To iterate, edit the labels at the bottom or tweak the arc path
 * (search `ARC_PATH`). The illustration is one SVG; no rasterised
 * assets, scales perfectly at any size.
 */

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Geometry — central path used for both the visible arc stroke and the
// package's `offset-path` travel. Keep them in sync if you edit one.
// ---------------------------------------------------------------------------

const ARC_PATH = "M 220 290 Q 400 80 600 410";

// Approximate length of the arc above. We don't need it pixel-perfect
// — it just has to be ≥ the actual path length so the dashoffset
// animation starts fully hidden. SVG `pathLength` lets us normalise
// the dash math regardless of the path's real length.
const ARC_PATH_LENGTH = 1;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IllustrationHero(): JSX.Element {
  const reduced = useReducedMotion();
  // Trigger the draw-in animation on mount by flipping a state bit
  // one tick after first paint. Without the tick, the initial render
  // already has the "drawn" state and we see nothing animate.
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setDrawn(true);
      return;
    }
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, [reduced]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-gradient-to-br from-cream-soft via-cream to-amber/15 shadow-2">
      <svg
        viewBox="0 0 800 600"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 h-full w-full"
        aria-label="A stylised warehouse on the left, a dashed amber arc curving across the canvas, and a doorstep on the right where a delivered package sits beneath a green checkmark."
        role="img"
      >
        <defs>
          {/* Soft drop shadow used by the warehouse + house silhouettes. */}
          <filter id="softShadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1a1a1a" floodOpacity="0.06" />
          </filter>
        </defs>

        {/* ----- BACKGROUND: faint constellation pattern -----
            Scattered dots in two opacities give the cream backdrop
            a quiet editorial texture without competing with the
            foreground composition. */}
        <g aria-hidden>
          {CONSTELLATION_DOTS.map(([cx, cy, r, opacity], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="#1a1a1a" opacity={opacity} />
          ))}
        </g>

        {/* ----- HORIZON LINE -----
            A subtle ground plane. The warehouse and house both sit
            on it so the composition reads as one scene. */}
        <line
          x1="40"
          y1="500"
          x2="760"
          y2="500"
          stroke="#1a1a1a"
          strokeOpacity="0.1"
          strokeWidth="1"
        />

        {/* ----- WAREHOUSE (left third) ----- */}
        <g filter="url(#softShadow)">
          {/* Walls — rounded rectangle for an editorial feel. */}
          <rect
            x="100"
            y="320"
            width="220"
            height="180"
            rx="4"
            fill="#f5efe5"
            stroke="#1a1a1a"
            strokeWidth="2"
          />
          {/* Roof — a low chevron sitting on top of the walls. */}
          <path
            d="M 92 322 L 210 250 L 328 322 Z"
            fill="#fbeac0"
            stroke="#1a1a1a"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Loading bay door — amber, the only saturated colour in
              the warehouse, draws the eye to where parcels leave. */}
          <rect
            x="170"
            y="400"
            width="80"
            height="100"
            rx="2"
            fill="#e0a526"
          />
          {/* Door slats — visual texture only. */}
          {[412, 428, 444, 460, 476, 492].map((y, i) => (
            <line
              key={i}
              x1="170"
              y1={y}
              x2="250"
              y2={y}
              stroke="#1a1a1a"
              strokeOpacity="0.2"
              strokeWidth="1"
            />
          ))}
          {/* Window pair on the wall above the door. */}
          <rect x="124" y="350" width="30" height="22" rx="1" fill="#1a1a1a" opacity="0.7" />
          <rect x="266" y="350" width="30" height="22" rx="1" fill="#1a1a1a" opacity="0.7" />
        </g>

        {/* Brand mark on the warehouse — small monospace "USAE"
            painted on the wall, signals "this is our facility". */}
        <text
          x="210"
          y="392"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="11"
          fontWeight="600"
          letterSpacing="2"
          fill="#1a1a1a"
          opacity="0.65"
        >
          USAE · MIA
        </text>

        {/* ----- ARC ROUTE -----
            Dashed amber path from the warehouse roof to the doorstep.
            `stroke-dashoffset` runs from 1 → 0 on mount (using
            `pathLength=1` so the math is normalised). */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="#e0a526"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${ARC_PATH_LENGTH}`}
          strokeDashoffset={drawn ? "0" : `${ARC_PATH_LENGTH}`}
          pathLength={ARC_PATH_LENGTH}
          style={{
            transition: "stroke-dashoffset 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
            // Once drawn, switch to a long dashed pattern for the
            // editorial "shipping route" look. The transition above
            // only fires for `dashoffset`, so swapping `dasharray`
            // mid-flight after the draw is the cleanest way to get
            // both behaviours.
            strokeDasharray: drawn ? "8 6" : `${ARC_PATH_LENGTH}`,
          }}
        />

        {/* ----- PACKAGE TRAVELLING ALONG THE ARC -----
            A small parcel rectangle that uses CSS `offset-path` to
            follow the same curve as the route. Loops every 7 s.
            Hidden until the route has finished drawing in. */}
        <g
          className={cn(
            "transition-opacity duration-500",
            drawn ? "opacity-100" : "opacity-0",
          )}
          // The `offset-path` lives in inline style so we don't have
          // to add a class to globals.css just for one element. CSS
          // animation name is defined in globals — see `package-travel`.
          style={
            !reduced
              ? {
                  offsetPath: `path("${ARC_PATH}")`,
                  offsetDistance: "0%",
                  animation: "package-travel 7s linear infinite",
                }
              : {
                  // Reduced motion: park the parcel at the destination
                  // so the composition still tells the same story.
                  offsetPath: `path("${ARC_PATH}")`,
                  offsetDistance: "100%",
                }
          }
        >
          {/* The parcel itself — centred at origin so `offset-path`
              moves the centre along the curve, not the top-left
              corner. Rotated -2° for a slightly playful tilt. */}
          <g transform="translate(-14 -10) rotate(-2 14 10)">
            <rect width="28" height="20" rx="2" fill="#fbeac0" stroke="#1a1a1a" strokeWidth="1.5" />
            <line x1="0" y1="10" x2="28" y2="10" stroke="#1a1a1a" strokeWidth="1" />
            <line x1="14" y1="0" x2="14" y2="20" stroke="#1a1a1a" strokeWidth="1" />
          </g>
        </g>

        {/* ----- DESTINATION HOUSE (right third) ----- */}
        <g filter="url(#softShadow)">
          {/* Walls. */}
          <rect
            x="540"
            y="380"
            width="180"
            height="120"
            rx="3"
            fill="#f5efe5"
            stroke="#1a1a1a"
            strokeWidth="2"
          />
          {/* Pitched roof. */}
          <path
            d="M 532 382 L 630 308 L 728 382 Z"
            fill="#1a1a1a"
            opacity="0.85"
            stroke="#1a1a1a"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Door. */}
          <rect x="608" y="430" width="44" height="70" rx="2" fill="#1a1a1a" opacity="0.85" />
          <circle cx="644" cy="468" r="1.5" fill="#fbeac0" />
          {/* Side windows. */}
          <rect x="560" y="410" width="34" height="26" rx="1" fill="#1a1a1a" opacity="0.7" />
          <rect x="666" y="410" width="34" height="26" rx="1" fill="#1a1a1a" opacity="0.7" />
        </g>

        {/* Delivered parcel sitting on the doorstep. */}
        <g transform="translate(560 470)">
          <rect width="36" height="26" rx="2" fill="#fbeac0" stroke="#1a1a1a" strokeWidth="1.5" />
          <line x1="0" y1="13" x2="36" y2="13" stroke="#1a1a1a" strokeWidth="1" />
          <line x1="18" y1="0" x2="18" y2="26" stroke="#1a1a1a" strokeWidth="1" />
        </g>

        {/* Pulsing "delivered" checkmark above the doorstep. The
            outer circle uses the `delivered-pulse` keyframes (in
            globals.css) for a soft scale-and-fade. */}
        <g transform="translate(630 380)">
          <circle
            r="22"
            fill="#16a34a"
            opacity="0.18"
            className={!reduced ? "animate-[delivered-pulse_2200ms_ease-out_infinite]" : ""}
          />
          <circle r="14" fill="#16a34a" />
          <path
            d="M -5 0 L -1 4 L 6 -4"
            stroke="white"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* ----- LABELS -----
            Small mono labels for "Miami HQ" under the warehouse and
            "Delivered" near the checkmark. Tying the illustration
            back to the product copy without competing with the
            headline. */}
        <text
          x="210"
          y="540"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="11"
          fontWeight="600"
          letterSpacing="1.6"
          fill="#1a1a1a"
          opacity="0.55"
        >
          MIAMI HQ
        </text>
        <text
          x="630"
          y="540"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="11"
          fontWeight="600"
          letterSpacing="1.6"
          fill="#1a1a1a"
          opacity="0.55"
        >
          ANY DOORSTEP
        </text>

        {/* Ship-time badge near the arc apex — communicates the
            speed promise without yet another card or pill. */}
        <g transform="translate(400 90)">
          <rect
            x="-58"
            y="-13"
            width="116"
            height="26"
            rx="13"
            fill="#1a1a1a"
          />
          <text
            x="0"
            y="4"
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            fontWeight="600"
            letterSpacing="1.6"
            fill="#fbeac0"
          >
            AVG 4.2 DAYS
          </text>
        </g>
      </svg>

      {/* Amber tape — same brand accent strip used on every other
          marketing surface (logo, previous hero). Sits outside the
          SVG so it can use a `shadow-1` Tailwind class for depth. */}
      <div
        aria-hidden
        className="absolute -left-3 top-12 h-1.5 w-24 -rotate-6 bg-amber shadow-1"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Background constellation — handcrafted positions so the dots feel
// "designed" rather than algorithmic. Tuples: [cx, cy, r, opacity].
// ---------------------------------------------------------------------------

const CONSTELLATION_DOTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [72, 60, 1.2, 0.18],
  [148, 92, 1, 0.12],
  [220, 56, 1.4, 0.2],
  [336, 110, 1, 0.14],
  [462, 64, 1.2, 0.18],
  [538, 130, 1, 0.12],
  [612, 70, 1.4, 0.18],
  [700, 116, 1, 0.14],
  [760, 180, 1.2, 0.16],
  [60, 196, 1, 0.12],
  [128, 220, 1.4, 0.18],
  [728, 240, 1, 0.14],
  [50, 380, 1.2, 0.14],
  [86, 268, 1, 0.1],
  [752, 372, 1, 0.12],
  [392, 218, 1, 0.1],
  [468, 184, 1.2, 0.14],
  [44, 480, 1, 0.12],
  [758, 462, 1.4, 0.16],
];
