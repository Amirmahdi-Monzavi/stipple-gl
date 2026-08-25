import { noise2, resolveEasing } from '../core/math';
import type { Behavior, Choreography, SimContext } from '../core/types';

/** Launch time and own-flight window for one particle under a choreography. */
const launchOf = (delay: number, stagger: number): number => delay * stagger;

export const createMorphBehavior = (): Behavior => ({
  name: 'morph',
  phase: 'target',
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
    const time = state.time * 0.001;

    // Which way the morph is heading decides whose choreography is in force.
    const move: Choreography =
      state.targetMorph < state.morph ? state.choreo.exit : state.choreo.enter;

    const easing = resolveEasing(move.easing);
    const stagger = shaped ? Math.min(0.9, Math.max(0, move.stagger)) : 0;
    const span = 1 - stagger;
    const turbulence = shaped ? move.turbulence : 0;
    const flatEase = stagger > 0 ? 0 : easing(morph);
    const flash = move.flash;
    const flashWidth = Math.max(0.02, move.flashWidth);
    const flashing = flash > 0 && stagger > 0 && morph > 0 && morph < 1;

    // A swap runs on its own progress value and composes with the morph: it
    // decides *which* shape target a particle is heading for, then the morph
    // decides how far from the sphere toward that target it currently sits.
    const swapChoreo = state.choreo.swap;
    const swapping = state.swapping && swapChoreo !== null && major.hasShape;
    const swapProgress = state.swap;
    let swapEasing = easing;
    let swapStagger = 0;
    let swapSpan = 1;
    let swapFlatEase = 1;
    let swapTurbulence = 0;
    let swapFlash = 0;
    let swapFlashWidth = 0.22;
    let swapFlashing = false;

    if (swapping && swapChoreo) {
      swapEasing = resolveEasing(swapChoreo.easing);
      swapStagger = Math.min(0.9, Math.max(0, swapChoreo.stagger));
      swapSpan = 1 - swapStagger;
      swapFlatEase = swapStagger > 0 ? 0 : swapEasing(swapProgress);
      swapTurbulence = swapChoreo.turbulence;
      swapFlash = swapChoreo.flash;
      swapFlashWidth = Math.max(0.02, swapChoreo.flashWidth);
      swapFlashing = swapFlash > 0 && swapStagger > 0 && swapProgress > 0 && swapProgress < 1;
    }

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

      const delay = major.delay[i]!;

      // 1. Where is this particle's shape target right now? Mid-swap that is a
      //    point between the outgoing and incoming shapes.
      let goalX = major.shapeX[i]!;
      let goalY = major.shapeY[i]!;
      let goalZ = major.shapeZ[i]!;
      let swapLocal = 1;

      if (swapping) {
        if (swapStagger > 0) {
          const launch = launchOf(delay, swapStagger);
          const raw = (swapProgress - launch) / swapSpan;
          swapLocal = raw < 0 ? 0 : raw > 1 ? 1 : raw;
          swapLocal = swapEasing(swapLocal);
        } else {
          swapLocal = swapFlatEase;
        }

        const px = major.prevShapeX[i]!;
        const py = major.prevShapeY[i]!;
        const pz = major.prevShapeZ[i]!;
        goalX = px + (goalX - px) * swapLocal;
        goalY = py + (goalY - py) * swapLocal;
        goalZ = pz + (goalZ - pz) * swapLocal;
      }

      // 2. How far along the sphere-to-shape journey is it?
      let local = morph;
      let launch = 0;

      if (stagger > 0) {
        launch = launchOf(delay, stagger);
        local = (morph - launch) / span;
        local = local < 0 ? 0 : local > 1 ? 1 : local;
      }

      const eased = stagger > 0 ? easing(local) : flatEase;

      let tx = sx + (goalX - sx) * eased;
      let ty = sy + (goalY - sy) * eased;
      const tz = rz + (goalZ - rz) * eased;

      // 3. Flash belongs to whichever wavefront is actually crossing.
      if (swapFlashing) {
        const distance = Math.abs(swapProgress - launchOf(delay, swapStagger));
        major.flash[i] = distance < swapFlashWidth ? (1 - distance / swapFlashWidth) * swapFlash : 0;
      } else if (flashing) {
        const distance = Math.abs(morph - launch);
        major.flash[i] = distance < flashWidth ? (1 - distance / flashWidth) * flash : 0;
      } else if (major.flash[i] !== 0) {
        major.flash[i] = 0;
      }

      // 4. Turbulence, from whichever move is mid-flight.
      const inMorphFlight = local > 0 && local < 1;
      const inSwapFlight = swapping && swapLocal > 0 && swapLocal < 1;

      if (turbulence > 0 && inMorphFlight) {
        const burst = local * (1 - local) * 4;
        const amount = burst * turbulence;
        tx += (noise2(i * 0.13, time * 0.7) - 0.5) * amount;
        ty += (noise2(i * 0.17 + 55.3, time * 0.7) - 0.5) * amount;
      } else if (swapTurbulence > 0 && inSwapFlight) {
        const burst = swapLocal * (1 - swapLocal) * 4;
        const amount = burst * swapTurbulence;
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
