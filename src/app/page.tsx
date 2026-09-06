"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Landmark,
  Shield,
  WalletCards,
  TrendingUp,
  Zap,
  Activity,
  ArrowUpRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/ui/magnetic-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackgroundEffects } from "@/components/landing/background/BackgroundEffects";

/* ─────────────────────────────────────────────────────────
   DATA (PRESERVED UNCHANGED)
   ───────────────────────────────────────────────────────── */
const pillars = [
  {
    title: "Arc-only rails",
    description:
      "Network configuration pinned to Arc Testnet from day one — no cross-chain confusion, no wrong-chain risk.",
    icon: Shield,
    iconColor: "text-blue-400",
    glowRgb: "37, 99, 255",
    accentRgb: "79, 140, 255",
  },
  {
    title: "Contributor payroll",
    description:
      "Organize payout recipients and payroll cycles before execution is added. Clean structure, zero chaos.",
    icon: WalletCards,
    iconColor: "text-violet-400",
    glowRgb: "109, 93, 252",
    accentRgb: "139, 92, 246",
  },
  {
    title: "Treasury clarity",
    description:
      "A dedicated workspace for balances, funding status, and payment readiness — all in one view.",
    icon: Landmark,
    iconColor: "text-sky-400",
    glowRgb: "56, 189, 248",
    accentRgb: "125, 211, 252",
  },
];

const metrics = [
  {
    label: "Upcoming payroll",
    value: "$48,200",
    delta: "+12% this cycle",
    icon: TrendingUp,
    rgb: "37, 99, 255",
    iconColor: "#4f8cff",
  },
  {
    label: "Treasury runway",
    value: "7.4 mo",
    delta: "Stable",
    icon: Zap,
    rgb: "109, 93, 252",
    iconColor: "#a78bfa",
  },
  {
    label: "Contributors",
    value: "18",
    delta: "+3 this period",
    icon: Activity,
    rgb: "16, 185, 129",
    iconColor: "#34d399",
  },
];

const bars = [
  { label: "Core contributors", pct: 82, from: "#4f8cff", to: "#d65dfc" },
  { label: "Protocol rewards",  pct: 64, from: "#6d5dfc", to: "#818cf8" },
  { label: "Advisory allocation", pct: 48, from: "#38bdf8", to: "#6d5dfc" },
];

const transactions = [
  { name: "Sarah Chen",     role: "Protocol Eng.",   amount: "$4,200", status: "Ready",   rgb: "16,185,129",  statusColor: "#34d399"  },
  { name: "Marcus Lee",     role: "Smart Contracts", amount: "$3,800", status: "Staged",  rgb: "109,93,252",  statusColor: "#bfdbfe"  },
  { name: "Ana Gutierrez",  role: "Research Lead",   amount: "$5,100", status: "Pending", rgb: "245,158,11",  statusColor: "#fbbf24"  },
  { name: "James Park",     role: "Frontend Dev",    amount: "$3,600", status: "Ready",   rgb: "16,185,129",  statusColor: "#34d399"  },
];

const trustItems = ["Chain ID 5042002", "RPC configured", "Explorer ready"];

const particles = [
  { x: 7,  y: 14, s: 2,   blue: true,  dur: 12, delay: 0   },
  { x: 19, y: 5,  s: 1.5, blue: false, dur: 15, delay: 2   },
  { x: 44, y: 9,  s: 1,   blue: false, dur: 10, delay: 1   },
  { x: 77, y: 7,  s: 2,   blue: true,  dur: 14, delay: 3   },
  { x: 91, y: 18, s: 1.5, blue: false, dur: 11, delay: 0.5 },
  { x: 86, y: 53, s: 1,   blue: true,  dur: 16, delay: 1.5 },
  { x: 94, y: 74, s: 2,   blue: false, dur: 13, delay: 2.5 },
  { x: 71, y: 87, s: 1.5, blue: true,  dur: 12, delay: 4   },
  { x: 38, y: 91, s: 1,   blue: false, dur: 17, delay: 0.8 },
  { x: 11, y: 79, s: 2,   blue: true,  dur: 11, delay: 3.5 },
  { x: 4,  y: 49, s: 1.5, blue: false, dur: 14, delay: 1.8 },
  { x: 53, y: 3,  s: 1,   blue: true,  dur: 13, delay: 2.2 },
  { x: 64, y: 68, s: 1.5, blue: false, dur: 15, delay: 0.3 },
  { x: 29, y: 58, s: 1,   blue: true,  dur: 10, delay: 4.5 },
  { x: 17, y: 38, s: 2,   blue: false, dur: 12, delay: 1.2 },
];

const backgroundStars = [
  { top: "12%", left: "8%", size: 1.5, delay: 0 },
  { top: "18%", left: "82%", size: 2.2, delay: 1.5 },
  { top: "35%", left: "14%", size: 1.2, delay: 0.8 },
  { top: "8%", left: "65%", size: 2.0, delay: 2.4 },
  { top: "52%", left: "78%", size: 1.5, delay: 1.2 },
  { top: "68%", left: "12%", size: 2.5, delay: 0.4 },
  { top: "82%", left: "55%", size: 1.2, delay: 3.1 },
  { top: "28%", left: "48%", size: 1.8, delay: 1.9 },
  { top: "62%", left: "40%", size: 2.2, delay: 0.7 },
  { top: "78%", left: "88%", size: 1.5, delay: 3.6 },
  { top: "90%", left: "22%", size: 2.0, delay: 1.1 },
  { top: "45%", left: "4%", size: 1.2, delay: 0.2 },
  { top: "4%", left: "30%", size: 1.8, delay: 2.8 },
  { top: "42%", left: "94%", size: 2.5, delay: 1.6 },
];

/* ─────────────────────────────────────────────────────────
   REUSABLE USDC COIN HELPER (FIXED DIMENSIONS ON DESKTOP)
   ───────────────────────────────────────────────────────── */
