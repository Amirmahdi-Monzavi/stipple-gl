import { useCallback, useEffect, useRef, useState } from 'react';

import { Stipple } from '../stipple';
import type { ShapeConfig, StippleConfig } from '../core/types';
import { shapeFromURL } from '../sources/shape';

export interface UseStippleOptions extends StippleConfig {
  shape?: ShapeConfig | string | null;
  morph?: number;
  paused?: boolean;
  onInstance?: (instance: Stipple | null) => void;
}

export interface UseStippleResult<T extends HTMLElement = HTMLDivElement> {
  ref: (node: T | null) => void;
  instance: Stipple | null;
  pulse: (x: number, y: number, strength?: number) => void;
}

export const useStipple = <T extends HTMLElement = HTMLDivElement>(
  options: UseStippleOptions = {},
): UseStippleResult<T> => {
  const { shape = null, morph, paused = false, onInstance, ...config } = options;

  const [node, setNode] = useState<T | null>(null);
  const [instance, setInstance] = useState<Stipple | null>(null);

  const configRef = useRef(config);
  const callbackRef = useRef(onInstance);
  configRef.current = config;
  callbackRef.current = onInstance;

  const mode = config.mode;

  useEffect(() => {
    if (!node) {
      setInstance(null);
      return;
    }

    let engine: Stipple;
    try {
      engine = new Stipple(node, configRef.current);
    } catch (error) {
      configRef.current.onError?.(error as Error);
      return;
    }

    setInstance(engine);
    callbackRef.current?.(engine);

    return () => {
      callbackRef.current?.(null);
      engine.destroy();
      setInstance(null);
    };
  }, [node, mode]);

  useEffect(() => {
    if (!instance) return;
    instance.setOptions(config);
  }, [instance, config]);

  useEffect(() => {
    if (!instance || config.count === undefined) return;
    instance.setCount(config.count, config.minorCount);
  }, [instance, config.count, config.minorCount]);

  useEffect(() => {
    if (!instance) return;

    if (shape === null) {
      instance.setShape(null);
      return;
    }

    if (typeof shape !== 'string') {
      instance.setShape(shape);
      return;
    }

    let cancelled = false;
    void shapeFromURL(shape)
      .then((resolved) => {
        if (!cancelled) instance.setShape(resolved);
      })
      .catch((error: unknown) => {
        if (!cancelled) instance.options.onError?.(error as Error);
      });

    return () => {
      cancelled = true;
    };
  }, [instance, shape]);

  useEffect(() => {
    if (!instance || morph === undefined) return;
    void instance.setMorph(morph);
  }, [instance, morph]);

  useEffect(() => {
    if (!instance) return;
    if (paused) instance.stop();
    else instance.start();
  }, [instance, paused]);

  const pulse = useCallback(
    (x: number, y: number, strength?: number) => {
      instance?.pulse(x, y, strength);
    },
    [instance],
  );

  const ref = useCallback((next: T | null) => {
    setNode(next);
  }, []);

  return { ref, instance, pulse };
};
