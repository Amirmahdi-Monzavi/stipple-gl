import type { Behavior, SimContext } from '../core/types';

export const createShockwaveBehavior = (): Behavior => ({
  name: 'shockwave',
  order: 40,
  step(ctx: SimContext): void {
    const { major, options, state } = ctx;
    const config = options.pointer;
    const waves = state.shockwaves;
    if (!config.shockwave || waves.length === 0 || state.morph < 0.985) return;

    const count = major.count;
    const thickness = config.shockwaveThickness;
    const life = config.shockwaveLife;
    const now = state.time;

    for (let w = 0; w < waves.length; w++) {
      const wave = waves[w]!;
      const elapsed = now - wave.time;
      const timeFalloff = 1 - elapsed / life;
      if (timeFalloff <= 0) continue;

      const radius = elapsed * config.shockwaveSpeed;
      const inner = radius - thickness;
      const outer = radius + thickness;
      const innerSq = inner > 0 ? inner * inner : 0;
      const outerSq = outer * outer;
      const amplitude = timeFalloff * wave.strength * config.shockwaveForce;

      for (let i = 0; i < count; i++) {
        const dx = major.x[i]! - wave.x;
        const dy = major.y[i]! - wave.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= innerSq || distSq >= outerSq) continue;

        const dist = Math.sqrt(distSq);
        const force = (1 - Math.abs(dist - radius) / thickness) * amplitude;
        const inv = dist > 0.0001 ? 1 / dist : 0;
        major.tx[i] = major.tx[i]! + dx * inv * force;
        major.ty[i] = major.ty[i]! + dy * inv * force;
        major.tz[i] = major.tz[i]! + force * 0.12;
      }
    }
  },
});
