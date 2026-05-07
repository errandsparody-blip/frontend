"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Sidebar } from "@/components/portal/sidebar";
import { Topbar } from "@/components/portal/topbar";
import { useAuth } from "@/lib/auth-context";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "VENDOR" && user.role !== "VENDOR_SUB_USER") {
      // Admin users should be on /admin (P1.13).
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user || (user.role !== "VENDOR" && user.role !== "VENDOR_SUB_USER")) {
    return (
      <div className="flex h-screen items-center justify-center bg-cream">
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-cream">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto bg-cream px-8 py-8">
          <div className="mx-auto max-w-[84rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
