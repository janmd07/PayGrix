import { AuroraLayer } from "./AuroraLayer";
import { VolumetricLightLayer } from "./VolumetricLightLayer";
import { OrbitLayer } from "./OrbitLayer";
import { ParticleLayer } from "./ParticleLayer";

export function BackgroundEffects() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <AuroraLayer />
      <VolumetricLightLayer />
      <OrbitLayer />
      <ParticleLayer />
    </div>
  );
}
