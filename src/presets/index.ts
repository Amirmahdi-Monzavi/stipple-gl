import { createMinimalBehaviors } from '../behaviors';
import { easeInOutCubic, easeOutExpo } from '../core/math';
import type { StippleConfig } from '../core/types';

export const morph: StippleConfig = {
  count: 3500,
  minorCount: 260,
  major: { size: 5, follow: 0.1, followSpread: 0.016 },
  assign: 'angular',
  transition: {
    enter: { speed: 0.014, easing: easeInOutCubic, stagger: 0.82, order: 'x', turbulence: 16 },
    exit: 'mirror',
    swap: { speed: 0.02, easing: easeInOutCubic, stagger: 0.7, order: 'x', turbulence: 10 },
  },
  jelly: { intensity: 2.4, speed: 1.35 },
  emission: { enabled: true },
  pointer: { enabled: true, shockwave: true },
};

export const snap: StippleConfig = {
  count: 3000,
  minorCount: 200,
  major: { size: 5.6, follow: 0.12, followSpread: 0.02, damping: 0.94, settle: 0.12 },
  assign: 'angular',
  transition: {
    enter: { speed: 0.03, easing: easeOutExpo, stagger: 0.72, order: 'radial', turbulence: 26 },
    exit: 'mirror',
    swap: { speed: 0.045, easing: easeOutExpo, stagger: 0.55, order: 'radial', turbulence: 18 },
  },
  jelly: { intensity: 1.6, speed: 2 },
  spread: { zoom: 1.05, drift: 0.03, rotation: 0.07 },
  emission: { enabled: true, rate: 0.01, max: 90 },
};

export const starfield: StippleConfig = {
  count: 0,
  minorCount: 900,
  minor: {
    size: 4,
    sizeBias: 3,
    sizeJitter: 1.6,
    speed: 0.35,
    turbulence: 0.18,
    maxSpeed: 0.12,
    opacity: { x: 0.06, y: 1 },
  },
  softness: 2.6,
  emission: { enabled: false },
  pointer: { enabled: false },
  jelly: { intensity: 0 },
  spread: { zoom: 1, drift: 0 },
  behaviors: createMinimalBehaviors(),
};

export const constellation: StippleConfig = {
  count: 1200,
  minorCount: 420,
  major: { size: 4.2, sizeBias: 2.2, followSpread: 0.02, twinkle: 0.28 },
  spread: { breathe: 0.6, flow: 0.0022, zoom: 1.05, drift: 0.025, rotation: 0.06 },
  minor: { size: 3, sizeBias: 2.6, speed: 0.6, turbulence: 0.3, opacity: { x: 0.08, y: 0.95 } },
  emission: { enabled: false },
  pointer: { enabled: false },
  jelly: { intensity: 1.1, speed: 0.8 },
};

export const nebula: StippleConfig = {
  count: 2600,
  minorCount: 600,
  blend: 'additive',
  softness: 0.9,
  opacity: 0.75,
  major: { size: 8, sizeBias: 2.6, twinkle: 0.32, depth: 1.1 },
  spread: { breathe: 1.2, flow: 0.0011, zoom: 1.15, drift: 0.012, rotation: 0.035 },
  minor: { size: 5, sizeBias: 3, sizeScale: 1.3, speed: 0.4, turbulence: 0.22 },
  emission: { enabled: true, max: 200, lifespan: 120, speed: 0.5 },
  jelly: { intensity: 1.8, speed: 0.55 },
};

export const dust: StippleConfig = {
  count: 0,
  minorCount: 700,
  minor: {
    size: 5,
    sizeBias: 2.2,
    sizeJitter: 0.8,
    speed: 0.22,
    turbulence: 0.12,
    maxSpeed: 0.08,
    opacity: { x: 0.14, y: 0.85 },
  },
  opacity: 0.9,
  softness: 2.8,
  emission: { enabled: false },
  pointer: { enabled: false },
  jelly: { intensity: 0 },
  spread: { zoom: 1, drift: 0 },
  behaviors: createMinimalBehaviors(),
};

export const presets = {
  morph,
  snap,
  starfield,
  constellation,
  nebula,
  dust,
} as const;

export type PresetName = keyof typeof presets;
