import type { Behavior, SimContext } from '../core/types';

export const createBreatheBehavior = (): Behavior => ({
  name: 'breathe',
  order: 15,
  step(ctx: SimContext): void {
    const { major, options, state } = ctx;
    const count = major.count;
    const amount = options.spread.breathe;
    if (count === 0 || amount <= 0) return;

    const time = state.time * 0.001;

    for (let i = 0; i < count; i++) {
      const seed = major.seed[i]!;
      const phase = time * (0.02 + (seed % 100) / 4000) + seed * 10;
      const fast = (Math.sin(phase) + 1) * 0.5;
      const slow = (Math.sin(phase * 0.15 + seed * 5) + 1) * 0.5;
      const value = (0.2 + fast * 0.7) * (0.85 + slow * 0.15);
      major.glow[i] = 1 + (value - 1) * amount;
    }
  },
});
