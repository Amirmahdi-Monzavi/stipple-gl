import { easeInOutCubic } from './math';
import type { StippleConfig, StippleOptions } from './types';

export const defaultOptions: StippleOptions = {
  count: 3500,
  minorCount: 260,
  mode: 'background',
  color: '#4f9c7d',
  minorColor: null,
  background: '',
  opacity: 1,
  blend: 'normal',
  softness: 0.55,
  dpr: 'auto',
  maxDpr: 2,
  maxFps: 0,
  autoPause: true,
  reducedMotion: 'respect',
  adaptiveQuality: true,
  major: {
    size: 6.4,
    sizeVariation: 0.6,
    follow: 0.1,
    followSpread: 0.016,
    velocity: 0.002,
    damping: 0.97,
    twinkle: 0.18,
    depth: 0.8,
  },
  minor: {
    size: 3,
    sizeJitter: 1,
    sizeScale: 1.2,
    speed: 1,
    turbulence: 0.4,
    drag: 0.99,
    maxSpeed: 0.28,
    opacity: { x: 0.35, y: 0.85 },
    respawnChance: 0.0005,
  },
  emission: {
    enabled: true,
    max: 140,
    lifespan: 62,
    speed: 0.85,
    rate: 0.016,
    burst: [1, 2],
    spiral: 0.0008,
    turbulence: 0.003,
  },
  transition: {
    speed: 0.012,
    easing: easeInOutCubic,
    assign: 'angular',
    settle: 0.1,
  },
  spread: {
    radius: 0.6,
    flow: 0.0015,
    breathe: 1,
    zoom: 1.45,
    pan: { x: 0.02, y: -0.015 },
    drift: 0.02,
    speed: 0.01,
  },
  jelly: {
    intensity: 2.4,
    speed: 1.35,
  },
  pointer: {
    enabled: true,
    radius: 150,
    force: 10,
    falloff: 1.6,
    press: 1.25,
    shockwave: true,
    shockwaveForce: 14,
    shockwaveSpeed: 0.18,
    shockwaveLife: 1600,
    shockwaveThickness: 110,
  },
  behaviors: null,
  backend: null,
  onReady: null,
  onError: null,
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Float32Array);

export const mergeOptions = <T>(base: T, patch: unknown): T => {
  if (patch === undefined) return base;
  if (!isPlainObject(patch) || !isPlainObject(base)) return patch as T;

  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const next = patch[key];
    if (next === undefined) continue;
    out[key] = isPlainObject(next) ? mergeOptions(out[key], next) : next;
  }
  return out as T;
};

export const resolveOptions = (config?: StippleConfig): StippleOptions =>
  mergeOptions(defaultOptions, config);

export const responsiveCount = (
  breakpoints: Array<[number, number]>,
  fallback: number,
  width: number,
): number => {
  for (const [maxWidth, count] of breakpoints) {
    if (width < maxWidth) return count;
  }
  return fallback;
};
