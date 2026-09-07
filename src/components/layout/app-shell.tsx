"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState, useEffect } from "react";
import { Droplet, Menu, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navItems, productNavItem } from "@/components/layout/nav-items";
import { UnsupportedNetworkWarning, WalletPanel } from "@/components/wallet/wallet-panel";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { DisconnectWalletButton } from "@/components/wallet/disconnect-wallet-button";
import { NetworkStatus } from "@/components/wallet/network-status";
import { WalletAddress } from "@/components/wallet/wallet-address";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isConnected } = useArcWallet();
  const ProductIcon = productNavItem.icon;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden w-full max-w-full">
      {/* Premium Sidebar Styling Definitions */}
      <style>{`
        @keyframes smoke-float {
          0% {
            transform: translate(0px, 0px) scale(1) rotate(0deg);
          }
          50% {
            transform: translate(6px, -4px) scale(1.15) rotate(4deg);
          }
          100% {
            transform: translate(0px, 0px) scale(1) rotate(0deg);
          }
        }

        @keyframes shimmer-move {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .nav-item-glass {
          position: relative;
          overflow: hidden;
          background: rgba(10, 25, 53, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.03);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.04);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .nav-item-glass:hover {
          transform: translateX(3px) scale(1.02);
          background: rgba(16, 35, 75, 0.7);
          border-color: rgba(99, 102, 241, 0.35);
          box-shadow: 
            inset 0 1px 1px rgba(255, 255, 255, 0.08),
            0 0 25px rgba(109, 93, 252, 0.3),
            0 4px 12px rgba(0, 0, 0, 0.45);
        }

        .nav-item-active-glass {
          position: relative;
          overflow: hidden;
          background: rgba(109, 93, 252, 0.15);
          border: 1px solid rgba(109, 93, 252, 0.45);
          box-shadow: 
            inset 0 1px 1px rgba(255, 255, 255, 0.12),
            0 0 18px rgba(109, 93, 252, 0.25);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .nav-item-active-glass:hover {
          transform: translateX(3px) scale(1.02);
          background: rgba(109, 93, 252, 0.22);
          border-color: rgba(99, 102, 241, 0.6);
          box-shadow: 
            inset 0 1px 1px rgba(255, 255, 255, 0.18),
            0 0 28px rgba(109, 93, 252, 0.45),
            0 4px 15px rgba(0, 0, 0, 0.5);
        }

        .smoke-cloud-1 {
          position: absolute;
          bottom: -25%;
          right: -10%;
          width: 85%;
          height: 85%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, transparent 65%);
          filter: blur(12px);
          pointer-events: none;
          mix-blend-mode: screen;
          transition: background 0.3s ease;
        }

        .smoke-cloud-2 {
          position: absolute;
          top: -15%;
          left: -15%;
          width: 75%;
          height: 75%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%);
          filter: blur(14px);
          pointer-events: none;
          mix-blend-mode: screen;
          transition: background 0.3s ease;
        }

        .nav-item-glass:hover .smoke-cloud-1,
        .nav-item-active-glass:hover .smoke-cloud-1 {
          background: radial-gradient(circle, rgba(109, 93, 252, 0.38) 0%, transparent 55%);
          animation: smoke-float 6s infinite ease-in-out;
        }

        .nav-item-glass:hover .smoke-cloud-2,
        .nav-item-active-glass:hover .smoke-cloud-2 {
          background: radial-gradient(circle, rgba(59, 130, 246, 0.24) 0%, transparent 60%);
          animation: smoke-float 8s infinite ease-in-out reverse;
        }

        .active-glowing-indicator {
          position: absolute;
          left: 0;
          top: 15%;
          bottom: 15%;
          width: 4px;
          background: linear-gradient(to bottom, #4f8cff, #6d5dfc);
          border-radius: 0 4px 4px 0;
          box-shadow: 0 0 12px rgba(109, 93, 252, 0.9);
          z-index: 10;
        }

        .shimmer-reflection {
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.06), transparent);
          transform: translateX(-100%);
          pointer-events: none;
        }

        .nav-item-glass:hover .shimmer-reflection,
        .nav-item-active-glass:hover .shimmer-reflection {
          animation: shimmer-move 1.2s ease-out;
        }
      `}</style>

      {/* ── Sidebar (Desktop only) ───────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"
        style={{
          background: "hsl(var(--card) / 96%)",
          borderRight: "1px solid hsl(var(--border))",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex h-full flex-col">
          {/* Brand */}
          <Link href="/" className="flex h-16 items-center gap-3 px-5">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
              style={{
                background: "linear-gradient(135deg, #4f8cff 0%, #6d5dfc 50%, #d65dfc 100%)",
                boxShadow: "0 0 16px rgba(109, 93, 252, 0.35)",
              }}
            >
              <ProductIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">PayGrix</p>
              <p className="text-xs text-[#b7c4d6]">Stablecoin operations</p>
            </div>
          </Link>

          {/* Divider */}
          <div
            className="mx-4 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent, rgba(79,140,255,0.25), transparent)",
            }}
          />

          {/* Nav */}
          <nav className="flex-1 space-y-2 p-3 mt-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-250 relative overflow-hidden",
                    isActive
                      ? "nav-item-active-glass text-white font-semibold"
                      : "nav-item-glass text-[#b7c4d6] hover:text-white"
                  )}
                >
                  {/* Left glowing indicator for active item */}
                  {isActive && <div className="active-glowing-indicator" />}

                  {/* Shimmer moving reflection */}
                  <div className="shimmer-reflection" />

                  {/* Subtle smoky nebula elements */}
                  <div className="smoke-cloud-2" />
                  <div className="smoke-cloud-1" />

                  <item.icon
                    className={cn(
                      "h-4.5 w-4.5 transition-all duration-250 relative z-10 shrink-0",
                      isActive
                        ? "text-[#4f8cff] drop-shadow-[0_0_8px_rgba(79,140,255,0.45)]"
                        : "text-[#b7c4d6] group-hover:text-[#4f8cff] group-hover:drop-shadow-[0_0_8px_rgba(79,140,255,0.4)]"
                    )}
                  />
                  <span className="relative z-10 transition-colors duration-250">{item.title}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer info */}
          <div
            className="m-3 space-y-3 rounded-xl p-4"
            style={{
              background: "rgba(37, 99, 255, 0.06)",
              border: "1px solid rgba(79, 140, 255, 0.15)",
            }}
          >
            <Badge variant="outline" className="text-xs">Testnet Environment</Badge>
            <p className="text-xs leading-5 text-[#b7c4d6]">
              Payroll execution is intentionally not implemented yet.
            </p>
            <div className="pt-2.5 border-t border-[#4f8cff]/10 flex items-center">
              <a
                href="https://x.com/janmd07"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-[#b7c4d6] hover:text-white transition-all group font-medium w-full justify-between"
              >
                <span>Built by janmd</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#6d5dfc]/10 border border-[#6d5dfc]/20 text-[#4f8cff] group-hover:bg-[#6d5dfc]/20 group-hover:border-[#6d5dfc]/40 shadow-[0_0_10px_rgba(109,93,252,0.1)] transition-all duration-300">
                  <svg className="h-2.5 w-2.5 text-[#4f8cff] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Follow on X
                </span>
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────── */}
      <div className="lg:pl-64 min-w-0 max-w-full w-full">
        {/* Header */}
        <header
          className="sticky top-0 z-20 w-full max-w-full"
          style={{
            background: "hsl(var(--background) / 90%)",
            borderBottom: "1px solid hsl(var(--border))",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="flex flex-col gap-2 px-4 py-2.5 sm:px-6 lg:py-3 lg:min-h-16 lg:flex-row lg:items-center lg:justify-between w-full max-w-full min-w-0">
            {/* Top row: Brand & Mobile controls (Connect Wallet + ThemeToggle + Hamburger) */}
            <div className="flex items-center justify-between w-full lg:w-auto">
              <div className="flex items-center gap-3">
                <Link href="/" className="flex items-center gap-2.5 lg:hidden">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #4f8cff 0%, #6d5dfc 50%, #d65dfc 100%)",
                      boxShadow: "0 0 12px rgba(109, 93, 252, 0.30)",
                    }}
                  >
                    <ProductIcon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white">PayGrix</span>
                </Link>
                {/* ThemeToggle shown on desktop on the left */}
                <div className="hidden lg:block">
                  <ThemeToggle />
                </div>
              </div>

              {/* Mobile controls: Connect Wallet CTA (prominent) + ThemeToggle + Hamburger Button */}
              <div className="flex items-center gap-2 lg:hidden">
                {mounted && (
                  isConnected ? (
                    <WalletAddress />
                  ) : (
                    <ConnectWalletButton size="sm" className="h-8 px-3 text-xs" />
                  )
                )}
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#4f8cff]/50 shrink-0"
                  aria-label={mobileMenuOpen ? "Close menu" : "Open navigation menu"}
                  aria-expanded={mobileMenuOpen}
                >
                  {mobileMenuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {/* Desktop Wallet Panel (hidden on mobile, visible on desktop) */}
            <div className="hidden lg:flex w-auto min-w-0 items-center justify-end">
              <WalletPanel />
            </div>

            {/* Mobile Sub-Header: Network Status & Faucet Access (and Disconnect if connected) */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06] w-full lg:hidden">
              <div className="flex items-center gap-2">
                <NetworkStatus />
                <a
                  href="https://faucet.circle.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 px-2.5 text-xs rounded-lg text-[#93c5fd] border-[#4f8cff]/25 hover:border-[#4f8cff]/55 hover:bg-[#2563ff]/15 hover:text-white transition-all duration-200"
                  >
                    <Droplet className="h-3 w-3 text-[#4f8cff]" />
                    Faucet
                  </Button>
                </a>
              </div>
              {mounted && isConnected && (
                <DisconnectWalletButton />
              )}
            </div>
          </div>
        </header>

        {/* ── Mobile Navigation Drawer ───────────────────────── */}
        <div
          className={cn(
            "fixed inset-0 z-40 lg:hidden transition-all duration-300",
            mobileMenuOpen ? "pointer-events-auto visible" : "pointer-events-none invisible"
          )}
        >
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300",
              mobileMenuOpen ? "opacity-100" : "opacity-0"
            )}
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col transition-transform duration-300 ease-out shadow-2xl",
              mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}
            style={{
              background: "hsl(var(--card) / 98%)",
              borderRight: "1px solid hsl(var(--border))",
              backdropFilter: "blur(24px)",
            }}
            aria-label="Mobile Navigation"
          >
            {/* Drawer Brand & Close */}
            <div className="flex h-16 items-center justify-between px-5 border-b border-white/5">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3"
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #4f8cff 0%, #6d5dfc 50%, #d65dfc 100%)",
                    boxShadow: "0 0 14px rgba(109, 93, 252, 0.35)",
                  }}
                >
                  <ProductIcon className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">PayGrix</p>
                  <p className="text-xs text-[#b7c4d6]">Stablecoin operations</p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Wallet CTA in drawer if not connected */}
            {mounted && !isConnected && (
              <div className="px-3.5 pt-3 pb-1">
                <ConnectWalletButton className="w-full justify-center h-10" />
              </div>
            )}

            {/* Drawer Nav links */}
            <nav className="flex-1 overflow-y-auto space-y-1.5 p-3.5">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-250 relative overflow-hidden",
                      isActive
                        ? "nav-item-active-glass text-white font-semibold"
                        : "nav-item-glass text-[#b7c4d6] hover:text-white"
                    )}
                  >
                    {isActive && <div className="active-glowing-indicator" />}
                    <div className="shimmer-reflection" />
                    <div className="smoke-cloud-2" />
                    <div className="smoke-cloud-1" />

                    <item.icon
                      className={cn(
                        "h-4.5 w-4.5 transition-all duration-250 relative z-10 shrink-0",
                        isActive
                          ? "text-[#4f8cff] drop-shadow-[0_0_8px_rgba(79,140,255,0.45)]"
                          : "text-[#b7c4d6] group-hover:text-[#4f8cff] group-hover:drop-shadow-[0_0_8px_rgba(79,140,255,0.4)]"
                      )}
                    />
                    <span className="relative z-10 transition-colors duration-250">{item.title}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Drawer Footer info */}
            <div
              className="m-3 space-y-3 rounded-xl p-3.5"
              style={{
                background: "rgba(37, 99, 255, 0.06)",
                border: "1px solid rgba(79, 140, 255, 0.15)",
              }}
            >
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">Testnet Environment</Badge>
              </div>
              <p className="text-[11px] leading-relaxed text-[#b7c4d6]">
                Payroll execution is intentionally not implemented yet.
              </p>
              <div className="pt-2 border-t border-[#4f8cff]/10 flex items-center">
                <a
                  href="https://x.com/janmd07"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-[#b7c4d6] hover:text-white transition-all group font-medium w-full justify-between"
                >
                  <span>Built by janmd</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#6d5dfc]/10 border border-[#6d5dfc]/20 text-[#4f8cff] group-hover:bg-[#6d5dfc]/20 group-hover:border-[#6d5dfc]/40 shadow-[0_0_10px_rgba(109,93,252,0.1)] transition-all duration-300">
                    <svg className="h-2.5 w-2.5 text-[#4f8cff] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    Follow on X
                  </span>
                </a>
              </div>
            </div>
          </aside>
        </div>

        {/* Page content */}
        <main className="px-4 py-6 sm:px-6 lg:px-8 w-full max-w-full min-w-0 overflow-x-hidden">
          <UnsupportedNetworkWarning />
          {children}
        </main>
      </div>
    </div>
  );
}