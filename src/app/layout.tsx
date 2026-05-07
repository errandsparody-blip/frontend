import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";

import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";

import "@/styles/globals.css";

const inter = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "USA Errands — Ship from anywhere. Sell to America.",
    template: "%s — USA Errands",
  },
  description:
    "U.S.-based logistics infrastructure for international sellers. Hold inventory in our warehouse and ship every order locally — no U.S. business required.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://usaerrands.com"),
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jbMono.variable}`}>
      <body className="bg-cream font-sans text-text antialiased">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
