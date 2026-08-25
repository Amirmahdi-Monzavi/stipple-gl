import { clamp01 } from '../core/math';
import type { ShapeConfig, StippleInstance } from '../core/types';
import { shapeFromURL } from '../sources/shape';

export interface ScrollMorphOptions {
  sections: string | HTMLElement[];
  shapes: Record<string, ShapeConfig | string | null>;
  attribute?: string;
  fadeRange?: number;
  root?: HTMLElement | null;
  onChange?: (key: string | null, section: HTMLElement | null) => void;
}

export interface ScrollMorphController {
  refresh(): void;
  destroy(): void;
  readonly activeKey: string | null;
}

const INHERIT_NEXT = 'inherit-next';
const INHERIT_PREV = 'inherit-prev';

const resolveKey = (sections: HTMLElement[], index: number, attribute: string): string => {
  const seen = new Set<number>();
  let cursor = index;

  while (cursor >= 0 && cursor < sections.length && !seen.has(cursor)) {
    seen.add(cursor);
    const value = sections[cursor]?.getAttribute(attribute) ?? 'none';
    if (value === INHERIT_NEXT) cursor += 1;
    else if (value === INHERIT_PREV) cursor -= 1;
    else return value;
  }

  return 'none';
};

export const createScrollMorph = (
  instance: StippleInstance,
  options: ScrollMorphOptions,
): ScrollMorphController => {
  const attribute = options.attribute ?? 'data-stipple-shape';
  const fadeRange = options.fadeRange ?? 0.62;
  const root = options.root ?? null;

  let sections: HTMLElement[] = [];
  let activeKey: string | null = null;
  let frame = 0;
  let destroyed = false;

  const resolved = new Map<string, ShapeConfig | null>();
  const pending = new Map<string, Promise<void>>();

  const collect = (): void => {
    sections =
      typeof options.sections === 'string'
        ? Array.from(document.querySelectorAll<HTMLElement>(options.sections))
        : options.sections;
  };

  const ensureShape = (key: string): ShapeConfig | null | undefined => {
    if (resolved.has(key)) return resolved.get(key);

    const source = options.shapes[key];
    if (source === undefined || source === null) {
      resolved.set(key, null);
      return null;
    }

    if (typeof source !== 'string') {
      resolved.set(key, source);
      return source;
    }

    if (!pending.has(key)) {
      const request = shapeFromURL(source)
        .then((shape) => {
          resolved.set(key, shape);
          pending.delete(key);
          if (!destroyed && activeKey === key) instance.setShape(shape);
        })
        .catch((error: unknown) => {
          pending.delete(key);
          resolved.set(key, null);
          instance.options.onError?.(error as Error);
        });
      pending.set(key, request);
    }

    return undefined;
  };

  const viewportHeight = (): number =>
    root ? root.clientHeight : window.innerHeight || document.documentElement.clientHeight;

  const update = (): void => {
    frame = 0;
    if (destroyed || sections.length === 0) return;

    const height = viewportHeight();
    const rootTop = root ? root.getBoundingClientRect().top : 0;
    const center = rootTop + height / 2;

    let bestIndex = -1;
    let bestDistance = Infinity;
    let bestNormalized = 1;

    for (let i = 0; i < sections.length; i++) {
      const rect = sections[i]!.getBoundingClientRect();
      const sectionCenter = rect.top + rect.height / 2;
      const distance = Math.abs(sectionCenter - center);
      const reach = height / 2 + rect.height / 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
        bestNormalized = reach > 0 ? distance / reach : 1;
      }
    }

    if (bestIndex === -1) return;

    const key = resolveKey(sections, bestIndex, attribute);

    if (key !== activeKey) {
      activeKey = key;
      const shape = ensureShape(key);
      if (shape !== undefined) instance.setShape(shape);
      options.onChange?.(key, sections[bestIndex] ?? null);
    }

    const morph = clamp01(1 - bestNormalized / fadeRange);
    instance.setMorph(activeKey === 'none' ? 0 : morph);
  };

  const schedule = (): void => {
    if (frame || destroyed) return;
    frame = requestAnimationFrame(update);
  };

  const scrollTarget: EventTarget = root ?? window;
  scrollTarget.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  collect();
  for (const key of Object.keys(options.shapes)) ensureShape(key);
  update();

  return {
    refresh(): void {
      collect();
      activeKey = null;
      update();
    },
    destroy(): void {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      scrollTarget.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resolved.clear();
      pending.clear();
    },
    get activeKey(): string | null {
      return activeKey;
    },
  };
};

export const applyScrollSnap = (
  container: HTMLElement,
  sectionSelector = '[data-stipple-shape]',
): (() => void) => {
  const previousType = container.style.scrollSnapType;
  const previousOverflow = container.style.overflowY;

  container.style.scrollSnapType = 'y mandatory';
  container.style.overflowY = 'auto';

  const sections = Array.from(container.querySelectorAll<HTMLElement>(sectionSelector));
  const previousAlign = sections.map((section) => section.style.scrollSnapAlign);
  for (const section of sections) section.style.scrollSnapAlign = 'start';

  return () => {
    container.style.scrollSnapType = previousType;
    container.style.overflowY = previousOverflow;
    sections.forEach((section, index) => {
      section.style.scrollSnapAlign = previousAlign[index] ?? '';
    });
  };
};
