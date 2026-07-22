import React from "react";

export function OrbitLayer() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]" aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes orbit-slow-cw {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbit-slow-ccw {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }

        .anim-orbit-cw {
          animation: orbit-slow-cw 60s linear infinite;
        }
        .anim-orbit-ccw {
          animation: orbit-slow-ccw 72s linear infinite;
        }

        @media (max-width: 639px) {
          .anim-orbit-cw, .anim-orbit-ccw {
            animation: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .anim-orbit-cw, .anim-orbit-ccw {
            animation: none !important;
          }
        }
      ` }} />

      {/* ORBIT A — Wide Left Luminous Cyan Ring */}
      <div
        className="absolute top-[-15%] left-[-26%] w-[92vw] h-[92vw] max-w-[1350px] max-h-[1350px] rounded-full border-t-[2px] border-l-[1.5px] border-r-transparent border-b-transparent border-[#00f0ff]/50 anim-orbit-cw pointer-events-none sm:opacity-95"
        style={{
          boxShadow: "inset 0 0 30px rgba(0, 240, 255, 0.45), 0 0 20px rgba(56, 189, 248, 0.35)",
          WebkitMaskImage: "radial-gradient(circle at center, black 65%, transparent 92%)",
          maskImage: "radial-gradient(circle at center, black 65%, transparent 92%)",
        }}
      />

      {/* ORBIT B — Wide Right Luminous Magenta Ring */}
      <div
        className="absolute top-[-10%] right-[-24%] w-[88vw] h-[88vw] max-w-[1250px] max-h-[1250px] rounded-full border-t-[2px] border-r-[1.5px] border-l-transparent border-b-transparent border-[#f024ff]/55 anim-orbit-ccw pointer-events-none hidden sm:block sm:opacity-95"
        style={{
          boxShadow: "inset 0 0 30px rgba(240, 36, 255, 0.45), 0 0 20px rgba(217, 70, 239, 0.35)",
          WebkitMaskImage: "radial-gradient(circle at center, black 65%, transparent 92%)",
          maskImage: "radial-gradient(circle at center, black 65%, transparent 92%)",
        }}
      />

      {/* ORBIT C — Inner Hero Indigo Ellipse Ring */}
      <div
        className="absolute top-[8%] left-[45%] -translate-x-1/2 w-[70vw] h-[40vw] max-w-[1000px] max-h-[580px] rounded-[50%] border-[1.5px] border-indigo-400/40 anim-orbit-cw pointer-events-none sm:opacity-90"
        style={{
          boxShadow: "0 0 25px rgba(99, 102, 241, 0.35)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 68%, transparent 94%)",
          maskImage: "radial-gradient(ellipse at center, black 68%, transparent 94%)",
        }}
      />
    </div>
  );
}
