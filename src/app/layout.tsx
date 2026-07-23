import type { Metadata } from "next";
import "./globals.css";

import { AppProviders } from "@/components/providers/app-providers";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "PayGrid",
  description: "Stablecoin payroll for crypto-native teams on Arc Testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
