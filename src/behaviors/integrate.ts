import type { Behavior, SimContext } from '../core/types';

export const createIntegrateBehavior = (): Behavior => ({
  name: 'integrate',
  phase: 'integrate',
  order: 50,
  step(ctx: SimContext): void {
    const { major, options, state } = ctx;
    const count = major.count;
    if (count === 0) return;

    const morph = state.morph;
    const config = options.major;
    const engaged = morph > 0.985;
    const disturbed = state.pointer.active || state.shockwaves.length > 0;

    let follow = config.followSpread + (config.follow - config.followSpread) * morph;
    if (engaged && disturbed) {
      follow = Math.max(follow, 0.22);
    } else if (morph > 0.999) {
      follow = options.major.settle;
    }

    follow = 1 - Math.pow(1 - follow, state.dtScale);
    if (follow > 1) follow = 1;

    const velocity = config.velocity;
    const damping = major.hasShape ? 1 - morph * (1 - config.damping) : 1;
    const drift = engaged ? 0.05 : damping;
    const decay = engaged ? 0.88 : 1;

    for (let i = 0; i < count; i++) {
      const x = major.x[i]!;
      const y = major.y[i]!;
      const z = major.z[i]!;

      major.x[i] = x + (major.tx[i]! - x) * follow + major.vx[i]! * velocity * drift;
      major.y[i] = y + (major.ty[i]! - y) * follow + major.vy[i]! * velocity * drift;
      major.z[i] = z + (major.tz[i]! - z) * follow + major.vz[i]! * velocity * drift;
    }

    if (decay !== 1) {
      for (let i = 0; i < count; i++) {
        major.vx[i] = major.vx[i]! * decay;
        major.vy[i] = major.vy[i]! * decay;
        major.vz[i] = major.vz[i]! * 0.92;
      }
    }
  },
});
