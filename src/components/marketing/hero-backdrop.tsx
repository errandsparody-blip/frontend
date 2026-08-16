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
        className="absolute left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,247,232,0.55), rgba(255,247,232,0) 70%)",
        }}
      />

      {/* Drifting soft blobs — blurred, low-opacity, warm tones. */}
      <div
        className="ue-float-1 absolute left-[8%] top-[22%] h-64 w-64 rounded-full"
        style={{ background: "rgba(240,226,201,0.5)", filter: "blur(60px)", animation: "ue-float-1 16s ease-in-out infinite" }}
      />
      <div
        className="ue-float-2 absolute right-[10%] top-[12%] h-72 w-72 rounded-full"
        style={{ background: "rgba(226,210,182,0.45)", filter: "blur(70px)", animation: "ue-float-2 20s ease-in-out infinite" }}
      />
      <div
        className="ue-float-3 absolute left-[38%] top-[40%] h-56 w-56 rounded-full"
        style={{ background: "rgba(201,148,40,0.14)", filter: "blur(65px)", animation: "ue-float-3 24s ease-in-out infinite" }}
      />

      {/* Faint arcing route line — a whisper of the shipping story. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 760"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M-40 520 C 360 340, 780 300, 1160 180 S 1520 60, 1520 60"
          stroke="rgba(255,250,240,0.35)"
          strokeWidth="1.5"
          strokeDasharray="2 10"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
