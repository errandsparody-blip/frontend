/**
 * NetworkStatusBanner — fixed-position notice that surfaces when the browser
 * thinks it is offline.
 *
 * Why a separate component (and not a normalized error code) — the offline
 * state is global and orthogonal to any specific request. We want the user
 * to know *immediately* that nothing they do will work, even before they
 * trigger an API call. Per-request errors still flow through the catalog
 * (`network_offline`), but this banner makes the global state visible at
 * all times.
 *
 * SSR-safety — `navigator` is undefined during the initial Next.js server
 * render. We therefore default to `online: true` and only flip on the
 * client after mount. This avoids a flash of "offline" on first paint.
 *
 * Accessibility — the banner is a live region so screen readers announce
 * the state change automatically. We use `aria-live="polite"` rather than
 * "assertive" because losing connectivity is not, strictly speaking, an
 * emergency from the user's standpoint.
 */

"use client";

import { useEffect, useState } from "react";

interface Props {
  /**
   * When true, the banner uses `position: fixed` to overlay the page from
   * the top. Set to `false` to render it inline (useful inside scrolling
   * containers where overlay would clip).
   */
  fixed?: boolean;
}

export function NetworkStatusBanner({ fixed = true }: Props): JSX.Element | null {
  // Default to "online" on the server. We learn the real value after mount.
  const [online, setOnline] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!hasMounted) return null;
  if (online) return null;

  const positioning = fixed
    ? "fixed inset-x-0 top-0 z-50"
    : "relative";

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        positioning +
        " border-b border-error bg-error px-6 py-2 text-center font-mono text-mono-label uppercase tracking-[1.2px] text-text-inv shadow-md"
      }
    >
      You appear to be offline. Changes you make won&apos;t be saved until your
      connection comes back.
    </div>
  );
}
