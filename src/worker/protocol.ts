import type { ChoreographyConfig, ShapeConfig, StippleConfig } from '../core/types';

export interface SerialViewport {
  width: number;
  height: number;
  dpr: number;
}

export interface ShapeBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type MainToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; config: StippleConfig; viewport: SerialViewport }
  | { type: 'resize'; viewport: SerialViewport }
  | { type: 'morph'; value: number }
  | {
      type: 'shape';
      shape: ShapeConfig | null;
      choreography?: ChoreographyConfig | 'none' | undefined;
    }
  | { type: 'options'; config: StippleConfig }
  | { type: 'reset'; config: StippleConfig }
  | { type: 'count'; count: number; minorCount: number }
  | { type: 'pointer'; x: number; y: number; active: boolean; down: boolean }
  | { type: 'pulse'; x: number; y: number; strength: number }
  | { type: 'run'; value: boolean }
  | { type: 'destroy' };

export type WorkerToMain =
  | { type: 'ready' }
  | { type: 'stats'; fps: number; morph: number; hasShape: boolean; box: ShapeBox }
  | { type: 'morphsettled'; value: number }
  | { type: 'error'; message: string };

const TRANSFERABLE_KEYS = new Set(['behaviors', 'backend', 'shapes', 'onReady', 'onError']);

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const droppedKeys: string[] = [];

export const sanitizeConfig = (config: StippleConfig | undefined): StippleConfig => {
  droppedKeys.length = 0;

  const clone = (value: unknown, path: string): unknown => {
    if (typeof value === 'function') {
      droppedKeys.push(path);
      return undefined;
    }
    if (Array.isArray(value)) return value.map((item, i) => clone(item, path + '[' + i + ']'));
    if (isPlain(value)) {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        if (TRANSFERABLE_KEYS.has(key)) {
          if (entry != null) droppedKeys.push(path ? path + '.' + key : key);
          continue;
        }
        const next = clone(entry, path ? path + '.' + key : key);
        if (next !== undefined) out[key] = next;
      }
      return out;
    }
    return value;
  };

  return (clone(config ?? {}, '') as StippleConfig) ?? {};
};

/**
 * A choreography can carry an easing function, which `postMessage` cannot clone.
 * Names survive; functions are dropped so the worker falls back to its default.
 */
export const sanitizeChoreography = (
  choreography: ChoreographyConfig | 'none' | undefined,
): ChoreographyConfig | 'none' | undefined => {
  if (choreography === undefined || typeof choreography === 'string') return choreography;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(choreography)) {
    if (typeof value === 'function') continue;
    out[key] = value;
  }
  return out;
};
