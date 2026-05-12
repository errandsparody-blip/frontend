"use client";

/**
 * FadeUp — scroll-triggered fade-up animation for marketing sections.
 *
 * Wraps any child in a div that starts hidden (opacity 0, translated
 * down 24px) and animates to visible on first viewport entry. After
 * playing once, it stays visible — re-animating on every scroll is
 * distracting on a marketing site.
 *
 * Why hand-roll instead of `framer-motion`? The marketing bundle stays
 * tiny (~50 LOC instead of ~50 KB), and the animation is minimal by
 * design — just a single fade-up, no spring physics or stagger.
 *
 * Respects `prefers-reduced-motion`: if the user opted out, children
 * render visible from the start with no animation at all.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  /** Delay (ms) before the animation starts after entering view. */
  delay?: number;
  /** Override the default 0.6s duration. */
  durationMs?: number;
  /** Override the default 24px translate. */
  translateY?: number;
  /** Extra classes for the wrapper (most callers leave this undefined). */
  className?: string;
}

export function FadeUp({
  children,
  delay = 0,
  durationMs = 600,
  translateY = 24,
  className,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  // Default to visible during SSR so the page is fully rendered for
  // search engines and the no-JS path. We flip to hidden in a
  // useLayoutEffect *before* the browser paints, then the observer
  // flips back to visible when the section enters view.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Honour the user's accessibility preference. If they don't want
    // motion, leave `visible: true` (the SSR default) and skip the
    // observer entirely.
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return;

    setVisible(false);

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            // 50ms minimum delay so a section that's already in view
            // on first paint (above the fold) still gets the animation
            // rather than snapping in.
            window.setTimeout(() => setVisible(true), Math.max(delay, 50));
            observer.disconnect();
          }
        }
      },
      {
        // Trigger a little before the section actually enters the
        // viewport — feels more responsive than waiting until the top
        // edge crosses the threshold.
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.05,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : `translateY(${translateY}px)`,
        transition: `opacity ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        // `will-change` ahead of the animation gives the compositor a
        // hint to promote the layer. We clear it after the transition
        // so we don't keep idle layers around.
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
