"use client";

import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Props for the MagneticButton component
 */
export interface MagneticButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /**
   * Distance from center the button can move (in pixels).
   * Higher values allow more movement.
   * @default 0.8
   */
  strength?: number;
  /**
   * Maximum distance the cursor can be from the button center
   * before the magnetic effect is triggered (in pixels).
   * @default 100
   */
  maxDistance?: number;
}

/**
 * Aceternity UI Magnetic Button component.
 * Attracts the button element toward cursor when within active range,
 * releasing with spring physics on cursor exit.
 */
export const MagneticButton = ({
  children,
  className,
  strength = 0.8,
  maxDistance = 100,
  style,
  ...props
}: MagneticButtonProps) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distanceX = e.clientX - centerX;
    const distanceY = e.clientY - centerY;
    const distance = Math.hypot(distanceX, distanceY);

    if (distance < maxDistance) {
      const magneticX = distanceX * strength;
      const magneticY = distanceY * strength;
      setPosition({ x: magneticX, y: magneticY });
    } else {
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      ref={buttonRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative inline-flex items-center justify-center",
        className
      )}
      style={style}
      {...props}
    >
      <motion.div
        animate={{ x: position.x, y: position.y }}
        transition={{ type: "spring", stiffness: 150, damping: 25, mass: 0.1 }}
      >
        {children}
      </motion.div>
    </div>
  );
};
