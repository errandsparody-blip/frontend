"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { NetworkStatusBanner } from "@/components/errors/network-status-banner";
import { NotificationWatcher } from "@/components/portal/notification-watcher";
import { Sidebar } from "@/components/portal/sidebar";
import { SidebarProvider } from "@/components/portal/sidebar-context";
import { Topbar } from "@/components/portal/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { homeForRole, useAuth } from "@/lib/auth-context";

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
      // Admin users belong on /admin, not /login. Sending them to /login
      // here used to create a sign-in loop: login → push to /dashboard →
      // PortalLayout → /login → login again. Route to the right home.
      router.replace(homeForRole(user));
      return;
    }
    // NOTE — vendors WITHOUT MFA enrolled are now allowed into the portal.
    // The previous code bounced them to /signup/2fa-enroll, which made the
    // "Skip for now (not recommended)" button on that page silently
    // ineffective (skip → /dashboard → bounce back). Product call: keep MFA
    // strongly encouraged at first login (the login flow still pushes to
    // the enrolment page when mfaEnrolled is false) but allow Skip to
    // genuinely skip. The backend's per-route acr-tier checks still gate
    // money- and inventory-moving operations for low-priv sessions, so the
    // worst a non-MFA vendor can do is read their own portal pages and get
    // a 401 the moment they try anything sensitive.
  }, [user, loading, router]);

  if (
    loading ||
    !user ||
    (user.role !== "VENDOR" && user.role !== "VENDOR_SUB_USER")
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-cream">
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      </div>
    );
  }

  return (
    // ToastProvider wraps the whole shell so anywhere in the portal
    // can call useToast() to drop a toast. NotificationWatcher is a
    // headless component (renders null) that listens for new
    // notifications between polls and fires a toast on arrival.
    // SidebarProvider owns the mobile-drawer open/close state shared
    // between the hamburger button in <Topbar/> and the off-canvas
    // <Sidebar/>; on desktop (md+) the sidebar is static and ignores
    // that state entirely, so the provider is a no-op there.
    <ToastProvider>
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-cream">
          <NetworkStatusBanner />
          <NotificationWatcher />
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-auto bg-cream px-4 py-6 sm:px-6 md:px-8 md:py-8">
              <div className="mx-auto max-w-[84rem]">{children}</div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </ToastProvider>
  );
}
