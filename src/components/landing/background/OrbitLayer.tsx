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
        @keyframes orbit-star-travel-cw {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbit-star-travel-ccw {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes star-twinkle-a {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.22); opacity: 1; }
        }
        @keyframes star-twinkle-b {
          0%, 100% { transform: scale(1); opacity: 0.90; }
          50% { transform: scale(1.24); opacity: 1; }
        }

        .anim-orbit-cw {
          animation: orbit-slow-cw 60s linear infinite;
        }
        .anim-orbit-ccw {
          animation: orbit-slow-ccw 72s linear infinite;
        }
        .anim-star-cw {
          animation: orbit-star-travel-cw 26s linear infinite;
        }
        .anim-star-ccw {
          animation: orbit-star-travel-ccw 32s linear infinite;
        }
        .anim-twinkle-a {
          animation: star-twinkle-a 2.6s ease-in-out infinite;
          transform-origin: 500px 0px;
        }
        .anim-twinkle-b {
          animation: star-twinkle-b 3.1s ease-in-out infinite;
          transform-origin: 500px 0px;
        }

        @media (max-width: 639px) {
          .anim-orbit-cw, .anim-orbit-ccw {
            animation: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .anim-orbit-cw,
          .anim-orbit-ccw,
          .anim-star-cw,
          .anim-star-ccw,
          .anim-twinkle-a,
          .anim-twinkle-b {
            animation: none !important;
          }
        }
      ` }} />

      {/* ─────────────────────────────────────────────────────────
         ORBIT A — Wide Left Luminous Cyan Ring & Traveling Star
         ───────────────────────────────────────────────────────── */}
      {/* 1. Underlying Orbit Line & Atmospheric Shadow */}
      <div
        className="absolute top-[-15%] left-[-26%] w-[92vw] h-[92vw] max-w-[1350px] max-h-[1350px] rounded-full border-t-[2.5px] border-l-[2px] border-r-transparent border-b-transparent border-[#00f0ff]/65 anim-orbit-cw pointer-events-none sm:opacity-95"
        style={{
          boxShadow: "inset 0 0 32px rgba(0, 240, 255, 0.42), 0 0 20px rgba(56, 189, 248, 0.28)",
          WebkitMaskImage: "radial-gradient(circle at center, black 65%, transparent 92%)",
          maskImage: "radial-gradient(circle at center, black 65%, transparent 92%)",
        }}
      />

      {/* 2. Orbit A: Traveling Star Glint & Thin Tapered Streak */}
      <div className="absolute top-[-15%] left-[-26%] w-[92vw] h-[92vw] max-w-[1350px] max-h-[1350px] rounded-full pointer-events-none anim-star-cw">
        <svg viewBox="0 0 1000 1000" className="w-full h-full overflow-visible pointer-events-none">
          <defs>
            <linearGradient id="orbit-glint-streak-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0" />
              <stop offset="35%" stopColor="#00f0ff" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="65%" stopColor="#00f0ff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
            </linearGradient>
            <filter id="star-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Thin, sharp, tapered streak hugging the orbit path */}
          <path
            d="M 425 5.7 A 500 500 0 0 1 575 5.7"
            fill="none"
            stroke="url(#orbit-glint-streak-cyan)"
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#star-glow-cyan)"
          />

          {/* Star Glint Point: Micro-twinkling, sharp white center with soft halo */}
          <g className="anim-twinkle-a">
            {/* Soft atmospheric halo */}
            <circle cx="500" cy="0" r="8" fill="rgba(0, 240, 255, 0.40)" />
            {/* Inner glow */}
            <circle cx="500" cy="0" r="3.5" fill="#38bdf8" opacity="0.85" />
            {/* Bright sharp star center */}
            <circle cx="500" cy="0" r="2" fill="#ffffff" />
            {/* 4-point micro-sparkle cross */}
            <path
              d="M 500 -4.5 L 500 4.5 M 495.5 0 L 504.5 0"
              stroke="#ffffff"
              strokeWidth="0.8"
              strokeLinecap="round"
              opacity="0.95"
            />
          </g>
        </svg>
      </div>

      {/* ─────────────────────────────────────────────────────────
         ORBIT B — Wide Right Luminous Magenta Ring & Traveling Star
         ───────────────────────────────────────────────────────── */}
      {/* 1. Underlying Orbit Line & Atmospheric Shadow */}
      <div
        className="absolute top-[-10%] right-[-24%] w-[88vw] h-[88vw] max-w-[1250px] max-h-[1250px] rounded-full border-t-[2.5px] border-r-[2px] border-l-transparent border-b-transparent border-[#f024ff]/65 anim-orbit-ccw pointer-events-none hidden sm:block sm:opacity-95"
        style={{
          boxShadow: "inset 0 0 32px rgba(240, 36, 255, 0.42), 0 0 20px rgba(217, 70, 239, 0.28)",
          WebkitMaskImage: "radial-gradient(circle at center, black 65%, transparent 92%)",
          maskImage: "radial-gradient(circle at center, black 65%, transparent 92%)",
        }}
      />

      {/* 2. Orbit B: Traveling Star Glint & Thin Tapered Streak */}
      <div className="absolute top-[-10%] right-[-24%] w-[88vw] h-[88vw] max-w-[1250px] max-h-[1250px] rounded-full pointer-events-none hidden sm:block anim-star-ccw">
        <svg viewBox="0 0 1000 1000" className="w-full h-full overflow-visible pointer-events-none">
          <defs>
            <linearGradient id="orbit-glint-streak-magenta" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f024ff" stopOpacity="0" />
              <stop offset="35%" stopColor="#f024ff" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="65%" stopColor="#f024ff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f024ff" stopOpacity="0" />
            </linearGradient>
            <filter id="star-glow-magenta" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Thin, sharp, tapered streak hugging the orbit path */}
          <path
            d="M 425 5.7 A 500 500 0 0 1 575 5.7"
            fill="none"
            stroke="url(#orbit-glint-streak-magenta)"
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#star-glow-magenta)"
          />

          {/* Star Glint Point: Micro-twinkling, sharp white center with soft halo */}
          <g className="anim-twinkle-b">
            {/* Soft atmospheric halo */}
            <circle cx="500" cy="0" r="8" fill="rgba(240, 36, 255, 0.40)" />
            {/* Inner glow */}
            <circle cx="500" cy="0" r="3.5" fill="#e879f9" opacity="0.85" />
            {/* Bright sharp star center */}
            <circle cx="500" cy="0" r="2" fill="#ffffff" />
            {/* 4-point micro-sparkle cross */}
            <path
              d="M 500 -4.5 L 500 4.5 M 495.5 0 L 504.5 0"
              stroke="#ffffff"
              strokeWidth="0.8"
              strokeLinecap="round"
              opacity="0.95"
            />
          </g>
        </svg>
      </div>

      {/* ─────────────────────────────────────────────────────────
         ORBIT C — Inner Hero Indigo Ellipse Ring (Preserved)
         ───────────────────────────────────────────────────────── */}
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
