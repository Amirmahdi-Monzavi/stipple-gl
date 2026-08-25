import type { Behavior, SimContext } from '../core/types';

export const createPointerBehavior = (): Behavior => ({
  name: 'pointer',
  order: 30,
  step(ctx: SimContext): void {
    const { major, options, state } = ctx;
    const config = options.pointer;
    if (!config.enabled || !state.pointer.active || state.morph < 0.985) return;

    const count = major.count;
    const radius = config.radius;
    const radiusSq = radius * radius;
    const press = state.pointer.down ? config.press : 1;
    const strength = config.force * press;
    const falloff = config.falloff;
    const px = state.pointer.x;
    const py = state.pointer.y;

    for (let i = 0; i < count; i++) {
      const dx = major.x[i]! - px;
      const dy = major.y[i]! - py;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radiusSq || distSq < 0.0001) continue;

      const dist = Math.sqrt(distSq);
      const force = Math.pow(1 - dist / radius, falloff) * strength;
      const inv = 1 / dist;
      major.tx[i] = major.tx[i]! + dx * inv * force;
      major.ty[i] = major.ty[i]! + dy * inv * force;
    }
  },
});
