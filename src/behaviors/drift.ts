import { noise2 } from '../core/math';
import type { Behavior, SimContext } from '../core/types';

export const createDriftBehavior = (): Behavior => ({
  name: 'drift',
  order: 60,
  step(ctx: SimContext): void {
    const { minor, options, state } = ctx;
    const count = minor.count;
    if (count === 0) return;

    const config = options.minor;
    const { width, height } = state.viewport;
    const time = state.time * 0.001;
    const maxSpeed = config.maxSpeed;
    const maxSpeedSq = maxSpeed * maxSpeed;
    const drag = config.drag;
    const turbulence = config.turbulence;
    const speed = config.speed;
    const sizeBase = config.size;
    const jitter = config.sizeJitter;
    const minOpacity = config.opacity.x;
    const maxOpacity = config.opacity.y;
    const midOpacity = (minOpacity + maxOpacity) * 0.5;
    const respawn = config.respawnChance;

    for (let i = 0; i < count; i++) {
      const seed = minor.seed[i]!;
      const t = time + seed;
      const x = minor.x[i]!;
      const y = minor.y[i]!;

      const noiseX = noise2(x * 0.003 + t * 0.5, y * 0.003) - 0.5;
      const noiseY = noise2(x * 0.003, y * 0.003 + t * 0.5) - 0.5;
      const angleNoise = noise2(t * 0.3, seed) * Math.PI * 2;
      const variation = 0.5 + 0.5 * noise2(t * 0.4, seed + 100);
      const push = speed * variation;

      let vx = minor.vx[i]! + (noiseX * turbulence + Math.cos(angleNoise) * 0.3) * push;
      let vy = minor.vy[i]! + (noiseY * turbulence + Math.sin(angleNoise) * 0.3) * push;

      vx *= drag;
      vy *= drag;

      const speedSq = vx * vx + vy * vy;
      if (speedSq > maxSpeedSq) {
        const scale = maxSpeed / Math.sqrt(speedSq);
        vx *= scale;
        vy *= scale;
      }

      let nx = x + vx;
      let ny = y + vy;

      if (nx < -50) nx = width + 50;
      else if (nx > width + 50) nx = -50;
      if (ny < -50) ny = height + 50;
      else if (ny > height + 50) ny = -50;

      if (Math.random() < respawn) {
        nx = Math.random() * width;
        ny = Math.random() * height;
        const angle = Math.random() * Math.PI * 2;
        const burst = 1.5 + Math.random() * 2;
        vx = Math.cos(angle) * burst;
        vy = Math.sin(angle) * burst;
      }

      minor.vx[i] = vx;
      minor.vy[i] = vy;
      minor.x[i] = nx;
      minor.y[i] = ny;
      minor.vz[i] = minor.vz[i]! * 0.96;
      minor.z[i] = minor.z[i]! + minor.vz[i]!;

      const flicker = 0.08 * (noise2(t * 8, seed) - 0.5);
      const opacity = midOpacity + flicker;
      minor.opacity[i] = opacity < minOpacity ? minOpacity : opacity > maxOpacity ? maxOpacity : opacity;

      const pulsate = 1 + 0.2 * (noise2(state.time * 0.008 + seed, seed + 7.7) - 0.5);
      const size = (sizeBase + (noise2(seed, seed * 1.7) - 0.5) * 2 * jitter) * pulsate;
      minor.size[i] = size < 1 ? 1 : size;
    }
  },
});
