"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { navItems, productNavItem } from "@/components/layout/nav-items";
import { UnsupportedNetworkWarning, WalletPanel } from "@/components/wallet/wallet-panel";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ProductIcon = productNavItem.icon;

  return (
    <div className="min-h-screen bg-background text-foreground">
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

      {/* ── Sidebar ───────────────────────────────────────── */}
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
              <p className="text-sm font-semibold text-white">Arc Payroll</p>
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
            <Badge variant="outline" className="text-xs">Arc Testnet only</Badge>
            <p className="text-xs leading-5 text-[#b7c4d6]">
              Chain ID 5042002. Payroll execution is intentionally not implemented yet.
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
      <div className="lg:pl-64">
        {/* Header */}
        <header
          className="sticky top-0 z-20"
          style={{
            background: "hsl(var(--background) / 90%)",
            borderBottom: "1px solid hsl(var(--border))",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Mobile brand */}
            <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
              <div className="flex items-center gap-3">
                <Link href="/" className="flex items-center gap-2 lg:hidden">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      background: "linear-gradient(135deg, #4f8cff 0%, #6d5dfc 50%, #d65dfc 100%)",
                      boxShadow: "0 0 12px rgba(109, 93, 252, 0.30)",
                    }}
                  >
                    <ProductIcon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white">Arc Payroll</span>
                </Link>
                <Badge variant="default" className="text-xs">Arc Testnet</Badge>
                <ThemeToggle />
              </div>
            </div>

            <WalletPanel />

            {/* Mobile nav */}
            <nav className="flex gap-1 overflow-x-auto pb-1 lg:hidden">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-[#6d5dfc]/12 text-[#bfdbfe] border border-[#6d5dfc]/25 shadow-[0_0_10px_rgba(109,93,252,0.15)]"
                        : "text-[#b7c4d6] hover:text-white hover:bg-white/5",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <UnsupportedNetworkWarning />
          {children}
        </main>
      </div>
    </div>
  );
}
