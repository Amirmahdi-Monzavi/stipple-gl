import { useEffect, useRef, useState } from 'react';

import type { ShapeConfig, StippleInstance } from '../core/types';
import { createScrollMorph } from '../scroll';
import type { ScrollMorphOptions } from '../scroll';

export interface UseMorphOnScrollOptions extends Omit<ScrollMorphOptions, 'sections' | 'shapes'> {
  sections?: string;
  shapes: Record<string, ShapeConfig | string | null>;
  enabled?: boolean;
}

export const useMorphOnScroll = (
  instance: StippleInstance | null,
  options: UseMorphOnScrollOptions,
): string | null => {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const {
    sections = '[data-stipple-shape]',
    enabled = true,
    attribute,
    fadeRange,
    root,
  } = options;

  const shapeKeys = Object.keys(options.shapes).sort().join('|');

  useEffect(() => {
    if (!instance || !enabled) return;

    const current = optionsRef.current;
    const controller = createScrollMorph(instance, {
      sections,
      shapes: current.shapes,
      ...(attribute !== undefined ? { attribute } : {}),
      ...(fadeRange !== undefined ? { fadeRange } : {}),
      ...(root !== undefined ? { root } : {}),
      onChange: (key, section) => {
        setActiveKey(key);
        optionsRef.current.onChange?.(key, section);
      },
    });

    return () => controller.destroy();
  }, [instance, enabled, sections, attribute, fadeRange, root, shapeKeys]);

  return activeKey;
};
