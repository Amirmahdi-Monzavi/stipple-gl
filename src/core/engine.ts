import { clamp, clamp01 } from './math';
import { mergeOptions, resolveOptions } from './options';
import { PointRenderer } from './renderer';
import type {
  FrameState,
  PointerState,
  RenderMode,
  Shockwave,
  ShapeConfig,
  SimulationBackend,
  StippleConfig,
  StippleInstance,
  StippleOptions,
  Viewport,
} from './types';
import { CpuBackend } from '../backends/cpu';
import { sampleShape, shapeBounds } from '../sources/sample';

export type StippleTarget = HTMLElement | HTMLCanvasElement | string;

const MODE_POSITION: Record<RenderMode, string> = {
  background: 'fixed',
  container: 'absolute',
  page: 'absolute',
};

const fail = (message: string): Error => new Error('stipple-gl: ' + message);

const resolveTarget = (target: StippleTarget): HTMLElement => {
  if (typeof target === 'string') {
    const found = document.querySelector<HTMLElement>(target);
    if (!found) throw fail('no element matches selector ' + target);
    return found;
  }
  return target;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Stipple implements StippleInstance {
  readonly canvas: HTMLCanvasElement;

  private host: HTMLElement;
  private ownsCanvas: boolean;
  private gl: WebGL2RenderingContext;
  private renderer: PointRenderer;
  private backend: SimulationBackend;

  private opts: StippleOptions;
  private viewport: Viewport = { width: 0, height: 0, dpr: 1 };
  private pointer: PointerState = { x: 0, y: 0, active: false, down: false };
  private shockwaves: Shockwave[] = [];

  private state: FrameState;
  private raf = 0;
  private lastTime = 0;
  private lastFrameAt = 0;
  private isRunning = false;
  private visible = true;
  private documentVisible = true;
  private motionAllowed = true;
  private contextLost = false;

  private shape: ShapeConfig | null = null;
  private shapeBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  private camScale = 1;
  private camOffsetX = 0;
  private camOffsetY = 0;
  private spreadPhase = 0;

  private quality = 1;
  private frameAccumulator = 0;
  private frameSamples = 0;
  private fpsValue = 0;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private motionQuery: MediaQueryList | null = null;
  private pageHeight: number | null = null;
  private disposed = false;
  private degenerate = false;

  constructor(target: StippleTarget, config?: StippleConfig) {
    if (typeof window === 'undefined') {
      throw fail('Stipple requires a browser environment');
    }

    this.opts = resolveOptions(config);

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

    this.applyCanvasStyle();

    const gl = this.canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      const error = fail('WebGL2 is not supported in this browser');
      this.opts.onError?.(error);
      throw error;
    }

    this.gl = gl;
    this.renderer = new PointRenderer(gl);
    this.renderer.setBlend(this.opts.blend);
    this.backend = this.opts.backend ? this.opts.backend() : new CpuBackend();

    this.state = {
      time: performance.now(),
      dt: 16.667,
      dtScale: 1,
      frame: 0,
      spin: 0,
      morph: 0,
      targetMorph: 0,
      hasShape: false,
      viewport: this.viewport,
      pointer: this.pointer,
      shockwaves: this.shockwaves,
    };

    this.motionAllowed = this.opts.reducedMotion === 'ignore' || !prefersReducedMotion();

    this.backend.init({ gl, options: this.opts, viewport: this.viewport });
    this.measure();
    this.backend.reallocate(this.opts.count, this.opts.minorCount, this.viewport);
    this.renderer.allocate(this.backend.capacity);

    this.bind();
    this.opts.onReady?.(this);

    if (this.motionAllowed) this.syncRunning();
    else this.renderOnce();
  }

  get options(): StippleOptions {
    return this.opts;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get fps(): number {
    return this.fpsValue;
  }

  private applyCanvasStyle(): void {
    if (!this.ownsCanvas) return;
    const mode = this.opts.mode;
    const style = this.canvas.style;
    style.position = MODE_POSITION[mode];
    style.display = 'block';
    style.width = '100%';
    style.pointerEvents = 'none';
    if (mode === 'page') {
      style.top = '0';
      style.left = '0';
    } else {
      style.inset = '0';
      style.height = '100%';
    }
    this.canvas.setAttribute('aria-hidden', 'true');
    if (this.opts.background) style.background = this.opts.background;
    if (mode === 'page') {
      style.height = this.pageHeight ? this.pageHeight + 'px' : '100%';
    }
  }

  private measure(): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width || this.host.clientWidth);
    const height = Math.round(rect.height || this.host.clientHeight);

    if (width < 2 || height < 2) {
      this.degenerate = true;
      return false;
    }

    this.degenerate = false;

    const requested = this.opts.dpr === 'auto' ? (window.devicePixelRatio || 1) : this.opts.dpr;
    const dpr = clamp(requested * this.quality, 0.5, this.opts.maxDpr);

    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.dpr = dpr;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.renderer.setViewport(this.viewport);
    return true;
  }

  private bind(): void {
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvas);

    if (this.opts.autoPause) {
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

    if (this.opts.reducedMotion === 'respect' && typeof window.matchMedia === 'function') {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.motionQuery.addEventListener('change', this.onMotionChange);
    }

    if (this.opts.pointer.enabled) {
      const surface = this.opts.mode === 'container' ? this.host : window;
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

    const surface = this.opts.mode === 'container' ? this.host : window;
    for (const [type, handler] of this.pointerBindings()) {
      surface.removeEventListener(type, handler);
    }

    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
  }

  private pointerBindings(): Array<[string, EventListener]> {
    return [
      ['pointermove', this.onPointerMove as EventListener],
      ['pointerdown', this.onPointerDown as EventListener],
      ['pointerup', this.onPointerUp as EventListener],
      ['pointercancel', this.onPointerLeave as EventListener],
      ['pointerleave', this.onPointerLeave as EventListener],
    ];
  }

  private onVisibilityChange = (): void => {
    this.documentVisible = !document.hidden;
    this.syncRunning();
  };

  private onMotionChange = (event: MediaQueryListEvent): void => {
    this.motionAllowed = !event.matches;
    this.syncRunning();
    if (!this.motionAllowed) this.renderOnce();
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.stop();
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.renderer.restore();
    this.renderer.setBlend(this.opts.blend);
    this.renderer.allocate(this.backend.capacity);
    this.measure();
    this.syncRunning();
  };

  private localPoint(event: PointerEvent): { x: number; y: number; inside: boolean } {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    return { x, y, inside };
  }

  private withinShape(x: number, y: number): boolean {
    if (!this.state.hasShape) return true;
    const pad = this.opts.pointer.radius;
    return (
      x >= this.shapeBox.minX - pad &&
      x <= this.shapeBox.maxX + pad &&
      y >= this.shapeBox.minY - pad &&
      y <= this.shapeBox.maxY + pad
    );
  }

  private onPointerMove = (event: PointerEvent): void => {
    const { x, y, inside } = this.localPoint(event);
    const active = inside && this.withinShape(x, y);
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
    if (!active) this.pointer.down = false;
  };

  private onPointerDown = (event: PointerEvent): void => {
    const { x, y, inside } = this.localPoint(event);
    if (!inside || !this.withinShape(x, y)) return;
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = true;
    this.pointer.down = true;
    if (this.opts.pointer.shockwave) this.pulse(x, y);
  };

  private onPointerUp = (): void => {
    this.pointer.down = false;
  };

  private onPointerLeave = (): void => {
    this.pointer.active = false;
    this.pointer.down = false;
  };

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    if (
      !this.degenerate &&
      Math.abs(width - this.viewport.width) < 2 &&
      Math.abs(height - this.viewport.height) < 2
    ) {
      return;
    }

    const wasDegenerate = this.degenerate;
    if (!this.measure()) return;

    if (wasDegenerate) {
      this.backend.reallocate(this.opts.count, this.opts.minorCount, this.viewport);
      this.renderer.allocate(this.backend.capacity);
    } else {
      this.backend.layout(this.viewport);
    }

    if (this.shape) this.applyShape(this.shape);

    if (wasDegenerate) {
      if (this.motionAllowed) this.syncRunning();
      else this.renderOnce();
    }
  }

  private syncRunning(): void {
    const shouldRun =
      !this.disposed &&
      !this.contextLost &&
      !this.degenerate &&
      this.motionAllowed &&
      this.documentVisible &&
      (this.visible || !this.opts.autoPause);

    if (shouldRun && !this.isRunning) this.start();
    else if (!shouldRun && this.isRunning) this.stop();
  }

  private applyShape(shape: ShapeConfig): void {
    if (this.degenerate) return;
    const count = Math.min(shape.count ?? this.opts.count, this.opts.count);
    const points = sampleShape(shape, count, this.viewport.width, this.viewport.height);

    if (points.length === 0) {
      this.backend.setShape(null, this.opts);
      this.state.hasShape = false;
      return;
    }

    const bounds = shapeBounds(points);
    this.shapeBox.minX = bounds.minX;
    this.shapeBox.minY = bounds.minY;
    this.shapeBox.maxX = bounds.maxX;
    this.shapeBox.maxY = bounds.maxY;

    this.backend.setShape(points, this.opts);
    this.state.hasShape = true;
  }

  private updateCamera(dt: number): void {
    const spread = this.opts.spread;
    const speed = spread.speed;

    let targetScale = 1;
    let targetX = 0;
    let targetY = 0;

    if (!this.state.hasShape || this.state.morph < 0.02) {
      this.spreadPhase += (dt / 1000) * spread.drift;
      targetScale = spread.zoom;
      targetX = (Math.sin(this.spreadPhase * 0.7) * 0.12 + spread.pan.x) * 0.25;
      targetY = (Math.cos(this.spreadPhase * 0.9) * 0.1 + spread.pan.y) * 0.25;
    }

    this.camScale += (targetScale - this.camScale) * speed;
    this.camOffsetX += (targetX - this.camOffsetX) * speed;
    this.camOffsetY += (targetY - this.camOffsetY) * speed;
  }

  private pruneShockwaves(now: number): void {
    const life = this.opts.pointer.shockwaveLife;
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      if (now - this.shockwaves[i]!.time >= life) this.shockwaves.splice(i, 1);
    }
  }

  private adaptQuality(dt: number): void {
    if (!this.opts.adaptiveQuality) return;

    this.frameAccumulator += dt;
    this.frameSamples++;
    if (this.frameSamples < 45) return;

    const average = this.frameAccumulator / this.frameSamples;
    this.fpsValue = Math.round(1000 / average);
    this.frameAccumulator = 0;
    this.frameSamples = 0;

    const previous = this.quality;
    if (average > 22 && this.quality > 0.5) this.quality = Math.max(0.5, this.quality - 0.1);
    else if (average < 13 && this.quality < 1) this.quality = Math.min(1, this.quality + 0.05);

    if (previous !== this.quality) this.measure();
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);

    if (this.opts.maxFps > 0) {
      const interval = 1000 / this.opts.maxFps;
      if (now - this.lastFrameAt < interval - 0.5) return;
      this.lastFrameAt = now;
    }

    const dt = Math.min(now - this.lastTime, 100);
    this.lastTime = now;

    this.step(now, dt);
  };

  private step(now: number, dt: number): void {
    const state = this.state;
    state.time = now;
    state.dt = dt;
    state.dtScale = clamp(dt / 16.667, 0.25, 3);
    state.frame++;

    state.spin += (dt / 1000) * this.opts.spread.rotation;

    const speed = clamp01(1 - Math.pow(1 - this.opts.transition.speed, state.dtScale));
    state.morph += (state.targetMorph - state.morph) * speed;
    if (Math.abs(state.targetMorph - state.morph) < 0.0005) state.morph = state.targetMorph;

    this.pruneShockwaves(now);
    this.backend.step(state, this.opts);
    this.updateCamera(dt);

    this.render();
    this.adaptQuality(dt);
  }

  tick(dt = 16.667): void {
    if (this.degenerate || this.contextLost || this.disposed) return;
    this.step(performance.now(), dt);
  }

  private render(): void {
    const count = this.backend.pack(
      { floats: this.renderer.floats, colors: this.renderer.colors },
      this.opts,
      this.state,
    );

    this.renderer.clear();
    this.renderer.draw(
      count,
      this.camOffsetX,
      this.camOffsetY,
      this.camScale,
      this.opts.opacity,
      this.opts.softness,
      this.opts.core,
    );
  }

  private renderOnce(): void {
    const now = performance.now();
    this.state.time = now;
    this.state.dt = 16.667;
    this.state.dtScale = 1;
    this.state.morph = this.state.targetMorph;
    this.backend.step(this.state, this.opts);
    this.render();
  }

  setMorph(value: number): void {
    this.state.targetMorph = clamp01(value);
    if (!this.motionAllowed) {
      this.state.morph = this.state.targetMorph;
      this.renderOnce();
    }
  }

  getMorph(): number {
    return this.state.morph;
  }

  setShape(shape: ShapeConfig | null): void {
    this.shape = shape;
    if (!shape || shape.paths.length === 0) {
      this.backend.setShape(null, this.opts);
      this.state.hasShape = false;
      return;
    }
    this.applyShape(shape);
    if (!this.motionAllowed) this.renderOnce();
  }

  setOptions(config: StippleConfig): void {
    const previousBlend = this.opts.blend;
    const previousAssign = this.opts.transition.assign;
    const previousCount = this.opts.count;
    const previousMinor = this.opts.minorCount;
    const previousBehaviors = this.opts.behaviors;
    const previousRadius = this.opts.spread.radius;

    this.opts = mergeOptions(this.opts, config);

    if (this.opts.behaviors !== previousBehaviors) {
      this.backend.init({ gl: this.gl, options: this.opts, viewport: this.viewport });
    }

    if (this.opts.count !== previousCount || this.opts.minorCount !== previousMinor) {
      this.backend.reallocate(this.opts.count, this.opts.minorCount, this.viewport);
      this.renderer.allocate(this.backend.capacity);
      if (this.shape) this.applyShape(this.shape);
    } else if (this.opts.spread.radius !== previousRadius) {
      this.backend.layout(this.viewport);
    }

    if (this.opts.blend !== previousBlend) this.renderer.setBlend(this.opts.blend);
    if (this.opts.background && this.ownsCanvas) {
      this.canvas.style.background = this.opts.background;
    }
    if (this.opts.transition.assign !== previousAssign && this.shape) {
      this.applyShape(this.shape);
    }
    if (!this.motionAllowed) this.renderOnce();
  }

  setCount(count: number, minorCount?: number): void {
    const majors = Math.max(0, Math.floor(count));
    const minors = Math.max(0, Math.floor(minorCount ?? this.opts.minorCount));
    const backend = this.backend;

    this.opts.count = majors;
    this.opts.minorCount = minors;

    if (backend.majorCount === majors && backend.minorCount === minors) return;

    backend.reallocate(majors, minors, this.viewport);
    this.renderer.allocate(backend.capacity);
    if (this.shape) this.applyShape(this.shape);
  }

  setPageHeight(height: number | null): void {
    this.pageHeight = height;
    if (this.opts.mode === 'page' && this.ownsCanvas) {
      this.canvas.style.height = height ? height + 'px' : '100%';
    }
  }

  pulse(x: number, y: number, strength = 0.55): void {
    this.shockwaves.push({ x, y, time: performance.now(), strength });
  }

  resize(): void {
    this.handleResize();
  }

  start(): void {
    if (this.isRunning || this.disposed || this.contextLost || this.degenerate) return;
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
    this.stop();
    this.unbind();
    this.backend.dispose();
    this.renderer.dispose();

    const lose = this.gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();

    if (this.ownsCanvas) this.canvas.remove();
    this.shape = null;
    this.shockwaves.length = 0;
  }
}

export const createStipple = (target: StippleTarget, config?: StippleConfig): Stipple =>
  new Stipple(target, config);
