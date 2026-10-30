import { StorefrontShell } from "./store-shell";

// Storefront section layout. The shell (client) resolves the
// store, provides store + cart context, and renders shared chrome.
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontShell>{children}</StorefrontShell>;
}
