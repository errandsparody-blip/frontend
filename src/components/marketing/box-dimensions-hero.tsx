/**
 * BoxDimensionsHero — proportional storage-tier visualisation.
 *
 * Inline SVG so the image:
 *   - stays crisp on any display
 *   - inherits theme colours via CSS custom props
 *   - has zero network cost (no separate asset to load)
 *   - never gets stale relative to the seed data
 *
 * The drawing has TWO sections:
 *   1. A row showing the four approved box tiers next to a 5'9" / 175 cm
 *      person silhouette so vendors can see roughly how big each box is.
 *   2. A standard U.S. pallet (40 × 48 in) with the 60 in max stack height.
 *
 * The proportional heights are computed from the real `inches` values
 * pulled from the FALLBACK_TIERS data — so if finance ever bumps a
 * dimension in the admin config, swapping the source array keeps the
 * picture aligned with reality. The boxes' depth ("3D effect") is a
 * fixed skew percentage and isn't dimensionally accurate; it's purely
 * decorative to convey "this is a box, not a flat rectangle."
 */

import { FALLBACK_TIERS, type StorageTierKey } from "@/lib/storage-tiers";

// Person height anchor — used as the scale baseline. 5'9" = 69 in.
const PERSON_HEIGHT_IN = 69;
// Person rendered height in SVG units. Everything else scales off this.
const PERSON_HEIGHT_SVG = 220;

// Pixels-per-inch derived from the anchor. Used for every box.
const PX_PER_INCH = PERSON_HEIGHT_SVG / PERSON_HEIGHT_IN;

// Inches → centimetres rounded to the nearest whole cm. Mirrors the
// rounding used on the marketing pricing page so the labels match.
function inToCm(inches: number): number {
  return Math.round(inches * 2.54);
}

