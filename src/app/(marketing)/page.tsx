import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-constellation">
        <div className="mx-auto grid max-w-[84rem] gap-12 px-8 py-24 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <h1 className="text-display-xl font-medium leading-[0.98] tracking-[-2px] text-ink">
              Ship from
              <br />
              anywhere.
              <br />
              <span className="text-amber">Sell to America.</span>
            </h1>
            <p className="mt-10 max-w-md text-body-lg text-text-muted">
              Hold your best-selling inventory in our U.S. warehouse. We pick, pack, and ship every order
              locally — no U.S. business required.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/signup">
                <Button variant="primary" size="lg" withArrow>
                  Get started
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button variant="outline" size="lg">
                  See how it works
                </Button>
              </Link>
            </div>
          </div>

          {/* Inline dashboard widget mockup. P1+ replaces this with a real preview. */}
          <div className="rounded-md border border-line bg-white">
            <div className="flex items-center gap-5 border-b border-line px-5 py-4">
              <span className="text-[14px] font-bold text-ink">UE</span>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[1.2px] text-ink">
                Overview
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                Inventory
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                Wallet
              </span>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between border-b border-line pb-4">
                <div>
                  <div className="text-[18px] font-medium text-ink">Active inventory</div>
                  <span className="mr-2 inline-block rounded-xs border border-line-strong bg-white px-2 py-0.5 font-mono text-[11px] text-text-muted">
                    Nov 1–30, 2025
                  </span>
                  <span className="inline-block rounded-xs bg-amber/10 px-2 py-0.5 font-mono text-[11px] text-amber">
                    +8.2% vs Oct
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
                    Units on hand
                  </div>
                  <div className="font-mono text-[24px] font-medium tabular-nums text-ink">12,480</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <KpiCell label="Apparel" value="$82,400" delta="↓ 12%" deltaTone="success" />
                <KpiCell label="Electronics" value="$61,200" delta="↑ 4%" deltaTone="error" />
              </div>
            </div>
            <div className="flex items-center justify-between bg-ink px-5 py-2.5 font-mono text-[10px] uppercase tracking-[1.4px] text-text-inv">
              <span className="flex items-center gap-2">
                <ColorTrio /> All systems operational
              </span>
              <span className="text-text-inv/60">Last sync: 14s ago</span>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="border-y border-line">
        <div className="mx-auto grid max-w-[84rem] grid-cols-2 lg:grid-cols-4">
          <Stat value="$2.1M" label="Inventory value managed" />
          <Stat value="340" label="Vendors trust the system" />
          <Stat value="4.2 days" label="Average inbound onboarding" amber />
          <Stat value="99.97%" label="Uptime. Not rounded" />
        </div>
      </section>

      {/* SECTION 02 — eyebrow + display */}
      <section className="mx-auto max-w-[84rem] px-8 py-24">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[02] How it works</div>
        <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-1px] text-ink">
          You ship. We hold. They get it tomorrow.
        </h2>
        <p className="mt-4 max-w-2xl text-body-lg text-text-muted">
          The path from international shelf to American front door, in four steps.
        </p>
      </section>
    </>
  );
}

function KpiCell(props: { label: string; value: string; delta: string; deltaTone: "success" | "error" }) {
  return (
    <div className="rounded-sm border border-line p-4">
      <div className="mb-3 flex items-start justify-between">
        <span className="text-body-sm font-medium text-text">{props.label}</span>
        <span
          className={
            "font-mono text-[11px] " +
            (props.deltaTone === "success" ? "text-success" : "text-error")
          }
        >
          {props.delta}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
          Current month
        </span>
        <span className="font-mono text-[16px] font-medium tabular-nums text-ink">{props.value}</span>
      </div>
    </div>
  );
}

function Stat({ value, label, amber }: { value: string; label: string; amber?: boolean }) {
  return (
    <div className="border-line p-12 [&:not(:last-child)]:border-r">
      <div className={"text-[40px] font-medium leading-none tabular-nums tracking-[-1.2px] " + (amber ? "text-amber" : "text-ink")}>
        {value}
      </div>
      <div className="mt-3 font-mono text-mono-label uppercase text-text-muted">{label}</div>
    </div>
  );
}

function ColorTrio() {
  return (
    <span className="inline-flex gap-px">
      <span className="inline-block h-2.5 w-2.5 bg-text-muted" />
      <span className="inline-block h-2.5 w-2.5 bg-black" />
      <span className="inline-block h-2.5 w-2.5 bg-amber" />
    </span>
  );
}
