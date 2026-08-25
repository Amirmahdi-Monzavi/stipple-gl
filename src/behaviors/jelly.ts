import { noise2 } from '../core/math';
import type { Behavior, SimContext } from '../core/types';

export const createJellyBehavior = (): Behavior => ({
  name: 'jelly',
  phase: 'deform',
  order: 20,
  step(ctx: SimContext): void {
    const { major, options, state } = ctx;
    const count = major.count;
    const intensity = options.jelly.intensity;
    if (count === 0 || intensity <= 0) return;

    const speed = options.jelly.speed;
    const time = state.time * 0.001;
    const engaged = state.morph > 0.985;
    const disturbed = state.pointer.active || state.shockwaves.length > 0;
    const weight = engaged ? (disturbed ? 0.45 : 1) : 0.06;

    const depthRange = 2 / Math.max(1, Math.hypot(state.viewport.width, state.viewport.height));

    for (let i = 0; i < count; i++) {
      const depth = major.spreadZ[i]! * depthRange + 1;
      const flicker = noise2(i * 0.04, time * 0.55) - 0.5;
      const waveA = (Math.sin(time * speed + i * 0.08) * 0.7 + flicker * 1.1) * intensity * depth;
      const waveB =
        (Math.cos(time * speed * 0.65 + i * 0.11) * 0.7 + flicker * 0.9) *
        intensity *
        0.45 *
        depth;
      major.tx[i] = major.tx[i]! + waveA * weight;
      major.ty[i] = major.ty[i]! + waveB * weight;
    }
  },
});
