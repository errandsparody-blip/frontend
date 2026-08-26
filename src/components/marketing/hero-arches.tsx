/**
 * HeroArches — the row of arch-topped image frames beneath the homepage
 * hero headline (Cillo-inspired editorial layout).
 *
 * Responsive behaviour:
 *   - Desktop (sm+): a static row of all five arches, gently staggered in
 *     on load. Middle arch tallest, tapering outward.
 *   - Mobile (<sm): the arches become a slow horizontal carousel (two
 *     copies of the set scrolling left forever) at smaller heights — only
 *     a couple fit on a phone, so the motion signals there's more to see.
 *
 * Each arch carries one beat of the fulfillment journey, left-to-right:
 * parcel → warehouse → doorstep → global → customer.
 *
 * Server-component-safe — no hooks. Images live in /public/hero.
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
}

const ARCHES: ReadonlyArray<Arch> = [
  { label: "Your parcel", Icon: Package, bg: "#e8d9c3", fg: "#4a4136", height: 380, src: "/hero/parcel.webp" },
  { label: "Our warehouse", Icon: Warehouse, bg: "#d9e0d2", fg: "#3b4548", height: 440, src: "/hero/warehouse.webp" },
  { label: "Their doorstep", Icon: Home, bg: "#ecdcc4", fg: "#4a4136", height: 500, src: "/hero/doorstep.webp" },
  { label: "Anywhere", Icon: Globe, bg: "#ecdcc0", fg: "#4a4136", height: 440, src: "/hero/anywhere.webp" },
  { label: "Happy buyer", Icon: Smile, bg: "#e7d3bf", fg: "#4a4136", height: 380, src: "/hero/happy-buyer.webp" },
];

/** One domed arch card. `widthClass` controls sizing (flex-1 on desktop,
 *  fixed width in the mobile carousel). `decorative` marks the duplicated
 *  copies in the carousel so screen readers don't read them twice. */
function ArchCard({
  a,
  height,
  widthClass,
  decorative,
}: {
  a: Arch;
  height: number;
  widthClass: string;
  decorative?: boolean;
}): JSX.Element {
  return (
    <div
      aria-hidden={decorative}
      className={
        "group/arch relative overflow-hidden " +
        widthClass +
        " transition-[transform,filter] duration-300 ease-out " +
        "[filter:drop-shadow(0_16px_28px_rgba(74,54,40,0.28))] " +
        "hover:-translate-y-2 hover:scale-[1.03] " +
        "hover:[filter:drop-shadow(0_28px_46px_rgba(74,54,40,0.42))]"
      }
      style={{ height, background: a.bg, borderRadius: "9999px 9999px 14px 14px" }}
    >
      {a.src ? (
        // Base zoom crops the image's own light top edge so it doesn't peek
        // through the dome; the subject stays centered.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.src}
          alt={decorative ? "" : a.label}
          className="h-full w-full scale-110 object-cover object-center transition-transform duration-500 ease-out group-hover/arch:scale-[1.16]"
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2 pt-16"
          style={{ color: a.fg }}
        >
          <a.Icon className="h-7 w-7" aria-hidden />
          <span className="font-mono text-[10px] uppercase tracking-[1.2px]">{a.label}</span>
        </div>
      )}
    </div>
  );
}

export function HeroArches(): JSX.Element {
  return (
    <>
      {/* Mobile — sliding carousel of all five. Smaller heights, two copies
          for a seamless loop; pauses on touch/hover. */}
      <div className="-mb-10 mt-14 overflow-hidden sm:hidden">
        <div className="ue-marquee flex w-max items-end gap-3 px-4">
          {[...ARCHES, ...ARCHES].map((a, i) => (
            <ArchCard
              key={`m-${i}`}
              a={a}
              height={Math.round(a.height * 0.5)}
              widthClass="w-[130px] shrink-0"
              decorative={i >= ARCHES.length}
            />
          ))}
        </div>
      </div>

      {/* Desktop — static row, gentle staggered fade-in. */}
      <div className="mx-auto -mb-20 mt-24 hidden max-w-[84rem] items-end justify-center gap-4 px-8 sm:flex">
        {ARCHES.map((a, i) => (
          <FadeUp
            key={a.label}
            delay={i * 120}
            translateY={40}
            durationMs={700}
            className="flex-1"
          >
            <ArchCard a={a} height={a.height} widthClass="w-full" />
          </FadeUp>
        ))}
      </div>
    </>
  );
}
