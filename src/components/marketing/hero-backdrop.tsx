/**
 * HeroBackdrop — subtle depth behind the homepage hero.
 *
 * Sits absolutely behind the hero content (the parent hero section is
 * `relative overflow-hidden`, and the content sits at a higher z-index).
 * Three ingredients, all cheap and asset-free:
 *   1. A warm radial glow top-center — lifts the headline off the flat tan.
 *   2. A few large, heavily-blurred "bokeh" blobs that drift slowly so
 *      something is always gently moving without pulling focus.
 *   3. A faint arcing route line (SVG) nodding to the shipping story.
 *
 * Server-component-safe: pure CSS animations (keyframes in globals.css),
 * no hooks. Marked aria-hidden — purely decorative.
 */

import type { JSX } from "react";

export function HeroBackdrop(): JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Warm radial glow, top-center. */}
      <div
        className="absolute left-1/2 top-[-10%] h-[560px] w-[880px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,248,233,0.7), rgba(255,248,233,0) 70%)",
        }}
      />

      {/* Drifting soft blobs — blurred, warm tones, a touch more present. */}
      <div
        className="ue-float-1 absolute left-[8%] top-[22%] h-72 w-72 rounded-full"
        style={{ background: "rgba(243,229,204,0.7)", filter: "blur(60px)", animation: "ue-float-1 16s ease-in-out infinite" }}
      />
      <div
        className="ue-float-2 absolute right-[9%] top-[10%] h-80 w-80 rounded-full"
        style={{ background: "rgba(228,212,184,0.62)", filter: "blur(72px)", animation: "ue-float-2 20s ease-in-out infinite" }}
      />
      <div
        className="ue-float-3 absolute left-[36%] top-[38%] h-64 w-64 rounded-full"
        style={{ background: "rgba(201,148,40,0.22)", filter: "blur(66px)", animation: "ue-float-3 24s ease-in-out infinite" }}
      />

      {/* Faint arcing route line — a whisper of the shipping story. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 760"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          className="ue-route"
          d="M-40 520 C 360 340, 780 300, 1160 180 S 1520 60, 1520 60"
          stroke="rgba(255,250,240,0.5)"
          strokeWidth="1.5"
          strokeDasharray="2 10"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
