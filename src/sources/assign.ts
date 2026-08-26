import { shapeBounds } from './sample';
import type { AssignFn, AssignMode } from '../core/types';

export type { AssignMode } from '../core/types';

let angleScratch = new Float64Array(0);
let orderScratch = new Uint32Array(0);
let particleScratch = new Uint32Array(0);
let particleAngles = new Float64Array(0);

const shapeIndexCache: { list: number[] } = { list: [] };
const particleIndexCache: { list: number[] } = { list: [] };

const ensure = (count: number): void => {
  if (angleScratch.length < count) {
    angleScratch = new Float64Array(count);
    orderScratch = new Uint32Array(count);
    particleScratch = new Uint32Array(count);
    particleAngles = new Float64Array(count);
  }
};

const indexList = (cache: { list: number[] }, count: number): number[] => {
  const list = cache.list;
  if (list.length !== count) {
    list.length = count;
  }
  for (let i = 0; i < count; i++) list[i] = i;
  return list;
};

export const releaseAssignScratch = (): void => {
  angleScratch = new Float64Array(0);
  orderScratch = new Uint32Array(0);
  particleScratch = new Uint32Array(0);
  particleAngles = new Float64Array(0);
  shapeIndexCache.list = [];
  particleIndexCache.list = [];
};

export const assignTargets = (
  mode: AssignMode | AssignFn,
  points: Float32Array,
  count: number,
  spreadX: Float32Array,
  spreadY: Float32Array,
  outX: Float32Array,
  outY: Float32Array,
  outZ: Float32Array,
  depth: number,
  order?: Uint32Array,
): void => {
  const available = points.length >> 1;
  if (available === 0 || count === 0) return;

  // A caller-supplied pairing gets full control. We cannot know which source
  // point it picked, so shape colours fall back to identity order.
  if (typeof mode === 'function') {
    mode(points, count, spreadX, spreadY, outX, outY, outZ, depth);
    if (order) for (let i = 0; i < count; i++) order[i] = i % available;
    return;
  }

  if (mode === 'index') {
    for (let i = 0; i < count; i++) {
      const pick = i % available;
      outX[i] = points[pick * 2]!;
      outY[i] = points[pick * 2 + 1]!;
      outZ[i] = (Math.random() - 0.5) * depth;
      if (order) order[i] = pick;
    }
    return;
  }

  if (mode === 'random') {
    for (let i = 0; i < count; i++) {
      const pick = (Math.random() * available) | 0;
      outX[i] = points[pick * 2]!;
      outY[i] = points[pick * 2 + 1]!;
      outZ[i] = (Math.random() - 0.5) * depth;
      if (order) order[i] = pick;
    }
    return;
  }

  ensure(count);

  const { cx: shapeCx, cy: shapeCy } = shapeBounds(points);

  const shapeOrder = orderScratch.subarray(0, count);
  const shapeAngles = angleScratch.subarray(0, count);

  for (let i = 0; i < count; i++) {
    const source = i % available;
    shapeOrder[i] = source;
    shapeAngles[i] = Math.atan2(points[source * 2 + 1]! - shapeCy, points[source * 2]! - shapeCx);
  }

  let particleCx = 0;
  let particleCy = 0;
  for (let i = 0; i < count; i++) {
    particleCx += spreadX[i]!;
    particleCy += spreadY[i]!;
  }
  particleCx /= count;
  particleCy /= count;

  const particleOrder = particleScratch.subarray(0, count);
  const angles = particleAngles.subarray(0, count);

  for (let i = 0; i < count; i++) {
    particleOrder[i] = i;
    angles[i] = Math.atan2(spreadY[i]! - particleCy, spreadX[i]! - particleCx);
  }

  const shapeIndices = indexList(shapeIndexCache, count);
  shapeIndices.sort((a, b) => shapeAngles[a]! - shapeAngles[b]!);

  const particleIndices = indexList(particleIndexCache, count);
  particleIndices.sort((a, b) => angles[a]! - angles[b]!);

  for (let i = 0; i < count; i++) {
    const particle = particleIndices[i]!;
    const pick = shapeOrder[shapeIndices[i]!]!;
    outX[particle] = points[pick * 2]!;
    outY[particle] = points[pick * 2 + 1]!;
    outZ[particle] = (Math.random() - 0.5) * depth;
    if (order) order[particle] = pick;
  }
};
