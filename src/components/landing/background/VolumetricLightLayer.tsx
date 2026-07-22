import React from "react";

export function VolumetricLightLayer() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-[8]" aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ray-sweep-left {
          0%, 100% { transform: rotate(16deg) translate(0px, 0px); opacity: 0.45; }
          50% { transform: rotate(18deg) translate(12px, -8px); opacity: 0.55; }
        }
        @keyframes ray-sweep-right {
          0%, 100% { transform: rotate(-16deg) translate(0px, 0px); opacity: 0.45; }
          50% { transform: rotate(-18deg) translate(-10px, 8px); opacity: 0.55; }
        }
        @keyframes ray-center-rise {
          0%, 100% { transform: translateY(0px) scaleY(1); opacity: 0.35; }
          50% { transform: translateY(-12px) scaleY(1.05); opacity: 0.45; }
        }

        .anim-ray-left {
          animation: ray-sweep-left 22s ease-in-out infinite alternate;
        }
        .anim-ray-right {
          animation: ray-sweep-right 26s ease-in-out infinite alternate;
        }
        .anim-ray-center {
          animation: ray-center-rise 30s ease-in-out infinite alternate;
        }

        @media (prefers-reduced-motion: reduce) {
          .anim-ray-left, .anim-ray-right, .anim-ray-center {
            animation: none !important;
          }
        }
      ` }} />

      {/* A. Left Cyan Volumetric Ray Beam */}
      <div
        className="absolute top-[-8%] left-[-18%] w-[70vw] h-[26vw] max-w-[1150px] max-h-[420px] rounded-full anim-ray-left pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(0, 240, 255, 0.60) 0%, rgba(6, 182, 212, 0.40) 35%, rgba(37, 99, 235, 0.18) 70%, transparent 92%)",
          filter: "blur(65px)",
        }}
      />

      {/* B. Right Magenta Volumetric Ray Beam */}
      <div
        className="absolute top-[-2%] right-[-18%] w-[68vw] h-[25vw] max-w-[1100px] max-h-[400px] rounded-full anim-ray-right pointer-events-none"
        style={{
          background: "linear-gradient(-135deg, rgba(240, 36, 255, 0.60) 0%, rgba(217, 70, 239, 0.40) 35%, rgba(147, 51, 234, 0.18) 70%, transparent 92%)",
          filter: "blur(70px)",
        }}
      />

      {/* C. Center Vertical Soft Upward Light Core */}
      <div
        className="absolute top-[16%] left-[46%] -translate-x-1/2 w-[45vw] h-[58vh] max-w-[700px] max-h-[650px] rounded-full anim-ray-center pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.42) 0%, rgba(168, 85, 247, 0.28) 50%, transparent 80%)",
          filter: "blur(85px)",
        }}
      />
    </div>
  );
}
