export function AuroraLayer() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10" aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cosmic-pulse-left {
          0%, 100% { transform: translate(0px, 0px) scale(1); opacity: 0.90; }
          50% { transform: translate(30px, -20px) scale(1.05); opacity: 1; }
        }
        @keyframes cosmic-pulse-right {
          0%, 100% { transform: translate(0px, 0px) scale(1); opacity: 0.90; }
          50% { transform: translate(-30px, 20px) scale(1.05); opacity: 1; }
        }
        @keyframes cosmic-core-glow {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.06); opacity: 0.98; }
        }
        @keyframes horizon-glow-drift {
          0%, 100% { transform: scaleX(1); opacity: 0.85; }
          50% { transform: scaleX(1.05); opacity: 1; }
        }

        .anim-cosmic-left {
          animation: cosmic-pulse-left 26s ease-in-out infinite alternate;
        }
        .anim-cosmic-right {
          animation: cosmic-pulse-right 30s ease-in-out infinite alternate;
        }
        .anim-cosmic-core {
          animation: cosmic-core-glow 22s ease-in-out infinite alternate;
        }
        .anim-horizon-glow {
          animation: horizon-glow-drift 32s ease-in-out infinite alternate;
        }

        @media (prefers-reduced-motion: reduce) {
          .anim-cosmic-left, .anim-cosmic-right, .anim-cosmic-core, .anim-horizon-glow {
            animation: none !important;
          }
        }
      ` }} />

      {/* 1. Base Deep Void Space Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#080d28] via-[#030617] to-[#01020a] opacity-98" />

      {/* 2. Left Vivid Electric Cyan Atmospheric Flare */}
      <div
        className="absolute top-[-5%] left-[-15%] w-[68vw] h-[68vw] max-w-[1100px] max-h-[1100px] rounded-full anim-cosmic-left pointer-events-none"
        style={{
          background: "radial-gradient(circle at center, rgba(0, 240, 255, 0.48) 0%, rgba(6, 182, 212, 0.38) 35%, rgba(37, 99, 235, 0.20) 65%, transparent 80%)",
          filter: "blur(110px)",
        }}
      />

      {/* 3. Right Vivid Magenta/Neon Violet Atmospheric Flare */}
      <div
        className="absolute top-[2%] right-[-15%] w-[66vw] h-[66vw] max-w-[1050px] max-h-[1050px] rounded-full anim-cosmic-right pointer-events-none"
        style={{
          background: "radial-gradient(circle at center, rgba(240, 36, 255, 0.48) 0%, rgba(217, 70, 239, 0.38) 35%, rgba(147, 51, 234, 0.20) 65%, transparent 80%)",
          filter: "blur(115px)",
        }}
      />

      {/* 4. Center Electric Indigo Core Backlight behind Logo & Headline */}
      <div
        className="absolute top-[8%] left-[45%] -translate-x-1/2 w-[58vw] h-[44vw] max-w-[950px] max-h-[650px] rounded-full anim-cosmic-core pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.42) 0%, rgba(139, 92, 246, 0.35) 40%, rgba(79, 70, 229, 0.18) 70%, transparent 85%)",
          filter: "blur(115px)",
        }}
      />

      {/* 5. Glowing Horizon Arc behind Dashboard Top Border */}
      <div
        className="absolute top-[52%] left-1/2 -translate-x-1/2 w-[110vw] h-[28vw] max-w-[1800px] rounded-[50%] anim-horizon-glow pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(0, 240, 255, 0.35) 0%, rgba(224, 36, 255, 0.30) 45%, transparent 80%)",
          filter: "blur(90px)",
        }}
      />
    </div>
  );
}
