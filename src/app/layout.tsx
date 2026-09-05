import type { Metadata } from "next";
import "./globals.css";

import { AppProviders } from "@/components/providers/app-providers";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "PayGrix",
  description: "Stablecoin payroll for crypto-native teams on Arc Testnet.",
  other: {
    "base:app_id": "69f363cdbc8c9889b5bf9346",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <meta name="base:app_id" content="69f363cdbc8c9889b5bf9346" />
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
