import Link from "next/link";

import { SiteLogo } from "@/components/brand/site-logo";
import { HeaderCTA } from "@/components/marketing/header-cta";
import { MobileNav } from "@/components/marketing/mobile-nav";
import { PillNavLinks } from "@/components/marketing/pill-nav-links";

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
      {/* Floating pill header (Cillo-inspired): a single rounded bar
          that sits just below the top edge, translucent so the warm
          hero shows through, with the logo left, active-aware links
          centered, and the auth CTA right. `bg-white/70 + backdrop-blur`
          keeps it legible over both the tan hero and the cream interior
          pages. */}
      <header className="sticky top-3 z-50 px-3 sm:px-5">
        <nav className="ue-drop-in mx-auto flex h-16 max-w-[84rem] items-center justify-between gap-4 rounded-full border border-white/40 bg-white/70 pl-5 pr-3 backdrop-blur-md">
          <Link href="/" aria-label="USA Errands — home">
            <SiteLogo tone="ink" />
          </Link>

          <PillNavLinks />

          <div className="flex items-center gap-2 sm:gap-3">
            {/* CTA hides on phones (it crowded the logo); the hamburger
                drawer carries Get started + Log in there instead. */}
            <div className="hidden md:flex md:items-center md:gap-3">
              <HeaderCTA />
            </div>
            <MobileNav />
          </div>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="border-t border-line bg-cream-soft py-12">
        <div className="mx-auto flex max-w-[84rem] flex-col gap-10 px-8">
          <div className="grid gap-10 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div>
              <SiteLogo tone="ink" />
              <p className="mt-3 max-w-md text-body-sm text-text-muted">
                U.S.-based logistics infrastructure for international sellers,
                plus a personal-shopper service for buyers anywhere.
              </p>
            </div>
            <FooterCol heading="Company">
              <FooterLink href="/about">About</FooterLink>
              <FooterLink href="/services">Services</FooterLink>
              <FooterLink href="/faq">FAQ</FooterLink>
              <FooterLink href="/contact">Contact</FooterLink>
            </FooterCol>
            <FooterCol heading="Sellers">
              <FooterLink href="/how-it-works">How it works</FooterLink>
              <FooterLink href="/pricing">Pricing</FooterLink>
              <FooterLink href="/integrations">Store integration</FooterLink>
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
            <span></span>
            <span className="text-text-subtle">© 2026 USA Errands</span>
          </div>
        </div>
      </footer>
    </>
  );
}
