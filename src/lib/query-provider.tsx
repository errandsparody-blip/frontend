"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { installErrorTelemetry } from "@/lib/errors/telemetry";

export function QueryProvider({ children }: { children: ReactNode }): JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Treat data as fresh for 5 s — long enough to avoid
            // hammering the API during rapid React re-renders, short
            // enough that switching pages (or tabbing back in) shows
            // current state without the user having to refresh.
            staleTime: 5_000,
            // Snap to fresh data whenever the user tabs back into a
            // window. The cheapest "feels live" win: an admin reviewing
            // a PSN on screen A and a vendor making changes on screen
            // B sees the admin's view update the moment they return to
            // the tab.
            refetchOnWindowFocus: true,
            // Reconnect = network back from offline. Same logic — pull
            // current state instead of trusting the stale cache.
            refetchOnReconnect: true,
            retry: (failureCount, error) => {
              const status = (error as { status?: number })?.status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  // Install the error-catalog telemetry sink once on mount. Done here
  // (the highest "use client" ancestor) so every route — auth, portal,
  // admin, marketing — gets the wiring without each layout having to opt
  // in. Idempotent.
  useEffect(() => {
    installErrorTelemetry();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
