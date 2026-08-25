import { noise2 } from '../core/math';
import type { Behavior, SimContext } from '../core/types';

export const createMorphBehavior = (): Behavior => ({
  name: 'morph',
  order: 10,
  step(ctx: SimContext): void {
    const { major, options, state } = ctx;
    const count = major.count;
    if (count === 0) return;

    const eased = options.transition.easing(state.morph);

    if (major.hasShape && eased > 0) {
      for (let i = 0; i < count; i++) {
        const sx = major.spreadX[i]!;
        const sy = major.spreadY[i]!;
        const sz = major.spreadZ[i]!;
        major.tx[i] = sx + (major.shapeX[i]! - sx) * eased;
        major.ty[i] = sy + (major.shapeY[i]! - sy) * eased;
        major.tz[i] = sz + (major.shapeZ[i]! - sz) * eased;
      }
    } else {
      major.tx.set(major.spreadX.subarray(0, count));
      major.ty.set(major.spreadY.subarray(0, count));
      major.tz.set(major.spreadZ.subarray(0, count));
    }

    const spreadWeight = 1 - state.morph;
    if (spreadWeight <= 0.001) return;

    const flowScale = options.spread.flow;
    const time = state.time * 0.001;
    const blend = 0.015 * spreadWeight;

    for (let i = 0; i < count; i++) {
      const seed = major.seed[i]!;
      const x = major.x[i]!;
      const y = major.y[i]!;
      const flowX = noise2(x * flowScale + time * 0.05, y * flowScale + seed) - 0.5;
      const flowY = noise2(x * flowScale + seed, y * flowScale + time * 0.05) - 0.5;
      major.vx[i] = major.vx[i]! + (flowX * 0.7 - major.vx[i]!) * blend;
      major.vy[i] = major.vy[i]! + (flowY * 0.7 - major.vy[i]!) * blend;
    }
  },
});
