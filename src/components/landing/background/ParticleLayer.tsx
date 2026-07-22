import React from "react";

interface ParticleData {
  id: number;
  top: string;
  left: string;
  size: number;
  opacity: number;
  color: string;
  shadow?: string;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
  visibility: string;
}

const PARTICLES: ParticleData[] = [
  // Mobile (1-10)
  { id: 1, top: "12%", left: "14%", size: 1.5, opacity: 0.50, color: "#38bdf8", shadow: "0 0 8px rgba(56, 189, 248, 0.9)", dx: 4, dy: -6, duration: 20, delay: 0, visibility: "block" },
  { id: 2, top: "26%", left: "82%", size: 1.5, opacity: 0.55, color: "#e879f9", shadow: "0 0 8px rgba(232, 121, 249, 0.9)", dx: -5, dy: 5, duration: 24, delay: 2, visibility: "block" },
  { id: 3, top: "40%", left: "20%", size: 1.5, opacity: 0.45, color: "#ffffff", shadow: "0 0 6px rgba(255, 255, 255, 0.8)", dx: 3, dy: -5, duration: 18, delay: 1, visibility: "block" },
  { id: 4, top: "56%", left: "78%", size: 1.5, opacity: 0.50, color: "#38bdf8", shadow: "0 0 8px rgba(56, 189, 248, 0.9)", dx: -4, dy: -4, duration: 22, delay: 4, visibility: "block" },
  { id: 5, top: "70%", left: "18%", size: 1.5, opacity: 0.45, color: "#c084fc", shadow: "0 0 8px rgba(192, 132, 252, 0.8)", dx: 5, dy: -3, duration: 26, delay: 3, visibility: "block" },
  { id: 6, top: "84%", left: "64%", size: 1.5, opacity: 0.40, color: "#ffffff", shadow: "0 0 6px rgba(255, 255, 255, 0.8)", dx: -3, dy: 6, duration: 28, delay: 5, visibility: "block" },
  { id: 7, top: "20%", left: "46%", size: 2, opacity: 0.35, color: "#93c5fd", dx: 4, dy: -5, duration: 25, delay: 1, visibility: "block" },
  { id: 8, top: "50%", left: "36%", size: 2, opacity: 0.38, color: "#f472b6", dx: -5, dy: 4, duration: 21, delay: 3, visibility: "block" },
  { id: 9, top: "76%", left: "52%", size: 2, opacity: 0.30, color: "#38bdf8", dx: 3, dy: -6, duration: 27, delay: 2, visibility: "block" },
  { id: 10, top: "16%", left: "32%", size: 2.5, opacity: 0.85, color: "#ffffff", shadow: "0 0 10px rgba(56, 189, 248, 0.95)", dx: 4, dy: -4, duration: 19, delay: 0.5, visibility: "block" },

  // Tablet (11-20)
  { id: 11, top: "8%", left: "60%", size: 1.5, opacity: 0.55, color: "#ffffff", shadow: "0 0 6px rgba(255, 255, 255, 0.8)", dx: -4, dy: 6, duration: 23, delay: 1.5, visibility: "hidden sm:block" },
  { id: 12, top: "22%", left: "70%", size: 1.5, opacity: 0.45, color: "#38bdf8", shadow: "0 0 8px rgba(56, 189, 248, 0.9)", dx: 5, dy: -5, duration: 17, delay: 4, visibility: "hidden sm:block" },
  { id: 13, top: "34%", left: "10%", size: 1.5, opacity: 0.50, color: "#e879f9", shadow: "0 0 8px rgba(232, 121, 249, 0.9)", dx: -3, dy: 7, duration: 25, delay: 2.5, visibility: "hidden sm:block" },
  { id: 14, top: "46%", left: "88%", size: 1.5, opacity: 0.45, color: "#ffffff", shadow: "0 0 6px rgba(255, 255, 255, 0.8)", dx: 4, dy: -6, duration: 20, delay: 6, visibility: "hidden sm:block" },
  { id: 15, top: "62%", left: "28%", size: 1.5, opacity: 0.50, color: "#38bdf8", shadow: "0 0 8px rgba(56, 189, 248, 0.9)", dx: -5, dy: 4, duration: 27, delay: 3.5, visibility: "hidden sm:block" },
  { id: 16, top: "78%", left: "80%", size: 1.5, opacity: 0.40, color: "#c084fc", shadow: "0 0 8px rgba(192, 132, 252, 0.8)", dx: 3, dy: -5, duration: 21, delay: 0.8, visibility: "hidden sm:block" },
  { id: 17, top: "90%", left: "42%", size: 1.5, opacity: 0.48, color: "#ffffff", shadow: "0 0 6px rgba(255, 255, 255, 0.8)", dx: -4, dy: -4, duration: 24, delay: 5.5, visibility: "hidden sm:block" },
  { id: 18, top: "30%", left: "58%", size: 2, opacity: 0.35, color: "#38bdf8", dx: 5, dy: -4, duration: 19, delay: 3, visibility: "hidden sm:block" },
  { id: 19, top: "66%", left: "62%", size: 2, opacity: 0.38, color: "#e879f9", dx: -4, dy: 5, duration: 26, delay: 1.2, visibility: "hidden sm:block" },
  { id: 20, top: "80%", left: "24%", size: 2.5, opacity: 0.80, color: "#38bdf8", shadow: "0 0 10px rgba(56, 189, 248, 0.95)", dx: -3, dy: -5, duration: 22, delay: 4, visibility: "hidden sm:block" },

  // Desktop (21-30)
  { id: 21, top: "6%", left: "24%", size: 1.5, opacity: 0.50, color: "#ffffff", shadow: "0 0 6px rgba(255, 255, 255, 0.8)", dx: 4, dy: -6, duration: 28, delay: 2, visibility: "hidden md:block" },
  { id: 22, top: "14%", left: "92%", size: 1.5, opacity: 0.42, color: "#38bdf8", shadow: "0 0 8px rgba(56, 189, 248, 0.9)", dx: -5, dy: 4, duration: 16, delay: 6.5, visibility: "hidden md:block" },
  { id: 23, top: "28%", left: "38%", size: 1.5, opacity: 0.55, color: "#e879f9", shadow: "0 0 8px rgba(232, 121, 249, 0.9)", dx: 3, dy: -5, duration: 24, delay: 1.8, visibility: "hidden md:block" },
  { id: 24, top: "44%", left: "12%", size: 1.5, opacity: 0.45, color: "#ffffff", shadow: "0 0 6px rgba(255, 255, 255, 0.8)", dx: -4, dy: 6, duration: 20, delay: 4.2, visibility: "hidden md:block" },
  { id: 25, top: "54%", left: "84%", size: 1.5, opacity: 0.50, color: "#38bdf8", shadow: "0 0 8px rgba(56, 189, 248, 0.9)", dx: 5, dy: -4, duration: 26, delay: 0.2, visibility: "hidden md:block" },
  { id: 26, top: "68%", left: "44%", size: 1.5, opacity: 0.38, color: "#c084fc", shadow: "0 0 8px rgba(192, 132, 252, 0.8)", dx: -3, dy: -5, duration: 22, delay: 3.8, visibility: "hidden md:block" },
  { id: 27, top: "86%", left: "86%", size: 1.5, opacity: 0.48, color: "#ffffff", shadow: "0 0 6px rgba(255, 255, 255, 0.8)", dx: 4, dy: 5, duration: 18, delay: 7.2, visibility: "hidden md:block" },
  { id: 28, top: "38%", left: "78%", size: 2, opacity: 0.32, color: "#93c5fd", dx: -4, dy: -4, duration: 23, delay: 4.8, visibility: "hidden md:block" },
  { id: 29, top: "10%", left: "76%", size: 2.5, opacity: 0.85, color: "#ffffff", shadow: "0 0 10px rgba(232, 121, 249, 0.95)", dx: 4, dy: -5, duration: 27, delay: 1, visibility: "hidden md:block" },
  { id: 30, top: "58%", left: "16%", size: 2.5, opacity: 0.80, color: "#c084fc", shadow: "0 0 10px rgba(192, 132, 252, 0.95)", dx: -4, dy: 5, duration: 21, delay: 5, visibility: "hidden md:block" },
];

export function ParticleLayer() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-5" aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: `
        ${PARTICLES.map(
          (p) => `
          @keyframes p-drift-${p.id} {
            0%, 100% { transform: translate(0px, 0px); }
            50% { transform: translate(${p.dx}px, ${p.dy}px); }
          }
          .p-anim-${p.id} {
            animation: p-drift-${p.id} ${p.duration}s ease-in-out ${p.delay}s infinite alternate;
          }
        `
        ).join("\n")}

        @media (prefers-reduced-motion: reduce) {
          ${PARTICLES.map((p) => `.p-anim-${p.id}`).join(", ")} {
            animation: none !important;
          }
        }
      ` }} />

      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className={`absolute rounded-full pointer-events-none p-anim-${p.id} ${p.visibility}`}
          style={{
            top: p.top,
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            opacity: p.opacity,
            boxShadow: p.shadow || undefined,
          }}
        />
      ))}
    </div>
  );
}
