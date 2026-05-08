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
            staleTime: 30_000,
            refetchOnWindowFocus: false,
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
