import { forwardRef, useImperativeHandle } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import type { Stipple } from '../core/engine';
import type { RenderMode } from '../core/types';
import { useStipple } from './useStipple';
import type { UseStippleOptions } from './useStipple';

export interface ParticlesProps extends UseStippleOptions {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export interface ParticlesHandle {
  instance: Stipple | null;
  setMorph: (value: number) => void;
  pulse: (x: number, y: number, strength?: number) => void;
}

const HOST_STYLES: Record<RenderMode, CSSProperties> = {
  background: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' },
  container: { position: 'relative', width: '100%', height: '100%' },
  page: { position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' },
};

export const Particles = forwardRef<ParticlesHandle, ParticlesProps>(function Particles(
  { className, style, children, ...options },
  ref,
) {
  const { ref: hostRef, instance, pulse } = useStipple<HTMLDivElement>(options);

  useImperativeHandle(
    ref,
    () => ({
      instance,
      setMorph: (value: number) => instance?.setMorph(value),
      pulse,
    }),
    [instance, pulse],
  );

  const mode = options.mode ?? 'background';

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ ...HOST_STYLES[mode], ...style }}
      aria-hidden={children ? undefined : true}
    >
      {children}
    </div>
  );
});
