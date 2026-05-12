"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { NetworkStatusBanner } from "@/components/errors/network-status-banner";
import { AdminSidebar } from "@/components/portal/admin-sidebar";
import { NotificationWatcher } from "@/components/portal/notification-watcher";
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
    // Admins must have MFA enrolled — they can do destructive things, so
    // we never render the admin shell to a low-priv (acr=1) session.
    if (user.mfaEnrolled === false) {
      router.replace("/signup/2fa-enroll");
    }
  }, [user, loading, router]);

  if (loading || !user || !ADMIN_ROLES.has(user.role) || user.mfaEnrolled === false) {
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
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-cream">
        <NetworkStatusBanner />
        <NotificationWatcher />
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto bg-cream px-8 py-8">
            <div className="mx-auto max-w-[84rem]">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
