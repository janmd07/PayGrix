"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: ReactNode;
  isLoading?: boolean;
  emptyState?: boolean;
  emptyText?: string;
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  isLoading = false,
  emptyState = false,
  emptyText = "No data available",
  onClick,
  className,
}: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Card
        onClick={onClick}
        className={cn(
          "glass-card-component overflow-hidden border-none h-full relative group",
          onClick && "cursor-pointer",
          className
        )}
      >
        <CardContent className="p-5 flex flex-col justify-between h-full min-h-[120px]">
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
            <div className="text-slate-400 group-hover:text-[#4f8cff] transition-all duration-300">
              {icon}
            </div>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="h-8 w-24 animate-pulse rounded bg-white/5" />
            ) : emptyState ? (
              <p className="text-sm font-semibold text-slate-500 italic">{emptyText}</p>
            ) : (
              <p className="text-2xl font-black text-white tracking-tight group-hover:text-[#4f8cff] transition-colors duration-300">
                {value}
              </p>
            )}
            <p className="mt-1 text-[10px] text-slate-500 font-semibold">{subtitle}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
