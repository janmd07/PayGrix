"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { motion } from "framer-motion";

export function HealthCard() {

  // V1 static configurations (easily replaceable with real analytics engine later)
  const healthScore = 0;
  const healthLabel = "Coming Soon";

  // SVG parameters
  const radius = 50;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (healthScore / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
    >
      <Card className="glass-card-component border-none">
        <CardContent className="p-6 flex flex-col items-center text-center">
          <div className="w-full flex justify-between items-center mb-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Wallet Health</span>
            <Activity className="h-4.5 w-4.5 text-slate-400" />
          </div>

          {/* SVG Circular Progress */}
          <div className="relative flex items-center justify-center mb-4">
            <svg
              height={radius * 2}
              width={radius * 2}
              className="transform -rotate-90"
            >
              <circle
                stroke="rgba(255, 255, 255, 0.05)"
                fill="transparent"
                strokeWidth={stroke}
                r={normalizedRadius}
                cx={radius}
                cy={radius}
              />
              <motion.circle
                stroke="#10b981"
                fill="transparent"
                strokeWidth={stroke}
                strokeDasharray={circumference + " " + circumference}
                style={{ strokeDashoffset }}
                r={normalizedRadius}
                cx={radius}
                cy={radius}
                strokeLinecap="round"
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-2xl font-black text-slate-500 leading-none">
                —
              </span>
              <span className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">
                Rating
              </span>
            </div>
          </div>

          {/* Health description */}
          <div className="space-y-1.5 w-full">
            <h4 className="text-md font-bold text-[#4f8cff] tracking-wide flex items-center justify-center gap-1.5">
              {healthLabel}
            </h4>
            
            <p className="text-xs text-slate-400 font-medium px-2 leading-relaxed">
              Wallet health score calculations and vulnerability diagnostics will be implemented in a future release.
            </p>
          </div>

          {/* Modular warning footer */}
          <div className="mt-5 w-full border-t border-white/5 pt-4">
            <div className="rounded-xl bg-white/3 p-3 text-[10px] text-left text-slate-400 font-medium space-y-1">
              <p className="font-bold text-slate-300">Future Analysis Parameters:</p>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                <li>Failed transaction frequency</li>
                <li>EIP-712 security warning signature logs</li>
                <li>Smart contract interactions audit</li>
              </ul>
              <p className="text-[#4f8cff] pt-1 text-[9px] font-bold">Health Engine V2 Coming Soon</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
