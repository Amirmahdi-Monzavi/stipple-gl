import { MorphEmitter } from './emitter';
import { resolveOptions } from './options';
import { validateConfig } from './validate';
import { fail, Runtime } from './runtime';
import type {
  ChoreographyConfig,
  MorphOptions,
  RenderMode,
  ShapeConfig,
  StippleConfig,
  StippleEvent,
  StippleEventMap,
  StippleInstance,
  StippleOptions,
} from './types';

export type StippleTarget = HTMLElement | HTMLCanvasElement | string;

const MODE_POSITION: Record<RenderMode, string> = {
  background: 'fixed',
  container: 'absolute',
  page: 'absolute',
};

export const resolveTarget = (target: StippleTarget): HTMLElement => {
  if (typeof target === 'string') {
    const found = document.querySelector<HTMLElement>(target);
    if (!found) throw fail('no element matches selector ' + target);
    return found;
  }
  return target;
};

export const styleCanvas = (
  canvas: HTMLCanvasElement,
  mode: RenderMode,
  background: string,
  pageHeight: number | null,
): void => {
  const style = canvas.style;
  style.position = MODE_POSITION[mode];
  style.display = 'block';
  style.width = '100%';
  style.pointerEvents = 'none';

  if (mode === 'page') {
    style.top = '0';
    style.left = '0';
    style.height = pageHeight ? pageHeight + 'px' : '100%';
  } else {
    style.inset = '0';
    style.height = '100%';
  }

  if (background) style.background = background;
  canvas.setAttribute('aria-hidden', 'true');
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class StippleCore implements StippleInstance {
  readonly canvas: HTMLCanvasElement;

  protected runtime: Runtime;
  protected readonly events = new MorphEmitter();
  private host: HTMLElement;
  private ownsCanvas: boolean;

  private raf = 0;
  private lastTime = 0;
  private lastFrameAt = 0;
  private isRunning = false;
  private visible = true;
  private documentVisible = true;
  private motionAllowed = true;
  private contextLost = false;
  private disposed = false;
  private pageHeight: number | null = null;

  private sizeWarning: ReturnType<typeof setTimeout> | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private motionQuery: MediaQueryList | null = null;

  constructor(target: StippleTarget, config?: StippleConfig) {
    if (typeof window === 'undefined') throw fail('Stipple requires a browser environment');

    if (process.env.NODE_ENV !== 'production') validateConfig(config);

    const opts = resolveOptions(config);
    const element = resolveTarget(target);

    if (element instanceof HTMLCanvasElement) {
      this.canvas = element;
      this.host = element.parentElement ?? document.body;
      this.ownsCanvas = false;
    } else {
      this.canvas = document.createElement('canvas');
      this.host = element;
      this.ownsCanvas = true;
      element.appendChild(this.canvas);
    }

    if (this.ownsCanvas) styleCanvas(this.canvas, opts.mode, opts.background, this.pageHeight);

    try {
      this.runtime = new Runtime(this.canvas, opts, {
        onResolutionChange: (viewport) => {
          this.canvas.width = Math.floor(viewport.width * viewport.dpr);
          this.canvas.height = Math.floor(viewport.height * viewport.dpr);
        },
        onMorphProgress: (value) => this.events.progress(value),
        onMorphSettled: (value) => this.events.arrived(value),
      });
    } catch (error) {
      opts.onError?.(error as Error);
      throw error;
    }

    this.motionAllowed = opts.reducedMotion === 'ignore' || !prefersReducedMotion();

    this.measure();
    this.bind();
    opts.onReady?.(this);

    if (this.motionAllowed) this.syncRunning();
    else this.runtime.renderStatic(performance.now());

    this.watchForZeroSize();
  }

  /**
   * A host with no height renders nothing and says nothing, which is the most
   * common way this library gets written off in five minutes — and it is almost
   * always the page's CSS rather than the engine.
   *
   * The check is deferred by a macrotask, and any successful measurement in the
   * meantime cancels it. Containers that get their size from a flex or grid pass
   * a beat after mount are the norm, not the exception, and a warning that cries
   * wolf about them would be worth less than no warning at all. By the time this
   * runs, the ResizeObserver bound above has already reported the real size if
   * there is one.
   */
  private watchForZeroSize(): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!this.runtime.degenerate) return;

    this.sizeWarning = setTimeout(() => {
      this.sizeWarning = null;
      if (this.disposed || !this.runtime.degenerate) return;

      const rect = this.canvas.getBoundingClientRect();
      const tag = this.host.tagName.toLowerCase();
      const id = this.host.id ? '#' + this.host.id : '';
      const cls = this.host.classList.length ? '.' + [...this.host.classList].join('.') : '';

      console.warn(
        'stipple-gl: the host element <' +
          tag +
          id +
          cls +
          '> measures ' +
          Math.round(rect.width) +
          '×' +
          Math.round(rect.height) +
          ', so nothing will be drawn. Give it a height in CSS — a percentage ' +
          'height needs a sized parent, and a flex or grid child may need ' +
          'min-height: 0. The engine will start on its own once the element ' +
          'has a size.',
      );
    }, 0);
  }

  get options(): StippleOptions {
    return this.runtime.opts;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get fps(): number {
    return this.runtime.fps;
  }

  private measure(): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width || this.host.clientWidth);
    const height = Math.round(rect.height || this.host.clientHeight);
    return this.runtime.setResolution(width, height, window.devicePixelRatio || 1);
  }

  private pointerBindings(): Array<[string, EventListener]> {
    return [
      ['pointermove', this.onPointerMove as EventListener],
      ['pointerdown', this.onPointerDown as EventListener],
      ['pointerup', this.onPointerUp],
      ['pointercancel', this.onPointerLeave],
      ['pointerleave', this.onPointerLeave],
    ];
  }

  private surface(): EventTarget {
    return this.runtime.opts.mode === 'container' ? this.host : window;
  }

  private bind(): void {
    const opts = this.runtime.opts;

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvas);

    if (opts.autoPause) {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          this.visible = entry ? entry.isIntersecting : true;
          this.syncRunning();
        },
        { threshold: 0 },
      );
      this.intersectionObserver.observe(this.canvas);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    if (opts.reducedMotion === 'respect' && typeof window.matchMedia === 'function') {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.motionQuery.addEventListener('change', this.onMotionChange);
    }

    if (opts.pointer.enabled) {
      const surface = this.surface();
      for (const [type, handler] of this.pointerBindings()) {
        surface.addEventListener(type, handler, { passive: true });
      }
    }

    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private unbind(): void {
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver = null;

    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.motionQuery = null;

    const surface = this.surface();
    for (const [type, handler] of this.pointerBindings()) {
      surface.removeEventListener(type, handler);
    }

    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onVisibilityChange = (): void => {
    this.documentVisible = !document.hidden;
    this.syncRunning();
  };

  private onMotionChange = (event: MediaQueryListEvent): void => {
    this.motionAllowed = !event.matches;
    this.syncRunning();
    if (!this.motionAllowed) this.runtime.renderStatic(performance.now());
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.stop();
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.runtime.restoreContext();
    this.measure();
    this.syncRunning();
  };

  private localPoint(event: PointerEvent): { x: number; y: number; inside: boolean } {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
  }

  private onPointerMove = (event: PointerEvent): void => {
    const { x, y, inside } = this.localPoint(event);
    const pointer = this.runtime.pointer;
    const active = inside && this.runtime.withinShape(x, y);
    pointer.x = x;
    pointer.y = y;
    pointer.active = active;
    if (!active) pointer.down = false;
  };

  private onPointerDown = (event: PointerEvent): void => {
    const { x, y, inside } = this.localPoint(event);
    if (!inside || !this.runtime.withinShape(x, y)) return;
    const pointer = this.runtime.pointer;
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
    pointer.down = true;
    if (this.runtime.opts.pointer.shockwave) this.pulse(x, y);
  };

  private onPointerUp = (): void => {
    this.runtime.pointer.down = false;
  };

  private onPointerLeave = (): void => {
    this.runtime.pointer.active = false;
    this.runtime.pointer.down = false;
  };

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const viewport = this.runtime.viewport;

    if (
      !this.runtime.degenerate &&
      Math.abs(width - viewport.width) < 2 &&
      Math.abs(height - viewport.height) < 2
    ) {
      return;
    }

    const wasDegenerate = this.runtime.degenerate;
    if (!this.measure()) return;

    if (wasDegenerate) {
      if (this.motionAllowed) this.syncRunning();
      else this.runtime.renderStatic(performance.now());
    }
  }

  private syncRunning(): void {
    const shouldRun =
      !this.disposed &&
      !this.contextLost &&
      !this.runtime.degenerate &&
      this.motionAllowed &&
      this.documentVisible &&
      (this.visible || !this.runtime.opts.autoPause);

    if (shouldRun && !this.isRunning) this.start();
    else if (!shouldRun && this.isRunning) this.stop();
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);

    const cap = this.runtime.opts.maxFps;
    if (cap > 0) {
      if (now - this.lastFrameAt < 1000 / cap - 0.5) return;
      this.lastFrameAt = now;
    }

    const dt = Math.min(now - this.lastTime, 100);
    this.lastTime = now;

    if (this.runtime.step(now, dt)) this.measure();
  };

  tick(dt = 16.667): void {
    if (this.contextLost || this.disposed) return;
    this.runtime.step(performance.now(), dt);
  }

  setMorph(value: number): Promise<void> {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    const state = this.runtime.state;
    const settled = this.events.begin(state.morph, clamped, this.runtime.shape);
    state.targetMorph = clamped;

    if (!this.motionAllowed) {
      state.morph = clamped;
      this.runtime.renderStatic(performance.now());
      this.events.arrived(clamped);
    }

    return settled;
  }

  getMorph(): number {
    return this.runtime.state.morph;
  }

  setShape(shape: ShapeConfig | null, choreography?: ChoreographyConfig | 'none'): boolean {
    const accepted = this.runtime.setShape(shape, choreography);
    if (accepted) this.events.shapeChanged(shape);
    if (!this.motionAllowed) this.runtime.renderStatic(performance.now());
    return accepted;
  }

  /**
   * Set a shape and morph into it in one call, in the order that actually works.
   * Resolves when the field arrives, or immediately if it is superseded.
   */
  morphTo(shape: ShapeConfig | null, options: MorphOptions = {}): Promise<void> {
    if (options.enter) this.runtime.setOptions({ transition: { enter: options.enter } });

    if (shape === null) return this.release();
    if (!this.setShape(shape, options.swap)) return Promise.resolve();

    return this.setMorph(1);
  }

  /** Return to the spread without discarding the shape, so the exit animates. */
  release(): Promise<void> {
    return this.setMorph(0);
  }

  on<E extends StippleEvent>(event: E, handler: (payload: StippleEventMap[E]) => void): () => void {
    return this.events.on(event, handler);
  }

  off<E extends StippleEvent>(event: E, handler: (payload: StippleEventMap[E]) => void): void {
    this.events.off(event, handler);
  }

  setOptions(config: StippleConfig): void {
    if (process.env.NODE_ENV !== 'production') validateConfig(config);
    const previousBackground = this.runtime.opts.background;
    this.runtime.setOptions(config);
    const next = this.runtime.opts;

    if (this.ownsCanvas && next.background !== previousBackground) {
      this.canvas.style.background = next.background;
    }
    if (!this.motionAllowed) this.runtime.renderStatic(performance.now());
  }

  resetOptions(config?: StippleConfig): void {
    const previousBackground = this.runtime.opts.background;
    this.runtime.resetOptions(config);
    const next = this.runtime.opts;

    if (this.ownsCanvas && next.background !== previousBackground) {
      this.canvas.style.background = next.background;
    }
    if (!this.motionAllowed) this.runtime.renderStatic(performance.now());
  }

  setCount(count: number, minorCount?: number): void {
    this.runtime.setCount(count, minorCount);
  }

  setPageHeight(height: number | null): void {
    this.pageHeight = height;
    if (this.runtime.opts.mode === 'page' && this.ownsCanvas) {
      this.canvas.style.height = height ? height + 'px' : '100%';
    }
  }

  pulse(x: number, y: number, strength = 0.55): void {
    this.runtime.pulse(x, y, strength, performance.now());
  }

  resize(): void {
    this.handleResize();
  }

  start(): void {
    if (this.isRunning || this.disposed || this.contextLost || this.runtime.degenerate) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.lastFrameAt = this.lastTime;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.sizeWarning !== null) {
      clearTimeout(this.sizeWarning);
      this.sizeWarning = null;
    }
    this.stop();
    this.unbind();
    this.events.dispose();
    this.runtime.dispose();
    if (this.ownsCanvas) this.canvas.remove();
  }
}
