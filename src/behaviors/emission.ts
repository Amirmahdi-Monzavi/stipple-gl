import { noise2, parseColor, rand } from '../core/math';
import type { Behavior, EmissionState, SimContext } from '../core/types';

const spawn = (
  emission: EmissionState,
  x: number,
  y: number,
  z: number,
  spread: boolean,
  lifespan: number,
  speed: number,
  r: number,
  g: number,
  b: number,
): void => {
  const i = emission.count;
  if (i >= emission.capacity) return;

  const angle = spread ? Math.random() * Math.PI * 2 : -Math.PI / 2 + rand(-0.5, 0.5);
  const velocity = rand(0.05, 0.14) * speed * (spread ? 0.03 : 1);
  const life = rand(lifespan * 1.1, lifespan * 1.7) * (spread ? 6 : 1);
  const size = spread ? rand(3.2, 5.5) : rand(4.2, 6.8);

  emission.x[i] = x + rand(-2.5, 2.5);
  emission.y[i] = y + rand(-2.5, 2.5);
  emission.z[i] = z + rand(-1, 1);
  emission.vx[i] = Math.cos(angle) * velocity;
  emission.vy[i] = Math.sin(angle) * velocity;
  emission.vz[i] = rand(-0.25, 0.25);
  emission.life[i] = life;
  emission.maxLife[i] = life;
  emission.size[i] = size;
  emission.baseSize[i] = size;
  emission.opacity[i] = spread ? 0.55 : 0.95;
  emission.angle[i] = Math.random() * Math.PI * 2;
  emission.r[i] = r;
  emission.g[i] = g;
  emission.b[i] = b;

  emission.count = i + 1;
};

const remove = (emission: EmissionState, i: number): void => {
  const last = emission.count - 1;
  if (i !== last) {
    emission.x[i] = emission.x[last]!;
    emission.y[i] = emission.y[last]!;
    emission.z[i] = emission.z[last]!;
    emission.vx[i] = emission.vx[last]!;
    emission.vy[i] = emission.vy[last]!;
    emission.vz[i] = emission.vz[last]!;
    emission.life[i] = emission.life[last]!;
    emission.maxLife[i] = emission.maxLife[last]!;
    emission.size[i] = emission.size[last]!;
    emission.baseSize[i] = emission.baseSize[last]!;
    emission.opacity[i] = emission.opacity[last]!;
    emission.angle[i] = emission.angle[last]!;
    emission.r[i] = emission.r[last]!;
    emission.g[i] = emission.g[last]!;
    emission.b[i] = emission.b[last]!;
  }
  emission.count = last;
};

export const createEmissionBehavior = (): Behavior => ({
  name: 'emission',
  order: 70,
  step(ctx: SimContext): void {
    const { emission, major, options, state } = ctx;
    const config = options.emission;
    if (!config.enabled) {
      emission.count = 0;
      return;
    }

    const spread = state.morph < 0.1;
    const engaged = state.morph > 0.985;
    const limit = Math.min(config.max, emission.capacity);
    const [r, g, b] = parseColor(options.color);

    if (engaged && emission.count < limit) {
      const rate = config.rate;
      const [minBurst, maxBurst] = config.burst;
      for (let i = 0; i < major.count; i += 4) {
        if (Math.random() >= rate) continue;
        const burst = (minBurst + Math.random() * (maxBurst - minBurst + 1)) | 0;
        for (let n = 0; n < burst; n++) {
          if (emission.count >= limit) break;
          spawn(emission, major.x[i]!, major.y[i]!, major.z[i]!, false, config.lifespan, config.speed, r, g, b);
        }
        if (emission.count >= limit) break;
      }
    } else if (spread && emission.count < limit) {
      for (let i = 0; i < major.count; i += 8) {
        if (major.glow[i]! < 0.9 || Math.random() >= 0.0004) continue;
        spawn(emission, major.x[i]!, major.y[i]!, major.z[i]!, true, config.lifespan, config.speed, r, g, b);
        if (emission.count >= limit) break;
      }
    }

    const dt = state.dt;
    const { width, height } = state.viewport;
    const spiral = config.spiral;
    const turbulence = config.turbulence;
    const damp = spread ? 0.999 : 0.994;
    const dampZ = spread ? 0.999 : 0.99;
    const fade = spread ? 0.0015 : 0.007;
    const opacityScale = spread ? 0.9 : 1;
    const time = state.time * 0.001;

    for (let i = emission.count - 1; i >= 0; i--) {
      const angle = emission.angle[i]! + 0.0022;
      emission.angle[i] = angle;

      let vx = emission.vx[i]! + Math.cos(angle) * spiral;
      let vy = emission.vy[i]! + Math.sin(angle) * spiral;

      const x = emission.x[i]!;
      const y = emission.y[i]!;
      vx += (noise2(x * 0.005 + time, y * 0.005) - 0.5) * turbulence;
      vy += (noise2(x * 0.005, y * 0.005 + time) - 0.5) * turbulence;

      vx *= damp;
      vy *= damp;

      const nx = x + vx;
      const ny = y + vy;

      emission.vx[i] = vx;
      emission.vy[i] = vy;
      emission.vz[i] = emission.vz[i]! * dampZ;
      emission.x[i] = nx;
      emission.y[i] = ny;
      emission.z[i] = emission.z[i]! + emission.vz[i]!;

      const life = emission.life[i]! - dt * fade;
      emission.life[i] = life;

      if (life <= 0 || nx < -200 || nx > width + 200 || ny < -200 || ny > height + 200) {
        remove(emission, i);
        continue;
      }

      const ratio = life / emission.maxLife[i]!;
      emission.opacity[i] = Math.sqrt(ratio) * opacityScale;
      emission.size[i] = emission.baseSize[i]! * (0.75 + 0.25 * ratio);
    }
  },
});
