"use client";

import { ReactNode } from "react";

import { ThemeProvider } from "next-themes";

import { Web3Provider } from "@/components/providers/web3-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="arc-payroll-theme"
      disableTransitionOnChange
    >
      <Web3Provider>{children}</Web3Provider>
    </ThemeProvider>
  );
}
