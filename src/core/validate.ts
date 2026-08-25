import { defaultOptions } from './options';
import type { StippleConfig } from './types';

/**
 * Development-only option checking.
 *
 * Every call site is wrapped in `process.env.NODE_ENV !== 'production'`, which
 * bundlers fold to `false` in production builds, so this whole module drops out.
 * Nothing here throws: a warning that lets the page keep running beats an
 * exception in a background animation.
 */

const RANGES: Record<string, [number, number]> = {
  opacity: [0, 1],
  softness: [0, 8],
  core: [0, 1],
  maxDpr: [0.5, 4],
  maxFps: [0, 240],
  count: [0, 200_000],
  minorCount: [0, 50_000],
  'major.size': [0, 64],
  'major.settle': [0, 1],
  'major.damping': [0, 1],
  'minor.size': [0, 64],
  'spread.radius': [0, 4],
  'spread.volume': [0, 1],
  'spread.zoom': [0.1, 4],
};

const CHOREOGRAPHY_RANGES: Record<string, [number, number]> = {
  speed: [0.0001, 1],
  stagger: [0, 0.9],
  turbulence: [0, 400],
  flash: [0, 1],
  flashWidth: [0.02, 1],
};

const ORDERS = ['random', 'x', 'y', 'radial', 'radar'];
const NAMES = ['uniform', 'sweep', 'burst'];

const warn = (message: string): void => {
  // eslint-disable-next-line no-console
  console.warn('stipple-gl: ' + message);
};

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keys a config may carry that are not part of StippleOptions. */
const EXTRA_KEYS = new Set(['worker', 'workerUrl', 'onDroppedOptions', 'shapes', 'backend']);

const checkUnknownKeys = (value: unknown, reference: unknown, path: string): void => {
  if (!isPlain(value) || !isPlain(reference)) return;

  for (const key of Object.keys(value)) {
    const full = path ? path + '.' + key : key;
    if (EXTRA_KEYS.has(key)) continue;

    if (!(key in reference)) {
      const candidates = Object.keys(reference);
      const near = candidates.find(
        (candidate) => candidate.toLowerCase() === key.toLowerCase(),
      );
      warn(
        'unknown option "' +
          full +
          '" was ignored.' +
          (near ? ' Did you mean "' + near + '"?' : ''),
      );
      continue;
    }

    // `transition.*` slots hold a choreography, which has its own shape.
    if (path === 'transition') continue;
    checkUnknownKeys(value[key], reference[key], full);
  }
};

const checkRange = (path: string, value: unknown): void => {
  const range = RANGES[path];
  if (!range || typeof value !== 'number') return;
  if (Number.isNaN(value)) {
    warn(path + ' is NaN.');
    return;
  }
  if (value < range[0] || value > range[1]) {
    warn(
      path + ' is ' + value + ', outside the usable range ' + range[0] + '..' + range[1] + '.',
    );
  }
};

const checkRanges = (value: unknown, path: string): void => {
  if (!isPlain(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const full = path ? path + '.' + key : key;
    checkRange(full, entry);
    if (isPlain(entry)) checkRanges(entry, full);
  }
};

const checkChoreography = (value: unknown, path: string): void => {
  if (typeof value === 'string') {
    if (path === 'transition.exit' && value === 'mirror') return;
    if (path === 'transition.swap' && value === 'none') return;
    if (!NAMES.includes(value)) {
      warn(
        path +
          ' is "' +
          value +
          '", which is not a choreography. Expected one of ' +
          NAMES.join(', ') +
          (path === 'transition.exit' ? ', mirror' : '') +
          (path === 'transition.swap' ? ', none' : '') +
          ', or an object.',
      );
    }
    return;
  }

  if (!isPlain(value)) return;

  for (const [key, entry] of Object.entries(value)) {
    if (key === 'order') {
      if (typeof entry === 'string' && !ORDERS.includes(entry)) {
        warn(
          path +
            '.order is "' +
            entry +
            '". Expected one of ' +
            ORDERS.join(', ') +
            (entry === 'angular' ? '. "angular" was renamed to "radar".' : '.'),
        );
      }
      continue;
    }

    const range = CHOREOGRAPHY_RANGES[key];
    if (range && typeof entry === 'number' && (entry < range[0] || entry > range[1])) {
      warn(
        path +
          '.' +
          key +
          ' is ' +
          entry +
          ', outside the usable range ' +
          range[0] +
          '..' +
          range[1] +
          '.',
      );
    }
  }
};

/** Warn about anything in a config that will not do what the caller expects. */
export const validateConfig = (config: StippleConfig | undefined): void => {
  if (!config) return;

  checkUnknownKeys(config, defaultOptions, '');
  checkRanges(config, '');

  const transition = config.transition;
  if (transition) {
    if (transition.enter !== undefined) checkChoreography(transition.enter, 'transition.enter');
    if (transition.exit !== undefined) checkChoreography(transition.exit, 'transition.exit');
    if (transition.swap !== undefined) checkChoreography(transition.swap, 'transition.swap');
  }

  if (config.count === 0 && config.behaviors === undefined && config.minorCount === undefined) {
    warn('count is 0, so this field has no major particles and cannot form a shape.');
  }

  const color = config.color;
  if (color !== undefined && typeof color !== 'string' && isPlain(color)) {
    if (color.type !== 'ramp' && color.type !== 'shape') {
      warn('color objects need a "type" of "ramp" or "shape".');
    }
  }
};
