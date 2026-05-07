import Link from "next/link";

import { Button } from "@/components/ui/button";

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
        <div className="mx-auto flex max-w-[84rem] flex-col gap-8 px-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[18px] font-bold tracking-[0.5px] text-ink">USA ERRANDS</div>
            <p className="mt-2 max-w-md text-body-sm text-text-muted">
              U.S.-based logistics infrastructure for international sellers.
            </p>
          </div>
          <div className="font-mono text-mono-label text-text-muted">
            <div>v0.1.0 (P0 foundations)</div>
            <div className="mt-1 text-text-subtle">© 2026 USA Errands</div>
          </div>
        </div>
      </footer>
    </>
  );
}