interface TierEntry {
  key: Exclude<StorageTierKey, "PALLET">;
  label: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

const TIERS: TierEntry[] = [
  {
    key: "SMALL",
    label: "Small",
    lengthIn: FALLBACK_TIERS.dimensions!.SMALL.lengthIn,
    widthIn: FALLBACK_TIERS.dimensions!.SMALL.widthIn,
    heightIn: FALLBACK_TIERS.dimensions!.SMALL.heightIn,
  },
  {
    key: "MEDIUM",
    label: "Medium",
    lengthIn: FALLBACK_TIERS.dimensions!.MEDIUM.lengthIn,
    widthIn: FALLBACK_TIERS.dimensions!.MEDIUM.widthIn,
    heightIn: FALLBACK_TIERS.dimensions!.MEDIUM.heightIn,
  },
  {
    key: "LARGE",
    label: "Large",
    lengthIn: FALLBACK_TIERS.dimensions!.LARGE.lengthIn,
    widthIn: FALLBACK_TIERS.dimensions!.LARGE.widthIn,
    heightIn: FALLBACK_TIERS.dimensions!.LARGE.heightIn,
  },
  {
    key: "X_LARGE",
    label: "X-Large",
    lengthIn: FALLBACK_TIERS.dimensions!.X_LARGE.lengthIn,
    widthIn: FALLBACK_TIERS.dimensions!.X_LARGE.widthIn,
    heightIn: FALLBACK_TIERS.dimensions!.X_LARGE.heightIn,
  },
];

export function BoxDimensionsHero(): JSX.Element {
  // Layout — boxes sit on a common ground line. The person sits on the
  // same baseline so heights are visually comparable.
  const GROUND = 290;
  const PERSON_X = 50;
  const PERSON_W = 50;
  // Start the boxes after the person + a small gap.
  const FIRST_BOX_X = PERSON_X + PERSON_W + 60;
  // Per-box horizontal slot (box width + label gutter).
  const SLOT_W = 165;

  return (
    <figure className="rounded-md border border-line bg-cream-soft p-6 md:p-8">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <div>
          <div className="font-mono text-mono-eyebrow uppercase tracking-[1.6px] text-amber">
            Storage tiers · to scale
          </div>
          <h3 className="mt-1 text-h3 font-medium leading-tight text-ink">
            Box dimensions
          </h3>
        </div>
        <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          All measurements: inches (in) · centimetres (cm)
        </span>
      </figcaption>

      <svg
        viewBox="0 0 800 360"
        xmlns="http://www.w3.org/2000/svg"
        className="block h-auto w-full"
        role="img"
        aria-label="Storage tier box dimensions, drawn to scale against a 5 foot 9 inch person silhouette."
      >
        {/* Soft ground line — the surface every object rests on. */}
        <line
          x1={20}
          y1={GROUND}
          x2={780}
          y2={GROUND}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={1}
        />

        {/* ----- Person silhouette + height callout ----- */}
        <Person x={PERSON_X} groundY={GROUND} height={PERSON_HEIGHT_SVG} width={PERSON_W} />
        <PersonHeightCallout x={PERSON_X - 24} groundY={GROUND} height={PERSON_HEIGHT_SVG} />

        {/* ----- Four boxes ----- */}
        {TIERS.map((t, i) => {
          const xCenter = FIRST_BOX_X + SLOT_W * i + SLOT_W / 2;
          return (
            <BoxIllustration
              key={t.key}
              tier={t}
              centerX={xCenter}
              groundY={GROUND}
            />
          );
        })}
      </svg>

      {/* Per-tier labels below the SVG — kept as semantic HTML so screen
          readers + selection-copy work properly without inline SVG <text>. */}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {TIERS.map((t) => (
          <div
            key={t.key}
            className="rounded-sm border border-line bg-white p-3"
          >
            <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
              {t.label}
            </div>
            <div className="mt-1 font-mono text-body text-ink">
              {t.lengthIn} × {t.widthIn} × {t.heightIn} in
            </div>
            <div className="font-mono text-caption text-text-muted">
              {inToCm(t.lengthIn)} × {inToCm(t.widthIn)} × {inToCm(t.heightIn)} cm
            </div>
          </div>
        ))}
      </div>

      {/* Standard pallet — separate block so the box row stays readable
          even on narrow viewports. The pallet drawing is intentionally
          schematic; the numbers do the heavy lifting. */}
      <div className="mt-6 rounded-sm border border-line bg-white p-5">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_220px]">
          <div>
            <div className="font-mono text-mono-eyebrow uppercase tracking-[1.6px] text-amber">
              Standard U.S. Pallet
            </div>
            <h4 className="mt-1 text-h3 font-medium leading-tight text-ink">
              40 × 48 in (102 × 122 cm)
            </h4>
            <p className="mt-2 text-body-sm text-text-muted">
              Max recommended stacked height: <strong className="text-ink">60 in (152 cm)</strong>{" "}
              including the pallet itself. All boxes on a pallet must be
              the same tier — see pallet rules below for the per-tier
              maximum count.
            </p>
          </div>
          <svg
            viewBox="0 0 220 160"
            xmlns="http://www.w3.org/2000/svg"
            className="block h-auto w-full max-w-[220px] justify-self-start md:justify-self-end"
            role="img"
            aria-label="Standard U.S. pallet 40 by 48 inches, max 60 inches stacked."
          >
            <PalletIllustration />
          </svg>
        </div>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Box illustration — isometric-ish cuboid drawn at the requested height
// and footprint. Width on screen is `widthIn × PX_PER_INCH`, height is
// `heightIn × PX_PER_INCH`; depth is fixed at 35% of width so the boxes
// stay legible without dominating the row.
// ---------------------------------------------------------------------------

function BoxIllustration({
  tier,
  centerX,
  groundY,
}: {
  tier: TierEntry;
  centerX: number;
  groundY: number;
}): JSX.Element {
  const w = tier.widthIn * PX_PER_INCH;
  const h = tier.heightIn * PX_PER_INCH;
  const d = w * 0.35; // 3D "depth" — purely decorative.
  // Front face anchored on the ground line, horizontally centred in slot.
  const frontLeft = centerX - w / 2;
  const frontTop = groundY - h;
  const frontRight = frontLeft + w;
  return (
    <g>
      {/* Top face — parallelogram pulled up-right. */}
      <polygon
        points={`
          ${frontLeft},${frontTop}
          ${frontRight},${frontTop}
          ${frontRight + d},${frontTop - d}
          ${frontLeft + d},${frontTop - d}
        `}
        fill="#D7BFA2"
        stroke="#0F0F0E"
        strokeWidth={1}
      />
      {/* Right side face — also a parallelogram. */}
      <polygon
        points={`
          ${frontRight},${frontTop}
          ${frontRight + d},${frontTop - d}
          ${frontRight + d},${groundY - d}
          ${frontRight},${groundY}
        `}
        fill="#C3A480"
        stroke="#0F0F0E"
        strokeWidth={1}
      />
      {/* Front face — main rectangle. */}
      <rect
        x={frontLeft}
        y={frontTop}
        width={w}
        height={h}
        fill="#E5CEAF"
        stroke="#0F0F0E"
        strokeWidth={1}
      />
      {/* Tape seam down the centre — subtle realism. */}
      <line
        x1={centerX}
        y1={frontTop}
        x2={centerX}
        y2={groundY}
        stroke="#0F0F0E"
        strokeOpacity={0.18}
        strokeWidth={1}
      />
      {/* Height dimension callout on the right of the box. */}
      <DimensionLine
        x={frontRight + d + 8}
        y1={frontTop - d}
        y2={groundY - d}
        label={`${tier.heightIn} in`}
        sublabel={`${inToCm(tier.heightIn)} cm`}
      />
      {/* Width dimension callout under the box. */}
      <WidthCallout
        cx={centerX}
        y={groundY + 14}
        width={w}
        label={`${tier.widthIn} in`}
        sublabel={`${inToCm(tier.widthIn)} cm`}
      />
    </g>
  );
}

function DimensionLine({
  x,
  y1,
  y2,
  label,
  sublabel,
}: {
  x: number;
  y1: number;
  y2: number;
  label: string;
  sublabel: string;
}): JSX.Element {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#0F0F0E" strokeWidth={1} />
      {/* Caps at the top + bottom of the dimension line. */}
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke="#0F0F0E" strokeWidth={1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke="#0F0F0E" strokeWidth={1} />
      <text
        x={x + 8}
        y={(y1 + y2) / 2}
        fontSize={11}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#0F0F0E"
      >
        {label}
      </text>
      <text
        x={x + 8}
        y={(y1 + y2) / 2 + 12}
        fontSize={9}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#777270"
      >
        {sublabel}
      </text>
    </g>
  );
}

function WidthCallout({
  cx,
  y,
  width,
  label,
  sublabel,
}: {
  cx: number;
  y: number;
  width: number;
  label: string;
  sublabel: string;
}): JSX.Element {
  const left = cx - width / 2;
  const right = cx + width / 2;
  return (
    <g>
      <line x1={left} y1={y} x2={right} y2={y} stroke="#0F0F0E" strokeWidth={1} />
      <line x1={left} y1={y - 4} x2={left} y2={y + 4} stroke="#0F0F0E" strokeWidth={1} />
      <line x1={right} y1={y - 4} x2={right} y2={y + 4} stroke="#0F0F0E" strokeWidth={1} />
      <text
        x={cx}
        y={y + 16}
        fontSize={11}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#0F0F0E"
        textAnchor="middle"
      >
        {label}
      </text>
      <text
        x={cx}
        y={y + 28}
        fontSize={9}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#777270"
        textAnchor="middle"
      >
        {sublabel}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Person silhouette — minimal geometric shapes, no inline raster art.
// Rendered at exactly `height` SVG units tall so the boxes can scale
// relative to it.
// ---------------------------------------------------------------------------

function Person({
  x,
  groundY,
  height,
  width,
}: {
  x: number;
  groundY: number;
  height: number;
  width: number;
}): JSX.Element {
  // Anatomy proportions tuned visually. Head ≈ 14% of height, torso ≈ 28%,
  // legs the rest. Width is centred on `x`.
  const headR = height * 0.07;
  const headCx = x + width / 2;
  const headCy = groundY - height + headR;
  const shoulderY = headCy + headR + 4;
  const waistY = shoulderY + height * 0.28;
  return (
    <g fill="#0F0F0E">
      {/* Head */}
      <circle cx={headCx} cy={headCy} r={headR} />
      {/* Torso */}
      <rect
        x={headCx - width * 0.32}
        y={shoulderY}
        width={width * 0.64}
        height={waistY - shoulderY}
        rx={6}
      />
      {/* Left leg */}
      <rect
        x={headCx - width * 0.3}
        y={waistY}
        width={width * 0.22}
        height={groundY - waistY}
      />
      {/* Right leg */}
      <rect
        x={headCx + width * 0.08}
        y={waistY}
        width={width * 0.22}
        height={groundY - waistY}
      />
    </g>
  );
}

function PersonHeightCallout({
  x,
  groundY,
  height,
}: {
  x: number;
  groundY: number;
  height: number;
}): JSX.Element {
  return (
    <g>
      <line
        x1={x}
        y1={groundY - height}
        x2={x}
        y2={groundY}
        stroke="#0F0F0E"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <line
        x1={x - 4}
        y1={groundY - height}
        x2={x + 4}
        y2={groundY - height}
        stroke="#0F0F0E"
        strokeWidth={1}
      />
      <line
        x1={x - 4}
        y1={groundY}
        x2={x + 4}
        y2={groundY}
        stroke="#0F0F0E"
        strokeWidth={1}
      />
      <text
        x={x - 8}
        y={groundY - height / 2 - 8}
        fontSize={11}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#0F0F0E"
        textAnchor="end"
      >
        5&apos;9&quot;
      </text>
      <text
        x={x - 8}
        y={groundY - height / 2 + 4}
        fontSize={9}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#777270"
        textAnchor="end"
      >
        69 in
      </text>
      <text
        x={x - 8}
        y={groundY - height / 2 + 16}
        fontSize={9}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#777270"
        textAnchor="end"
      >
        175 cm
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Pallet illustration — schematic isometric drawing with dimension labels.
// ---------------------------------------------------------------------------

function PalletIllustration(): JSX.Element {
  // Stacked boxes on top — 3 visible layers, no individual dimension
  // callouts to keep the drawing legible.
  return (
    <g>
      {/* Stacked load — a single chunky cuboid representing "boxes on pallet". */}
      <polygon
        points="40,30 160,30 195,15 75,15"
        fill="#D7BFA2"
        stroke="#0F0F0E"
        strokeWidth={1}
      />
      <polygon
        points="160,30 195,15 195,105 160,120"
        fill="#C3A480"
        stroke="#0F0F0E"
        strokeWidth={1}
      />
      <rect
        x={40}
        y={30}
        width={120}
        height={90}
        fill="#E5CEAF"
        stroke="#0F0F0E"
        strokeWidth={1}
      />
      {/* Inner horizontal divider lines to suggest stacked boxes. */}
      <line x1={40} y1={60} x2={160} y2={60} stroke="#0F0F0E" strokeOpacity={0.18} />
      <line x1={40} y1={90} x2={160} y2={90} stroke="#0F0F0E" strokeOpacity={0.18} />
      {/* Pallet base — wooden slats. */}
      <rect x={30} y={120} width={140} height={6} fill="#8C6A47" />
      <rect x={30} y={130} width={140} height={6} fill="#8C6A47" />
      <rect x={42} y={126} width={8} height={4} fill="#6B4F35" />
      <rect x={150} y={126} width={8} height={4} fill="#6B4F35" />
      {/* Side dimension — max 60 in. */}
      <line x1={205} y1={15} x2={205} y2={136} stroke="#0F0F0E" />
      <line x1={201} y1={15} x2={209} y2={15} stroke="#0F0F0E" />
      <line x1={201} y1={136} x2={209} y2={136} stroke="#0F0F0E" />
      <text
        x={210}
        y={70}
        fontSize={10}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#0F0F0E"
      >
        60 in
      </text>
      <text
        x={210}
        y={82}
        fontSize={9}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#777270"
      >
        152 cm
      </text>
      {/* Footprint dimensions — 48 in front × 40 in depth. */}
      <text
        x={100}
        y={150}
        fontSize={10}
        fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
        fill="#0F0F0E"
        textAnchor="middle"
      >
        48 in (122 cm)
      </text>
    </g>
  );
}
