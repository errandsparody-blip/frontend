import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[72px] max-w-[84rem] items-center justify-between px-8">
          <Link href="/" className="text-[18px] font-bold tracking-[0.5px] text-ink">
            USA ERRANDS
          </Link>
          <Link
            href="/"
            className="font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back to site
          </Link>
        </div>
      </header>
      <main className="flex min-h-[calc(100vh-72px)] items-start justify-center px-6 py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
