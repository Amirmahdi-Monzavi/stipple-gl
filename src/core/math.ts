import type { Easing, RGB } from './types';

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const rand = (a = 0, b = 1): number => a + Math.random() * (b - a);

export const randInt = (a: number, b: number): number => (a + Math.random() * (b - a + 1)) | 0;

export const hash2i = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const noise2 = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h00 = hash2i(xi, yi);
  const h10 = hash2i(xi + 1, yi);
  const h01 = hash2i(xi, yi + 1);
  const h11 = hash2i(xi + 1, yi + 1);
  const a = h00 + (h10 - h00) * u;
  const b = h01 + (h11 - h01) * u;
  return a + (b - a) * v;
};

export const snoise2 = (x: number, y: number): number => noise2(x, y) - 0.5;

export const easeLinear: Easing = (t) => t;

export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeInOutQuad: Easing = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const easeOutExpo: Easing = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeInOutElastic: Easing = (t) => {
  const c5 = (2 * Math.PI) / 4.5;
  if (t === 0 || t === 1) return t;
  return t < 0.5
    ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
    : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
};

export const easings = {
  linear: easeLinear,
  inOutCubic: easeInOutCubic,
  inOutQuad: easeInOutQuad,
  outExpo: easeOutExpo,
  outBack: easeOutBack,
  inOutElastic: easeInOutElastic,
} as const;

export type EasingName = keyof typeof easings;

const HEX_SHORT = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
const HEX_LONG = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

export const parseColor = (input: string, fallback: RGB = [1, 1, 1]): RGB => {
  if (!input) return fallback;
  const value = input.trim();

  const short = HEX_SHORT.exec(value);
  if (short) {
    return [
      parseInt(short[1]! + short[1]!, 16) / 255,
      parseInt(short[2]! + short[2]!, 16) / 255,
      parseInt(short[3]! + short[3]!, 16) / 255,
    ];
  }

  const long = HEX_LONG.exec(value);
  if (long) {
    return [
      parseInt(long[1]!, 16) / 255,
      parseInt(long[2]!, 16) / 255,
      parseInt(long[3]!, 16) / 255,
    ];
  }

  const fn = RGB_FN.exec(value);
  if (fn) {
    return [Number(fn[1]) / 255, Number(fn[2]) / 255, Number(fn[3]) / 255];
  }

  return fallback;
};

export const fibonacciSphere = (
  index: number,
  count: number,
  out: { x: number; y: number; z: number },
): void => {
  const phi = Math.acos(1 - (2 * (index + 0.5)) / count);
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  const sinPhi = Math.sin(phi);
  out.x = Math.cos(theta) * sinPhi;
  out.y = Math.sin(theta) * sinPhi;
  out.z = Math.cos(phi);
};
