import Link from "next/link";

import { SiteLogo } from "@/components/brand/site-logo";
import { HeaderCTA } from "@/components/marketing/header-cta";
import { MobileNav } from "@/components/marketing/mobile-nav";
import { NavDropdown } from "@/components/marketing/nav-dropdown";

// Items shown under the "About" hover dropdown in the desktop header.
// Mirror this list in MobileNav so phones see the same surface area.
// Each item is a top-level marketing destination — Personal Shopper has
// its own product flow, 3PL Fulfillment routes to the seller landing
// material, and Integrations sits under About now (folded out of the
// top nav so the header isn't cluttered).
const ABOUT_ITEMS = [
  {
    href: "/services",
    label: "All services",
    description: "Personal shopping, 3PL fulfillment, and forwarding in one place.",
  },
  {
    href: "/shopper",
    label: "Personal shopping",
    description: "Buy anything from any U.S. store. We handle the rest.",
  },
  {
    href: "/how-it-works",
    label: "3PL fulfillment",
    description: "Hold your inventory in our warehouse, ship to U.S. buyers in days.",
  },
  // {
  //   href: "/integrations",
  //   label: "Integrations",
  //   description: "Shopify, WooCommerce, and the storefronts we connect to.",
  // },
  {
    href: "/security",
    label: "Security & compliance",
    description: "How we protect your data and your buyer's money.",
  },
] as const;

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
        <nav className="mx-auto flex h-[72px] max-w-[84rem] items-center justify-between px-4 sm:px-6 md:px-8">
          <Link href="/" aria-label="USA Errands — home">
            <SiteLogo tone="ink" />
          </Link>

          {/* Desktop nav — md breakpoint and up. About is the only
              dropdown; everything else is a flat link so the bar stays
              scannable. Order is About → Services → How it works →
              Pricing → Contact → Shop for me (CTA). */}
          <div className="hidden items-center gap-8 font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-text md:flex">
            <NavDropdown label="About" href="/about" items={ABOUT_ITEMS} />
            <Link href="/services" className="transition-colors hover:text-amber">
              Services
            </Link>
            <Link href="/how-it-works" className="transition-colors hover:text-amber">
              How it works
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-amber">
              Pricing
            </Link>
            <Link href="/faq" className="transition-colors hover:text-amber">
              FAQ
            </Link>
            <Link href="/contact" className="transition-colors hover:text-amber">
              Contact
            </Link>
            {/* Personal Shopper retains the amber CTA pill — it's the
                product surface buyers actually click. Distinct visual
                weight keeps it from getting lost in the row of links. */}
            <Link
              href="/shopper"
              className="rounded-sm border border-amber/40 bg-amber/10 px-2.5 py-0.5 text-amber transition-colors hover:bg-amber/20"
            >
              Shop for me
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <HeaderCTA />
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
