"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { NetworkStatusBanner } from "@/components/errors/network-status-banner";
import { AdminSidebar } from "@/components/portal/admin-sidebar";
import { NotificationWatcher } from "@/components/portal/notification-watcher";
import { SidebarProvider } from "@/components/portal/sidebar-context";
import { Topbar } from "@/components/portal/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";

const ADMIN_ROLES = new Set(["WAREHOUSE_OPERATOR", "FINANCE_ADMIN", "SUPER_ADMIN"]);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!ADMIN_ROLES.has(user.role)) {
      router.replace("/dashboard");
      return;
    }
    // NOTE — MFA enrolment is no longer hard-gated at the layout level.
    // The previous code redirected admins without MFA to /signup/2fa-enroll
    // and made the Skip button on that page ineffective for them too.
    // Product call (15 May 2026): make MFA optional across both portals so
    // the Skip button works as advertised. Admins SHOULD still enrol — the
    // backend's per-route acr-tier checks reject sensitive admin actions
    // from a low-priv session — but the layout no longer forces it.
  }, [user, loading, router]);

  if (loading || !user || !ADMIN_ROLES.has(user.role)) {
    return (
      <div className="flex h-screen items-center justify-center bg-cream">
        <div className="font-mono text-mono-label uppercase text-text-muted">Authenticating…</div>
      </div>
    );
  }

  return (
    // ToastProvider wraps the admin shell so any page can call
    // useToast() to drop a transient banner. NotificationWatcher is
    // headless — it listens to the 15-second unread-count poll and
    // fires a toast when new notifications arrive between polls.
    // SidebarProvider owns the mobile-drawer open/close state shared
    // between the hamburger button in <Topbar/> and the off-canvas
    // <AdminSidebar/>; on md+ the sidebar is static and ignores that
    // state, so the provider is effectively a no-op on desktop.
    <ToastProvider>
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-cream">
          <NetworkStatusBanner />
          <NotificationWatcher />
          <AdminSidebar />
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