function USDCCoin({ 
  size, 
  side = "left",
  className = "", 
  style = {} 
}: { 
  size: number;
  side?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
}) {
  // Edge thickness is 6% of the coin size
  const edgeWidth = Math.max(Math.round(size * 0.06), 2);
  const logoSize = size - (edgeWidth * 2);

  // Dynamic rim lighting colors based on side (cyan left, magenta right)
  const borderStyles = side === "left" 
    ? {
        borderLeftColor: "rgba(0, 240, 255, 0.65)",
        borderTopColor: "rgba(0, 240, 255, 0.45)",
        borderRightColor: "rgba(0, 30, 80, 0.5)",
        borderBottomColor: "rgba(0, 120, 255, 0.3)",
      }
    : {
        borderRightColor: "rgba(240, 36, 255, 0.65)",
        borderTopColor: "rgba(240, 36, 255, 0.45)",
        borderLeftColor: "rgba(0, 30, 80, 0.5)",
        borderBottomColor: "rgba(180, 30, 255, 0.3)",
      };

  const shadowStyle = side === "left"
    ? `
      0 0 10px rgba(0, 240, 255, 0.15),
      -2px 0 6px rgba(0, 240, 255, 0.35),
      0 12px 30px rgba(0, 0, 0, 0.4),
      inset 2px 0 3px rgba(0, 240, 255, 0.45),
      inset -2px 0 3px rgba(0, 0, 0, 0.4)
    `
    : `
      0 0 10px rgba(240, 36, 255, 0.15),
      2px 0 6px rgba(240, 36, 255, 0.35),
      0 12px 30px rgba(0, 0, 0, 0.4),
      inset -2px 0 3px rgba(240, 36, 255, 0.45),
      inset 2px 0 3px rgba(0, 0, 0, 0.4)
    `;

  return (
    <div 
      className={`relative flex items-center justify-center rounded-full ${className}`} 
      style={{ 
        width: size, 
        height: size,
        background: "linear-gradient(135deg, rgba(120, 190, 255, 0.25) 0%, rgba(39, 137, 255, 0.12) 50%, rgba(0, 30, 80, 0.4) 100%)",
        border: `${edgeWidth}px solid transparent`,
        ...borderStyles,
        boxShadow: shadowStyle,
        ...style 
      }}
    >
      {/* Centered USDC Logo occupying approx 88% of coin diameter */}
      <div 
        className="relative rounded-full overflow-hidden flex items-center justify-center" 
        style={{ 
          width: logoSize, 
          height: logoSize,
        }}
      >
        <Image
          src="/tokens/usdc.png"
          alt="USDC Logo"
          fill
          className="object-contain rounded-full"
          sizes={`${logoSize}px`}
          priority
        />
      </div>

      {/* Subtle Specular Sheen (Glossy glass reflection overlay) */}
      <div 
        className="absolute inset-0 rounded-full pointer-events-none overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 30%, transparent 60%)",
          zIndex: 10,
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────────────────── */
export default function LandingPage() {
  const logoRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Performant Mouse Parallax for Background, Lights & Coins
  useEffect(() => {
    const touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (touchDevice || prefersReducedMotion) return;

    let rafId: number;
    const handleGlobalMouseMove = (e: MouseEvent) => {
      rafId = requestAnimationFrame(() => {
        if (bgRef.current) {
          const xPct = (e.clientX / window.innerWidth) - 0.5;
          const yPct = (e.clientY / window.innerHeight) - 0.5;
          // Set base parallax shifts
          bgRef.current.style.setProperty('--mouse-x', `${xPct * 20}px`);
          bgRef.current.style.setProperty('--mouse-y', `${yPct * 20}px`);
        }
      });
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Performant 3D Tilt for Showcase Panel
  const handlePanelMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (touchDevice || prefersReducedMotion || !panelRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const maxTilt = 4;

    panelRef.current.style.setProperty('--tilt-x', `${6 - y * maxTilt}deg`);
    panelRef.current.style.setProperty('--tilt-y', `${x * maxTilt}deg`);
  };

  const handlePanelMouseLeave = () => {
    if (!panelRef.current) return;
    panelRef.current.style.setProperty('--tilt-x', `6deg`);
    panelRef.current.style.setProperty('--tilt-y', `0deg`);
  };


  // Performant logo hover-tilt (completely state-less)
  const handleLogoMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (touchDevice || prefersReducedMotion || !logoRef.current) return;

    const rect = logoRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const maxTilt = 6;

    logoRef.current.style.setProperty('--logo-tilt-x', `${-y * maxTilt}deg`);
    logoRef.current.style.setProperty('--logo-tilt-y', `${x * maxTilt}deg`);
  };

  const handleLogoMouseLeave = () => {
    if (!logoRef.current) return;
    logoRef.current.style.setProperty('--logo-tilt-x', `0deg`);
    logoRef.current.style.setProperty('--logo-tilt-y', `0deg`);
  };

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#020617] text-white relative">
      {/* Scoped CSS styling for animations - 100% valid syntax to prevent browser style parser crash */}
      <style dangerouslySetInnerHTML={{ __html: `
        .stroke-light-dark {
          stroke: rgba(255, 255, 255, 0.05);
        }

        .coin-3d {
          transform-style: preserve-3d;
          will-change: transform;
        }

        .coin-wrapper {
          position: absolute;
          pointer-events: none;
          will-change: transform;
          perspective: 1200px;
        }

        /* Ambient star twinkle animation */
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 0.9; transform: scale(1.2); }
        }
        .star-glow {
          animation: star-twinkle 5s ease-in-out infinite;
        }

        /* Coin Floating Animations */
        @keyframes coin-float-1 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .animate-float-1 {
          animation: coin-float-1 6s ease-in-out infinite;
        }

        @keyframes coin-float-2 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .animate-float-2 {
          animation: coin-float-2 7s ease-in-out infinite;
        }

        @keyframes coin-float-3 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .animate-float-3 {
          animation: coin-float-3 5s ease-in-out infinite;
        }

        @keyframes coin-float-4 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        .animate-float-4 {
          animation: coin-float-4 8s ease-in-out infinite;
        }

        @keyframes coin-float-5 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-7px); }
        }
        .animate-float-5 {
          animation: coin-float-5 6.5s ease-in-out infinite;
        }

        @keyframes coin-float-6 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-9px); }
        }
        .animate-float-6 {
          animation: coin-float-6 5.5s ease-in-out infinite;
        }

        /* Coin 3D Rotating Animations with Constant Tilt */
        @keyframes coin-rotate-1 {
          0%, 100% { transform: rotateX(-4deg) rotateY(-10deg); }
          50% { transform: rotateX(4deg) rotateY(10deg); }
        }
        .animate-rotate-1 {
          animation: coin-rotate-1 24s ease-in-out infinite;
        }

        @keyframes coin-rotate-2 {
          0%, 100% { transform: rotateX(-6deg) rotateY(-30deg); }
          50% { transform: rotateX(6deg) rotateY(30deg); }
        }
        .animate-rotate-2 {
          animation: coin-rotate-2 28s ease-in-out infinite;
        }

        @keyframes coin-rotate-3 {
          0%, 100% { transform: rotateX(-8deg) rotateY(-45deg); }
          50% { transform: rotateX(8deg) rotateY(45deg); }
        }
        .animate-rotate-3 {
          animation: coin-rotate-3 20s ease-in-out infinite;
        }

        @keyframes coin-rotate-4 {
          0%, 100% { transform: rotateX(5deg) rotateY(12deg); }
          50% { transform: rotateX(-5deg) rotateY(-12deg); }
        }
        .animate-rotate-4 {
          animation: coin-rotate-4 26s ease-in-out infinite;
        }

        @keyframes coin-rotate-5 {
          0%, 100% { transform: rotateX(6deg) rotateY(35deg); }
          50% { transform: rotateX(-6deg) rotateY(-35deg); }
        }
        .animate-rotate-5 {
          animation: coin-rotate-5 30s ease-in-out infinite;
        }

        @keyframes coin-rotate-6 {
          0%, 100% { transform: rotateX(7deg) rotateY(40deg); }
          50% { transform: rotateX(-7deg) rotateY(-40deg); }
        }
        .animate-rotate-6 {
          animation: coin-rotate-6 22s ease-in-out infinite;
        }

        /* Parallax displacements multipliers */
        .coin-parallax-1 {
          transform: translate(calc(var(--mouse-x, 0px) * 1.1), calc(var(--mouse-y, 0px) * 1.1));
          transition: transform 0.65s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .coin-parallax-2 {
          transform: translate(calc(var(--mouse-x, 0px) * 0.85), calc(var(--mouse-y, 0px) * 0.85));
          transition: transform 0.7s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .coin-parallax-3 {
          transform: translate(calc(var(--mouse-x, 0px) * 0.95), calc(var(--mouse-y, 0px) * 0.95));
          transition: transform 0.75s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .coin-parallax-4 {
          transform: translate(calc(var(--mouse-x, 0px) * 1.15), calc(var(--mouse-y, 0px) * 1.15));
          transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .coin-parallax-5 {
          transform: translate(calc(var(--mouse-x, 0px) * 0.95), calc(var(--mouse-y, 0px) * 0.95));
          transition: transform 0.8s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .coin-parallax-6 {
          transform: translate(calc(var(--mouse-x, 0px) * 0.8), calc(var(--mouse-y, 0px) * 0.8));
          transition: transform 0.72s cubic-bezier(0.25, 1, 0.5, 1);
        }

        /* Energy platform pulsing */
        @keyframes platform-pulse {
          0%, 100% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(1.04); opacity: 0.95; }
        }
        .animate-pulse-slow {
          animation: platform-pulse 6s ease-in-out infinite;
        }

        /* Soft animated fog shift */
        @keyframes fog-shift {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.08) translate(1.5%, 1.5%); }
        }
        .animate-fog-slow {
          animation: fog-shift 40s linear infinite alternate;
        }

        /* Entrance fade up */
        @keyframes fade-up-reveal {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-up {
          animation: fade-up-reveal 1.0s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        /* Text reveal */
        @keyframes text-reveal-keyframe {
          from {
            clip-path: inset(0 0 100% 0);
            transform: translateY(20px);
          }
          to {
            clip-path: inset(0 0 0 0);
            transform: translateY(0);
          }
        }
        .animate-text-reveal {
          animation: text-reveal-keyframe 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
        }

        /* Shimmer reflection */
        @keyframes shimmer-sweep {
          0% { transform: translateX(-150%); }
          25%, 100% { transform: translateX(150%); }
        }
        .animate-shimmer-sweep::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.08) 45%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.08) 55%, transparent 70%);
          transform: translateX(-150%);
          animation: shimmer-sweep 8s ease-in-out infinite;
          pointer-events: none;
          z-index: 10;
        }

        /* Floating logo center */
        @keyframes logo-float {
          0%, 100% {
            transform: translate(0px, 0px) rotate(0deg);
          }
          25% {
            transform: translate(12px, -8px) rotate(1.5deg);
          }
          50% {
            transform: translate(-6px, 6px) rotate(-1deg);
          }
          75% {
            transform: translate(-12px, -4px) rotate(1deg);
          }
        }
        .animate-logo-float {
          animation: logo-float 5s ease-in-out infinite;
        }

        @keyframes logo-breathe {
          0%, 100% { opacity: 0.65; transform: scale(0.95); filter: blur(32px); }
          50% { opacity: 0.95; transform: scale(1.12); filter: blur(52px); }
        }
        .animate-logo-glow {
          animation: logo-breathe 3.5s ease-in-out infinite;
        }

        .premium-logo-bloom {
          filter: 
            drop-shadow(0 0 10px rgba(0, 240, 255, 0.85))
            drop-shadow(0 0 25px rgba(79, 140, 255, 0.70))
            drop-shadow(0 0 50px rgba(240, 36, 255, 0.55))
            drop-shadow(0 0 80px rgba(109, 93, 252, 0.40));
          transform-style: preserve-3d;
        }

        .showcase-panel-wrapper {
          perspective: 1200px;
        }

        .showcase-panel {
          transform: rotateX(var(--tilt-x, 6deg)) rotateY(var(--tilt-y, 0deg));
          transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
          transform-style: preserve-3d;
          will-change: transform;
        }

        .headline-cinematic {
          background: linear-gradient(to bottom, #ffffff 15%, #cbd5e1 45%, #94a3b8 70%, #4f46e5 92%, #312e81 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          color: transparent;
          text-shadow: 0 0 80px rgba(99, 102, 241, 0.12);
        }

        .glow-border-shell {
          position: relative;
          padding: 1px;
          border-radius: 18px;
          background: linear-gradient(to bottom, rgba(56, 189, 248, 0.22) 0%, rgba(240, 36, 255, 0.04) 100%);
          box-shadow: 0 35px 80px rgba(0, 0, 0, 0.7);
        }

        .premium-showcase-card {
          background: rgba(8, 14, 30, 0.85) !important;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.04) !important;
          border-top: 1px solid rgba(255, 255, 255, 0.18) !important;
          box-shadow: 
            0 40px 100px -20px rgba(0, 0, 0, 0.95),
            0 -8px 40px -10px rgba(0, 240, 255, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
        }

        .btn-premium-cta {
          background: linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #d946ef 100%) !important;
          color: #ffffff !important;
          border: 1px solid rgba(255, 255, 255, 0.16) !important;
          box-shadow: 
            0 4px 20px rgba(99, 102, 241, 0.38),
            0 12px 40px rgba(99, 102, 241, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.22) !important;
          transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .btn-premium-cta:hover {
          transform: translateY(-2px) scale(1.02) !important;
          box-shadow: 
            0 8px 30px rgba(99, 102, 241, 0.55),
            0 20px 50px rgba(99, 102, 241, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
        }
        .btn-premium-cta:active {
          transform: translateY(0px) scale(1) !important;
        }

        .btn-secondary-cta {
          background: rgba(15, 23, 42, 0.55) !important;
          color: #94a3b8 !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          backdrop-filter: blur(12px) !important;
          transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .btn-secondary-cta:hover {
          background: rgba(15, 23, 42, 0.75) !important;
          color: #f1f5f9 !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
          transform: translateY(-2px) scale(1.02) !important;
        }
        .btn-secondary-cta:active {
          transform: translateY(0px) scale(1) !important;
        }

        .showcase-metric-tile {
          background: rgba(15, 23, 42, 0.4) !important;
          border: 1px solid rgba(255, 255, 255, 0.03) !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.01) !important;
          transition: all 0.25s ease !important;
        }
        .showcase-metric-tile:hover {
          border-color: rgba(56, 189, 248, 0.22) !important;
          background: rgba(15, 23, 42, 0.6) !important;
        }

        .showcase-progress-panel {
          background: rgba(15, 23, 42, 0.4) !important;
          border: 1px solid rgba(255, 255, 255, 0.03) !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.01) !important;
        }

        .showcase-table {
          background: rgba(15, 23, 42, 0.25) !important;
          border: 1px solid rgba(255, 255, 255, 0.03) !important;
        }
        .showcase-table-header {
          background: rgba(15, 23, 42, 0.5) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
        }
        .showcase-table-row-even {
          background: rgba(15, 23, 42, 0.18) !important;
          transition: background 0.2s ease !important;
        }
        .showcase-table-row-odd {
          background: rgba(15, 23, 42, 0.28) !important;
          transition: background 0.2s ease !important;
        }
        .showcase-table-row-even:hover, .showcase-table-row-odd:hover {
          background: rgba(15, 23, 42, 0.45) !important;
        }
        .showcase-footer {
          background: rgba(15, 23, 42, 0.45) !important;
          border-t: 1px solid rgba(255, 255, 255, 0.04) !important;
        }

        /* Parallax background lights */
        .parallax-light {
          transform: translate(calc(var(--mouse-x, 0px) * 0.65), calc(var(--mouse-y, 0px) * 0.65));
          transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .hero-grid-overlay {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }
        .hero-grid-overlay::before {
          content: "";
          position: absolute;
          width: 240%;
          height: 240%;
          top: -60%;
          left: -70%;
          background-image:
            linear-gradient(rgba(79, 140, 255, 0.12) 1px, transparent 1px),
            linear-gradient(to right, rgba(79, 140, 255, 0.12) 1px, transparent 1px);
          background-size: 80px 80px;
          transform: perspective(700px) rotateX(40deg);
          transform-origin: center 65%;
          mask-image: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(0,0,0,0.65) 25%,
            rgba(0,0,0,0.25) 75%,
            transparent 100%
          );
          -webkit-mask-image: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(0,0,0,0.65) 25%,
            rgba(0,0,0,0.25) 75%,
            transparent 100%
          );
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-up, .animate-text-reveal, .animate-pulse-slow, .animate-shimmer-sweep::after, .animate-logo-float, .animate-logo-glow, .animate-fog-slow {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .coin-3d,
          .animate-float-1, .animate-float-2, .animate-float-3, .animate-float-4, .animate-float-5, .animate-float-6,
          .animate-rotate-1, .animate-rotate-2, .animate-rotate-3, .animate-rotate-4, .animate-rotate-5, .animate-rotate-6 {
            animation: none !important;
            transform: none !important;
          }
        }
      ` }} />

      <BackgroundEffects />

      {/* Grain overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.025] z-[9999]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} aria-hidden="true" />

      {/* Immersive background layer */}
      <div ref={bgRef} className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Receding Perspective Grid (Coordinated Vanishing Point) */}
        <div className="hero-grid-overlay opacity-60 pointer-events-none" style={{ mixBlendMode: 'screen' }} aria-hidden="true" />
        {/* Volumetric left blue glow */}
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[900px] rounded-full filter blur-[120px] bg-blue-600/[0.08] pointer-events-none z-0 parallax-light" />
        {/* Volumetric right violet glow */}
        <div className="absolute top-[15%] right-[-10%] w-[60vw] h-[60vw] max-w-[900px] rounded-full filter blur-[120px] bg-purple-600/[0.06] pointer-events-none z-0 parallax-light" />
        {/* Spotlight behind hero */}
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[50vw] h-[40vw] max-w-[700px] rounded-full filter blur-[95px] bg-purple-500/[0.04] pointer-events-none z-0" />
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(2,6,23,0.45)_80%,rgba(2,6,23,0.85)_100%)] pointer-events-none z-0" />

        {/* Soft animated fog */}
        <div className="absolute inset-0 opacity-[0.025] filter blur-[50px] pointer-events-none z-0 bg-[radial-gradient(circle_at_25%_30%,rgba(255,255,255,0.06)_0%,transparent_60%)] animate-fog-slow" />

        {/* Twinkling Star Field (Deterministic Setup) */}
        {backgroundStars.map((star, idx) => (
          <div
            key={idx}
            className="star-glow absolute rounded-full bg-white pointer-events-none z-0"
            style={{
              top: star.top,
              left: star.left,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: 0.5,
              boxShadow: `0 0 ${star.size * 3}px rgba(255,255,255,0.7)`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Curved SVG Orbital Trails & connection lines */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden="true">
        <svg className="absolute inset-0 w-full h-full" style={{ minHeight: '100%' }}>
          {/* Orbits */}
          <path
            d="M -100 150 C 300 20 700 250 1300 80"
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="1"
          />
          <path
            d="M -100 150 C 300 20 700 250 1300 80"
            fill="none"
            stroke="url(#orbit-glow-blue)"
            strokeWidth="2"
            className="animate-trail-1"
          />

          <path
            d="M -200 600 C 400 850 800 500 1400 750"
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="1"
          />
          <path
            d="M -200 600 C 400 850 800 500 1400 750"
            fill="none"
            stroke="url(#orbit-glow-purple)"
            strokeWidth="2.5"
            className="animate-trail-2"
          />

          {/* Connect horizontal line */}
          <path
            d="M 150 480 L 850 480"
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="0.75"
            strokeDasharray="4 6"
          />
        </svg>
      </div>

      {/* ─────────────────────────────────────────────────────────
         USDC FLOATING COINS (EXACTLY 6 COINS)
         Symmetrically positioned to frame the hero layout.
         ───────────────────────────────────────────────────────── */}
      {/* Coin 1: Upper-Left (Background/Midground framing) */}
      <div className="coin-wrapper coin-parallax-3 hidden md:block z-10 drop-shadow-[0_0_20px_rgba(56,189,248,0.30)]" style={{ left: '19%', top: '18%', transform: 'rotate(15deg)', filter: 'blur(1.5px)', opacity: 0.65 }}>
        <div className="coin-3d animate-float-3">
          <USDCCoin size={75} side="left" className="animate-rotate-3" />
        </div>
      </div>

      {/* Coin 2: Mid-Left (Flanking Headline/CTAs) */}
      <div className="coin-wrapper coin-parallax-1 hidden md:block z-30 drop-shadow-[0_0_35px_rgba(0,240,255,0.35)]" style={{ left: '10%', top: '45%', transform: 'rotate(-22deg)' }}>
        <div className="coin-3d animate-float-1">
          <USDCCoin size={115} side="left" className="animate-rotate-1" />
        </div>
      </div>

      {/* Coin 3: Lower-Left (Flanking Dashboard Top/Middle) */}
      <div className="coin-wrapper coin-parallax-2 hidden md:block z-50 drop-shadow-[0_0_25px_rgba(0,240,255,0.25)]" style={{ left: '12%', top: '68%', transform: 'rotate(8deg)', filter: 'blur(3.5px)', opacity: 0.95 }}>
        <div className="coin-3d animate-float-2">
          <USDCCoin size={160} side="left" className="animate-rotate-2" />
        </div>
      </div>

      {/* Coin 4: Upper-Right (Background/Midground framing) */}
      <div className="coin-wrapper coin-parallax-5 hidden md:block z-10 drop-shadow-[0_0_20px_rgba(232,121,249,0.30)]" style={{ right: '21%', top: '15%', transform: 'rotate(-18deg)', filter: 'blur(1.5px)', opacity: 0.65 }}>
        <div className="coin-3d animate-float-5">
          <USDCCoin size={85} side="right" className="animate-rotate-5" />
        </div>
      </div>

      {/* Coin 5: Mid-Right (Flanking Headline/CTAs) */}
      <div className="coin-wrapper coin-parallax-4 hidden md:block z-30 drop-shadow-[0_0_40px_rgba(240,36,255,0.35)]" style={{ right: '9%', top: '41%', transform: 'rotate(25deg)' }}>
        <div className="coin-3d animate-float-4">
          <USDCCoin size={125} side="right" className="animate-rotate-4" />
        </div>
      </div>

      {/* Coin 6: Lower-Right (Flanking Dashboard Top/Middle) */}
      <div className="coin-wrapper coin-parallax-6 hidden md:block z-50 drop-shadow-[0_0_20px_rgba(217,70,239,0.25)]" style={{ right: '10%', top: '69%', transform: 'rotate(-12deg)', filter: 'blur(3.5px)', opacity: 0.95 }}>
        <div className="coin-3d animate-float-6">
          <USDCCoin size={170} side="right" className="animate-rotate-6" />
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────
         BOTTOM ENERGY PLATFORMS
         ───────────────────────────────────────────────────────── */}
      <div className="absolute bottom-[2%] left-[-2%] pointer-events-none z-0 opacity-80 w-[520px] h-[520px] animate-pulse-slow">
        <svg width="100%" height="100%" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="80" fill="url(#energyGlow)" />
          <ellipse cx="100" cy="120" rx="75" ry="25" stroke="url(#ringGrad)" strokeWidth="1.5" opacity="0.6" />
          <ellipse cx="100" cy="120" rx="55" ry="18" stroke="url(#ringGrad)" strokeWidth="1" opacity="0.8" strokeDasharray="6 4" className="animate-spin-slow" />
          <ellipse cx="100" cy="120" rx="35" ry="12" stroke="#38bdf8" strokeWidth="2" opacity="0.9" />
          <path d="M 100 120 L 70 0" stroke="rgba(79, 140, 255, 0.15)" strokeWidth="1.5" />
          <path d="M 100 120 L 130 0" stroke="rgba(214, 93, 252, 0.15)" strokeWidth="1.5" />
          <path d="M 100 120 L 100 0" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="2.5" />
        </svg>
      </div>

      <div className="absolute bottom-[2%] right-[-2%] pointer-events-none z-0 opacity-80 w-[520px] h-[520px] animate-pulse-slow" style={{ animationDelay: '-2s' }}>
        <svg width="100%" height="100%" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="80" fill="url(#energyGlow)" />
          <ellipse cx="100" cy="120" rx="75" ry="25" stroke="url(#ringGrad)" strokeWidth="1.5" opacity="0.6" />
          <ellipse cx="100" cy="120" rx="55" ry="18" stroke="url(#ringGrad)" strokeWidth="1" opacity="0.8" strokeDasharray="6 4" className="animate-spin-slow" />
          <ellipse cx="100" cy="120" rx="35" ry="12" stroke="#38bdf8" strokeWidth="2" opacity="0.9" />
          <path d="M 100 120 L 70 0" stroke="rgba(79, 140, 255, 0.15)" strokeWidth="1.5" />
          <path d="M 100 120 L 130 0" stroke="rgba(214, 93, 252, 0.15)" strokeWidth="1.5" />
          <path d="M 100 120 L 100 0" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="2.5" />
        </svg>
      </div>

      {/* ── Page Content Container (Width: min(94vw, 1500px) Centered) ── */}
      <div className="relative z-30 mx-auto w-[94vw] max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <section className="relative min-h-[100svh] overflow-hidden bg-transparent">
          {/* Floating particles */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {particles.map((p, i) => (
              <span
                key={i}
                className="particle absolute rounded-full"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.s}px`,
                  height: `${p.s}px`,
                  background: p.blue ? "#4f8cff" : "rgba(255,255,255,0.45)",
                  boxShadow: p.blue
                    ? `0 0 ${p.s * 5}px rgba(79,140,255,0.85)`
                    : `0 0 ${p.s * 3}px rgba(255,255,255,0.40)`,
                  animation: `${i % 2 === 0 ? "particle-float" : "particle-float-alt"} ${p.dur}s ease-in-out infinite`,
                  animationDelay: `${p.delay}s`,
                }}
              />
            ))}
          </div>

          {/* Hero copy - occupying upper 42-48% of viewport */}
          <div className="relative z-10 mx-auto max-w-[1250px] text-center pt-14 md:pt-16 pb-2">
            {/* Stacked Logo centerpiece at the top of composition */}
            <div className="flex flex-col items-center justify-center text-center animate-fade-up max-w-[1250px] mx-auto mb-4">
              {/* Status chips nested tightly above the logo */}
              <div className="mb-4 flex flex-wrap items-center justify-center gap-3 animate-fade-up">
                <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold badge-live tracking-wide">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Arc Testnet · Live
                </span>
                <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold badge-arc tracking-wide">
                  <Activity className="h-3 w-3" />
                  Stablecoin payroll
                </span>
              </div>

              {/* Logo centerpiece (180px tall on desktop, 128px on mobile) */}
              <div className="relative inline-flex items-center justify-center group cursor-pointer shrink-0 mb-8">
                {/* Large Volumetric Atmospheric Glow behind the logo */}
                <div 
                  className="absolute w-[280px] h-[280px] md:w-[440px] md:h-[440px] rounded-full pointer-events-none opacity-60 mix-blend-screen blur-[100px] bg-gradient-to-tr from-[#6d5dfc]/25 via-[#4f8cff]/20 to-[#d65dfc]/25" 
                  style={{ transform: 'translate3d(0, 0, 0)' }}
                  aria-hidden="true" 
                />

                {/* Medium breathing glow aura */}
                <div 
                  className="absolute -inset-14 pointer-events-none transition-all duration-700 opacity-80 group-hover:opacity-100 group-hover:scale-105" 
                  aria-hidden="true" 
                >
                  <div className="w-36 h-36 md:w-56 md:h-56 rounded-full logo-glow-aura animate-logo-glow" />
                </div>
                <div 
                  ref={logoRef}
                  onMouseMove={handleLogoMouseMove}
                  onMouseLeave={handleLogoMouseLeave}
                  className="relative z-10 w-32 h-32 md:w-[180px] md:h-[180px] premium-logo-bloom"
                  style={{ 
                    perspective: 800,
                    transform: `rotateX(var(--logo-tilt-x, 0deg)) rotateY(var(--logo-tilt-y, 0deg))`,
                    transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                    transformStyle: 'preserve-3d'
                  }}
                >
                  <div className="w-full h-full animate-logo-float">
                    <Image
                      src="/paygrid-logo.png"
                      alt="PayGrix logo"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                </div>
              </div>

              {/* Display heading centered with premium width constraint and drop-shadow removed to prevent browser bounding box glitch */}
              <h1
                className="font-extrabold headline-cinematic tracking-tight animate-text-reveal text-center leading-[0.95] max-w-[950px] mx-auto drop-shadow-none mb-6"
                style={{
                  fontSize: "clamp(54px, 6.2vw, 108px)",
                  letterSpacing: "-0.03em",
                }}
              >
                PayGrix for the
                <br />
                open internet
              </h1>
            </div>

            {/* Subtitle centered with tightened column constraint */}
            <p
              className="mx-auto mb-10 max-w-[620px] text-[16px] md:text-[18px] leading-relaxed text-slate-400 animate-fade-up text-center"
              style={{ animationDelay: '0.2s' }}
            >
              Stablecoin payroll infrastructure for crypto-native teams.
              Structured cycles, treasury clarity, and on-chain payment
              readiness — running on Arc Testnet.
            </p>

            {/* CTA actions with scaled up primary buttons */}
            <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center animate-fade-up" style={{ animationDelay: '0.35s' }}>
              <MagneticButton>
                <Button asChild size="lg" className="gap-2 text-[16px] px-10 h-[54px] btn-premium-cta">
                  <Link href="/dashboard">
                    Open workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </MagneticButton>
              <Button asChild variant="outline" size="lg" className="text-[16px] px-10 h-[54px] btn-secondary-cta">
                <Link href="/settings">Review settings</Link>
              </Button>
            </div>

            {/* Trust elements with larger margin to establish negative space boundary */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 animate-fade-up mb-8" style={{ animationDelay: '0.5s' }}>
              {trustItems.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#38bdf8]" />
                  <span className="text-sm text-slate-400 font-semibold">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dashboard reveal showcase card - centered, mt-2 below trust elements, max-w-[1360px] to act as a wide foundation */}
          <div className="relative z-30 mx-auto max-w-[1360px] w-full dashboard-reveal animate-fade-up mt-2 shadow-[0_-15px_60px_-15px_rgba(0,240,255,0.18),0_-15px_60px_-15px_rgba(240,36,255,0.18)]" style={{ animationDelay: '0.6s' }}>
            <div className="dashboard-outer showcase-panel-wrapper">
              <div 
                ref={panelRef}
                onMouseMove={handlePanelMouseMove}
                onMouseLeave={handlePanelMouseLeave}
                className="dashboard-tilt showcase-panel"
              >
                {/* Shell container for border glow */}
                <div className="glow-border-shell">
                  <div className="dashboard-card premium-showcase-card rounded-[17px] overflow-hidden animate-shimmer-sweep">
                    {/* Chrome title header */}
                    <div
                      className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/20"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: "#ff5f57" }} />
                        <span className="h-3 w-3 rounded-full" style={{ background: "#ffbd2e" }} />
                        <span className="h-3 w-3 rounded-full" style={{ background: "#28c840" }} />
                      </div>

                      <div
                        className="hidden sm:flex items-center gap-0.5 rounded-lg p-1 bg-slate-950/40 border border-slate-800/10"
                      >
                        {["Payroll", "Contributors", "Treasury"].map((t, i) => (
                          <button
                            key={t}
                            className="rounded-md px-3 py-1 text-xs font-medium transition-all"
                            style={
                              i === 0
                                ? {
                                    background: "rgba(37,99,255,0.22)",
                                    color: "#93c5fd",
                                    border: "1px solid rgba(79,140,255,0.28)",
                                  }
                                : { color: "rgba(148, 163, 184, 0.7)" }
                            }
                          >
                            {t}
                          </button>
                        ))}
                      </div>

                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold badge-arc">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                        Arc Testnet
                      </span>
                    </div>

                    {/* Body content (unchanged layout, enhanced classes) */}
                    <div className="p-5 space-y-3.5">
                      {/* Metrics grid */}
                      <div className="grid grid-cols-3 gap-3">
                        {metrics.map(({ label, value, delta, icon: Icon, rgb, iconColor }) => (
                          <div
                            key={label}
                            className="rounded-xl p-3.5 border-glow-hover showcase-metric-tile"
                          >
                            <div className="mb-2.5 flex items-center justify-between">
                              <p className="text-[11px] font-medium text-slate-500">
                                {label}
                              </p>
                              <div
                                className="rounded-lg p-1.5"
                                style={{
                                  background: `rgba(${rgb},0.14)`,
                                  border: `1px solid rgba(${rgb},0.25)`,
                                }}
                              >
                                <Icon className="h-3 w-3" style={{ color: iconColor }} />
                              </div>
                            </div>
                            <p className="text-xl font-bold tracking-tight text-white">{value}</p>
                            <p className="mt-0.5 text-[11px]" style={{ color: "#4f8cff" }}>{delta}</p>
                          </div>
                        ))}
                      </div>

                      {/* Progress details */}
                      <div className="rounded-xl p-4 showcase-progress-panel">
                        <div className="mb-4 flex items-center justify-between">
                          <p className="text-xs font-semibold text-white">Cycle preparation</p>
                          <span
                            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                            style={{
                              background: "rgba(37,99,255,0.11)",
                              border: "1px solid rgba(79,140,255,0.22)",
                              color: "#93c5fd",
                            }}
                          >
                            Jun 29
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {bars.map(({ label, pct, from, to }, i) => (
                            <div key={label}>
                              <div className="mb-1.5 flex justify-between text-[11px]">
                                <span className="text-slate-400">{label}</span>
                                <span className="font-bold text-white">{pct}%</span>
                              </div>
                              <div
                                className="h-1.5 rounded-full overflow-hidden"
                                style={{ background: "rgba(255,255,255,0.04)" }}
                              >
                                <div
                                  className={`h-1.5 rounded-full animate-bar ${
                                    i === 0 ? "animate-bar-delay-1"
                                    : i === 1 ? "animate-bar-delay-2"
                                    : "animate-bar-delay-3"
                                  }`}
                                  style={{
                                    width: `${pct}%`,
                                    background: `linear-gradient(to right, ${from}, ${to})`,
                                    boxShadow: `0 0 8px ${from}88`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Contributor List Table */}
                      <div className="rounded-xl overflow-hidden showcase-table">
                        {/* Table Header */}
                        <div className="flex items-center justify-between px-4 py-2.5 showcase-table-header">
                          <p className="text-xs font-semibold text-white">Staged contributors</p>
                          <button className="text-xs font-medium flex items-center gap-1" style={{ color: "#4f8cff" }}>
                            View all 18
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Contributor items */}
                        {transactions.map((tx, i) => (
                          <div
                            key={tx.name}
                            className={`flex items-center justify-between px-4 py-2.5 transition-all duration-200 hover:brightness-110 ${
                              i % 2 === 0 ? "showcase-table-row-even" : "showcase-table-row-odd"
                            } ${i === transactions.length - 1 ? "showcase-table-row-last" : ""}`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                style={{
                                  background: `radial-gradient(circle at top left, rgba(${tx.rgb},0.50), rgba(${tx.rgb},0.20))`,
                                  border: `1px solid rgba(${tx.rgb},0.28)`,
                                }}
                              >
                                {tx.name[0]}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-white leading-none mb-0.5">
                                  {tx.name}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {tx.role}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <p className="text-xs font-bold text-white">{tx.amount}</p>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{
                                  background: `rgba(${tx.rgb},0.12)`,
                                  border: `1px solid rgba(${tx.rgb},0.26)`,
                                  color: tx.statusColor,
                                }}
                              >
                                {tx.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Window footer */}
                    <div className="flex items-center justify-between px-5 py-3 showcase-footer">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <p className="text-xs text-slate-400">
                          Next cycle in 14 days
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold" style={{ color: "#4f8cff" }}>
                          Jun 29, 2025
                        </p>
                        <ArrowUpRight className="h-3 w-3" style={{ color: "#4f8cff" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section bottom fade effect */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#020617] to-transparent"
            aria-hidden="true"
          />
        </section>
      </div>

      {/* ══════════════════════════════════════════════
          SECTION DIVIDER
          ══════════════════════════════════════════════ */}
      <div className="section-divider mx-auto max-w-5xl" />

      {/* ══════════════════════════════════════════════
          PILLARS SECTION
          ══════════════════════════════════════════════ */}
      <section
        className="relative bg-gradient-to-b from-[#020617] via-slate-950/20 to-[#020617]"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-72 w-full max-w-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(109,93,252,0.12) 0%, transparent 70%)",
            filter: "blur(48px)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-16 space-y-4 text-center">
            <p
              className="text-xs font-bold tracking-[0.28em] uppercase"
              style={{ color: "#4f8cff" }}
            >
              Infrastructure
            </p>
            <h2
              className="text-4xl font-extrabold text-white sm:text-5xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Built for the chain
            </h2>
            <p
              className="mx-auto max-w-lg text-lg leading-relaxed text-slate-400"
            >
              Purpose-built for Arc Testnet — structured, auditable,
              and chain-native from the ground up.
            </p>
          </div>

          {/* Cards */}
          <div className="grid gap-5 md:grid-cols-3">
            {pillars.map((pillar) => (
              <Card
                key={pillar.title}
                className="group relative cursor-default overflow-hidden hover:-translate-y-2 border-glow-hover pillar-card"
              >
                {/* Accent glows */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(ellipse at top left, rgba(${pillar.glowRgb},0.10) 0%, transparent 65%)`,
                  }}
                  aria-hidden="true"
                />

                <div
                  className="absolute top-0 left-6 right-6 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: `linear-gradient(to right, transparent, rgba(${pillar.accentRgb},0.50), transparent)`,
                  }}
                  aria-hidden="true"
                />

                <CardHeader className="relative z-10 pb-3 pt-6">
                  <div
                    className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-premium group-hover:scale-110"
                    style={{
                      background: `rgba(${pillar.glowRgb},0.12)`,
                      border: `1px solid rgba(${pillar.glowRgb},0.24)`,
                      boxShadow: `0 0 20px rgba(${pillar.glowRgb},0.18)`,
                    }}
                  >
                    <pillar.icon className={`h-5 w-5 ${pillar.iconColor}`} />
                  </div>
                  <CardTitle className="text-[15px] font-semibold text-white">
                    {pillar.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="relative z-10">
                  <p className="text-sm leading-relaxed text-slate-400">
                    {pillar.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          FOOTER SECTION
          ══════════════════════════════════════════════ */}
      <div className="section-divider mx-auto max-w-5xl" />
      <footer className="bg-background border-t border-slate-200/5 dark:border-slate-800/20">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
             <div
               className="h-7 w-7 rounded-lg flex items-center justify-center"
               style={{
                 background: "linear-gradient(135deg, #4f8cff 0%, #6d5dfc 50%, #d65dfc 100%)",
                 boxShadow: "0 0 14px rgba(109,93,252,0.40)",
               }}
             >
              <span className="text-white text-[10px] font-extrabold">A</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <p className="text-xs text-slate-400">
                 PayGrix · Arc Testnet · Chain ID 5042002
              </p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xs text-slate-500 font-medium">Testnet connected</p>
              </div>
            </div>
          </div>
          <div className="flex items-center">
            <a
              href="https://x.com/janmd07"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-all group font-medium"
            >
              <span>Built by janmd</span>
              <span className="text-slate-600">•</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#6d5dfc]/10 border border-[#6d5dfc]/20 text-[#4f8cff] group-hover:bg-[#6d5dfc]/20 group-hover:border-[#6d5dfc]/40 shadow-[0_0_10px_rgba(109,93,252,0.1)] transition-all duration-300">
                <svg className="h-2.5 w-2.5 text-[#4f8cff] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Follow on X
              </span>
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
