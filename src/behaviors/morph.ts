import { noise2 } from '../core/math';
import type { Behavior, SimContext } from '../core/types';

export const createMorphBehavior = (): Behavior => ({
  name: 'morph',
  order: 10,
  step(ctx: SimContext): void {
    const { major, options, state } = ctx;
    const count = major.count;
    if (count === 0) return;

    const centerX = state.viewport.width * 0.5;
    const centerY = state.viewport.height * 0.5;

    const spin = state.spin;
    const cosSpin = Math.cos(spin);
    const sinSpin = Math.sin(spin);
    const tilt = options.spread.tilt;
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);

    const morph = state.morph;
    const shaped = major.hasShape && morph > 0;
    const easing = options.transition.easing;

    const stagger = shaped ? Math.min(0.9, Math.max(0, options.transition.stagger)) : 0;
    const span = 1 - stagger;
    const turbulence = shaped ? options.transition.turbulence : 0;
    const flatEase = stagger > 0 ? 0 : easing(morph);
    const time = state.time * 0.001;

    const sweep = options.transition.sweep;
    const sweepWidth = Math.max(0.02, options.transition.sweepWidth);
    const sweeping = sweep > 0 && stagger > 0 && morph > 0 && morph < 1;

    for (let i = 0; i < count; i++) {
      const lx = major.spreadX[i]!;
      const ly = major.spreadY[i]!;
      const lz = major.spreadZ[i]!;

      const rx = lx * cosSpin + lz * sinSpin;
      const rzSpin = lz * cosSpin - lx * sinSpin;
      const ry = ly * cosTilt - rzSpin * sinTilt;
      const rz = ly * sinTilt + rzSpin * cosTilt;

      const sx = centerX + rx;
      const sy = centerY + ry;

      if (!shaped) {
        major.tx[i] = sx;
        major.ty[i] = sy;
        major.tz[i] = rz;
        if (major.flash[i] !== 0) major.flash[i] = 0;
        continue;
      }

      let local = morph;
      let launch = 0;

      if (stagger > 0) {
        launch = major.delay[i]! * stagger;
        local = (morph - launch) / span;
        local = local < 0 ? 0 : local > 1 ? 1 : local;
      }

      if (sweeping) {
        const distance = Math.abs(morph - launch);
        major.flash[i] = distance < sweepWidth ? (1 - distance / sweepWidth) * sweep : 0;
      } else if (major.flash[i] !== 0) {
        major.flash[i] = 0;
      }

      const eased = stagger > 0 ? easing(local) : flatEase;

      let tx = sx + (major.shapeX[i]! - sx) * eased;
      let ty = sy + (major.shapeY[i]! - sy) * eased;
      const tz = rz + (major.shapeZ[i]! - rz) * eased;

      if (turbulence > 0 && local > 0 && local < 1) {
        const burst = local * (1 - local) * 4;
        const amount = burst * turbulence;
        tx += (noise2(i * 0.13, time * 0.7) - 0.5) * amount;
        ty += (noise2(i * 0.17 + 55.3, time * 0.7) - 0.5) * amount;
      }

      major.tx[i] = tx;
      major.ty[i] = ty;
      major.tz[i] = tz;
    }

    const spreadWeight = 1 - morph;
    if (spreadWeight <= 0.001) return;

    const flowScale = options.spread.flow;
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
