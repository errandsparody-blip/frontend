/**
 * HeroArches — the row of arch-topped image frames beneath the homepage
 * hero headline (Cillo-inspired editorial layout).
 *
 * Each arch carries one beat of the fulfillment journey, left-to-right:
 * parcel → warehouse → doorstep → global → customer. The middle arch is
 * tallest; heights taper outward so the row reads as a gentle arc.
 *
 * Image slots: drop a warm, brightly-lit cinematic render (or real photo)
 * at the `src` path for each arch and it replaces the placeholder. Until
 * then each arch shows a warm fill + icon + label so the layout looks
 * intentional, never broken. Recommended asset: portrait ~600×900 webp,
 * warm tan/cream tones, subject centered in the upper two-thirds (the
 * arch crops the top into a dome). See the notes handed over in chat for
 * per-arch prompts.
 *
 * Server-component-safe — no hooks, no client JS. If you later want an
 * onError fallback you'll need to make this a client component; for now
 * we simply omit the <img> when `src` is null.
 */

import { Globe, Home, Package, Smile, Warehouse } from "lucide-react";
import type { JSX } from "react";

import { FadeUp } from "@/components/marketing/fade-up";

interface Arch {
  label: string;
  Icon: typeof Package;
  /** Warm placeholder fill shown until a real image is dropped in. */
  bg: string;
  /** Icon/label colour on that fill. */
  fg: string;
  /** Arch height in px on desktop — middle tallest, tapering out. */
  height: number;
  /** Public path to the render/photo. Null → styled placeholder. */
  src: string | null;
  /** Hidden on small screens to keep the row from crowding. */
  hideOnMobile?: boolean;
}

const ARCHES: ReadonlyArray<Arch> = [
  { label: "Your parcel", Icon: Package, bg: "#e8d9c3", fg: "#4a4136", height: 380, src: "/hero/parcel.webp", hideOnMobile: true },
  { label: "Our warehouse", Icon: Warehouse, bg: "#d9e0d2", fg: "#3b4548", height: 440, src: "/hero/warehouse.webp" },
  { label: "Their doorstep", Icon: Home, bg: "#ecdcc4", fg: "#4a4136", height: 500, src: "/hero/doorstep.webp" },
  { label: "Anywhere", Icon: Globe, bg: "#ecdcc0", fg: "#4a4136", height: 440, src: "/hero/anywhere.webp" },
  { label: "Happy buyer", Icon: Smile, bg: "#e7d3bf", fg: "#4a4136", height: 380, src: "/hero/happy-buyer.webp", hideOnMobile: true },
];

export function HeroArches(): JSX.Element {
  return (
    <div className="mx-auto -mb-16 mt-20 flex max-w-[84rem] items-end justify-center gap-3 px-4 sm:-mb-20 sm:mt-24 sm:gap-4 sm:px-8">
      {ARCHES.map((a, i) => (
        <FadeUp
          key={a.label}
          // Staggered so the arches rise in one-by-one, left to right.
          delay={i * 140}
          translateY={40}
          durationMs={700}
          className={"flex-1 " + (a.hideOnMobile ? "hidden sm:block" : "block")}
        >
          <div
            className={
              // Soft warm drop shadow (drop-shadow follows the domed shape,
              // unlike box-shadow). On hover the arch lifts + scales and the
              // shadow deepens — a tactile "pop". Shadow lives in classes,
              // not inline style, so the hover variant can override it.
              "group/arch relative w-full cursor-pointer overflow-hidden " +
              "transition-[transform,filter] duration-300 ease-out " +
              "[filter:drop-shadow(0_16px_28px_rgba(74,54,40,0.28))] " +
              "hover:-translate-y-2 hover:scale-[1.03] " +
              "hover:[filter:drop-shadow(0_28px_46px_rgba(74,54,40,0.42))]"
            }
            style={{
              height: a.height,
              background: a.bg,
              // Full dome on top, gently rounded at the base.
              borderRadius: "9999px 9999px 14px 14px",
            }}
          >
            {a.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.src}
                alt={a.label}
                className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover/arch:scale-105"
              />
            ) : (
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-2 pt-16"
                style={{ color: a.fg }}
              >
                <a.Icon className="h-7 w-7" aria-hidden />
                <span className="font-mono text-[10px] uppercase tracking-[1.2px]">
                  {a.label}
                </span>
              </div>
            )}
          </div>
        </FadeUp>
      ))}
    </div>
  );
}
