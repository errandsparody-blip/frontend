import Link from "next/link";

import { Button } from "@/components/ui/button";

function FooterCol({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text">
        {heading}
      </div>
      <ul className="mt-3 flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-body-sm text-text-muted transition-colors hover:text-amber"
      >
        {children}
      </Link>
    </li>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-cream-soft/90 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[84rem] items-center justify-between px-8">
          <Link href="/" className="text-[18px] font-bold tracking-[0.5px] text-ink">
            USA ERRANDS
          </Link>
          <div className="hidden gap-10 font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-text md:flex">
            <Link href="/how-it-works" className="hover:text-amber transition-colors">How it works</Link>
            <Link href="/pricing" className="hover:text-amber transition-colors">Pricing</Link>
            {/* Personal Shopper — separate consumer-direct product. Distinct
                visual treatment so it reads as a service, not a marketing tab. */}
            <Link
              href="/shopper"
              className="rounded-sm border border-amber/40 bg-amber/10 px-2.5 py-0.5 text-amber transition-colors hover:bg-amber/20"
            >
              Shop for me
            </Link>
            <Link href="/integrations" className="hover:text-amber transition-colors">Integrations</Link>
            <Link href="/security" className="hover:text-amber transition-colors">Security</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-text hover:text-amber sm:inline"
            >
              Log in
            </Link>
            <Link href="/signup">
              <Button variant="amber" size="md" withArrow>
                Get started
              </Button>
            </Link>
          </div>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-line bg-cream-soft py-12">
        <div className="mx-auto flex max-w-[84rem] flex-col gap-10 px-8">
          <div className="grid gap-10 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <div>
              <div className="text-[18px] font-bold tracking-[0.5px] text-ink">USA ERRANDS</div>
              <p className="mt-2 max-w-md text-body-sm text-text-muted">
                U.S.-based logistics infrastructure for international sellers, plus a personal-shopper service for buyers anywhere.
              </p>
            </div>
            <FooterCol heading="Sellers">
              <FooterLink href="/how-it-works">How it works</FooterLink>
              <FooterLink href="/pricing">Pricing</FooterLink>
              <FooterLink href="/integrations">Integrations</FooterLink>
              <FooterLink href="/signup">Get started</FooterLink>
            </FooterCol>
            <FooterCol heading="Buyers">
              <FooterLink href="/shopper">Shop for me</FooterLink>
              <FooterLink href="/track">Track a shipment</FooterLink>
            </FooterCol>
            <FooterCol heading="Trust">
              <FooterLink href="/security">Security</FooterLink>
              <FooterLink href="/legal/terms">Terms</FooterLink>
              <FooterLink href="/legal/privacy">Privacy</FooterLink>
            </FooterCol>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-6 font-mono text-mono-label text-text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>v0.1.0 (P0 foundations)</span>
            <span className="text-text-subtle">© 2026 USA Errands</span>
          </div>
        </div>
      </footer>
    </>
  );
}
