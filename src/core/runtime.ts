import { clamp, clamp01 } from './math';
import { mergeOptions } from './options';
import { PointRenderer } from './renderer';
import type {
  FrameState,
  PointerState,
  ShapeConfig,
  Shockwave,
  SimulationBackend,
  StippleConfig,
  StippleOptions,
  Viewport,
} from './types';
import { CpuBackend } from '../backends/cpu';

export const fail = (message: string): Error => new Error('stipple-gl: ' + message);

export type RuntimeSurface = HTMLCanvasElement | OffscreenCanvas;

export interface RuntimeCallbacks {
  onResolutionChange?(viewport: Viewport): void;
}

export class Runtime {
  readonly gl: WebGL2RenderingContext;
  readonly renderer: PointRenderer;
  readonly backend: SimulationBackend;

  opts: StippleOptions;
  readonly viewport: Viewport = { width: 0, height: 0, dpr: 1 };
  readonly pointer: PointerState = { x: 0, y: 0, active: false, down: false };
  readonly shockwaves: Shockwave[] = [];
  readonly state: FrameState;

  shape: ShapeConfig | null = null;
  readonly shapeBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  quality = 1;
  degenerate = true;

  private camScale = 1;
  private camOffsetX = 0;
  private camOffsetY = 0;
  private spreadPhase = 0;

  private frameAccumulator = 0;
  private frameSamples = 0;
  private fpsValue = 0;
  private callbacks: RuntimeCallbacks;

  constructor(
    surface: RuntimeSurface,
    options: StippleOptions,
    callbacks: RuntimeCallbacks = {},
  ) {
    this.opts = options;
    this.callbacks = callbacks;

    const gl = surface.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;

    if (!gl) throw fail('WebGL2 is not supported in this environment');

    this.gl = gl;
    this.renderer = new PointRenderer(gl);
    this.renderer.setBlend(options.blend);
    this.backend = options.backend ? options.backend() : new CpuBackend();

    this.state = {
      time: 0,
      dt: 16.667,
      dtScale: 1,
      frame: 0,
      spin: 0,
      morph: 0,
      targetMorph: 0,
      hasShape: false,
      shapeColor: null,
      viewport: this.viewport,
      pointer: this.pointer,
      shockwaves: this.shockwaves,
    };

    this.backend.init({ gl, options, viewport: this.viewport });
  }

  get fps(): number {
    return this.fpsValue;
  }

  setResolution(width: number, height: number, devicePixelRatio: number): boolean {
    if (width < 2 || height < 2) {
      this.degenerate = true;
      return false;
    }

    const wasDegenerate = this.degenerate;
    this.degenerate = false;

    const requested = this.opts.dpr === 'auto' ? devicePixelRatio : this.opts.dpr;
    const dpr = clamp(requested * this.quality, 0.5, this.opts.maxDpr);

    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.dpr = dpr;
    this.callbacks.onResolutionChange?.(this.viewport);
    this.renderer.setViewport(this.viewport);

    if (wasDegenerate) {
      this.backend.reallocate(this.opts.count, this.opts.minorCount, this.viewport);
      this.backend.precompute(this.opts);
      this.renderer.allocate(this.backend.capacity);
    } else {
      this.backend.layout(this.viewport);
      this.backend.precompute(this.opts);
    }

    if (this.shape) this.applyShape(this.shape);
    return true;
  }

  allocate(): void {
    this.backend.reallocate(this.opts.count, this.opts.minorCount, this.viewport);
    this.backend.precompute(this.opts);
    this.renderer.allocate(this.backend.capacity);
  }

  applyShape(shape: ShapeConfig): void {
    if (this.degenerate) return;

    const shapes = this.opts.shapes;
    if (!shapes) {
      this.opts.onError?.(
        fail('setShape needs the SVG sampler; import Stipple from "stipple-gl", not "stipple-gl/lite"'),
      );
      return;
    }

    const count = Math.min(shape.count ?? this.opts.count, this.opts.count);
    const points = shapes.sample(shape, count, this.viewport.width, this.viewport.height);

    if (points.length === 0) {
      this.backend.setShape(null, this.opts);
      this.state.hasShape = false;
      this.state.shapeColor = null;
      return;
    }

    const bounds = shapes.bounds(points);
    this.shapeBox.minX = bounds.minX;
    this.shapeBox.minY = bounds.minY;
    this.shapeBox.maxX = bounds.maxX;
    this.shapeBox.maxY = bounds.maxY;

    this.backend.setShape(points, this.opts);
    this.state.hasShape = true;
    this.state.shapeColor = shape.color ?? null;
  }

  setShape(shape: ShapeConfig | null): void {
    this.shape = shape;
    if (!shape || shape.paths.length === 0) {
      this.backend.setShape(null, this.opts);
      this.state.hasShape = false;
      this.state.shapeColor = null;
      return;
    }
    this.applyShape(shape);
  }

  setOptions(config: StippleConfig): void {
    const before = this.opts;
    this.opts = mergeOptions(this.opts, config);
    const next = this.opts;

    if (next.behaviors !== before.behaviors) {
      this.backend.init({ gl: this.gl, options: next, viewport: this.viewport });
    }

    if (next.blend !== before.blend) this.renderer.setBlend(next.blend);

    if (next.count !== before.count || next.minorCount !== before.minorCount) {
      this.allocate();
      if (this.shape) this.applyShape(this.shape);
    } else if (
      next.spread.radius !== before.spread.radius ||
      next.spread.volume !== before.spread.volume
    ) {
      this.backend.layout(this.viewport);
      this.backend.precompute(next);
    } else if (
      next.transition.order !== before.transition.order ||
      next.major.sizeBias !== before.major.sizeBias ||
      next.minor.sizeBias !== before.minor.sizeBias
    ) {
      this.backend.precompute(next);
    }

    if (next.transition.assign !== before.transition.assign && this.shape) {
      this.applyShape(this.shape);
    }
  }

  setCount(count: number, minorCount?: number): void {
    const majors = Math.max(0, Math.floor(count));
    const minors = Math.max(0, Math.floor(minorCount ?? this.opts.minorCount));

    this.opts.count = majors;
    this.opts.minorCount = minors;

    if (this.backend.majorCount === majors && this.backend.minorCount === minors) return;

    this.allocate();
    if (this.shape) this.applyShape(this.shape);
  }

  pulse(x: number, y: number, strength = 0.55, now: number): void {
    this.shockwaves.push({ x, y, time: now, strength });
  }

  withinShape(x: number, y: number): boolean {
    if (!this.state.hasShape) return true;
    const pad = this.opts.pointer.radius;
    return (
      x >= this.shapeBox.minX - pad &&
      x <= this.shapeBox.maxX + pad &&
      y >= this.shapeBox.minY - pad &&
      y <= this.shapeBox.maxY + pad
    );
  }

  step(now: number, dt: number): boolean {
    if (this.degenerate) return false;

    const state = this.state;
    state.time = now;
    state.dt = dt;
    state.dtScale = clamp(dt / 16.667, 0.25, 3);
    state.frame++;
    state.spin += (dt / 1000) * this.opts.spread.rotation;

    const speed = clamp01(1 - Math.pow(1 - this.opts.transition.speed, state.dtScale));
    state.morph += (state.targetMorph - state.morph) * speed;
    if (Math.abs(state.targetMorph - state.morph) < 0.0005) state.morph = state.targetMorph;

    const life = this.opts.pointer.shockwaveLife;
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      if (now - this.shockwaves[i]!.time >= life) this.shockwaves.splice(i, 1);
    }

    this.backend.step(state, this.opts);
    this.updateCamera(dt);
    this.render();
    return this.trackQuality(dt);
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

  render(): void {
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

  renderStatic(now: number): void {
    if (this.degenerate) return;
    this.state.time = now;
    this.state.dt = 16.667;
    this.state.dtScale = 1;
    this.state.morph = this.state.targetMorph;
    this.backend.step(this.state, this.opts);
    this.render();
  }

  private trackQuality(dt: number): boolean {
    if (!this.opts.adaptiveQuality) return false;

    this.frameAccumulator += dt;
    this.frameSamples++;
    if (this.frameSamples < 45) return false;

    const average = this.frameAccumulator / this.frameSamples;
    this.fpsValue = Math.round(1000 / average);
    this.frameAccumulator = 0;
    this.frameSamples = 0;

    const previous = this.quality;
    if (average > 22 && this.quality > 0.5) this.quality = Math.max(0.5, this.quality - 0.1);
    else if (average < 13 && this.quality < 1) this.quality = Math.min(1, this.quality + 0.05);

    return previous !== this.quality;
  }

  restoreContext(): void {
    this.renderer.restore();
    this.renderer.setBlend(this.opts.blend);
    this.renderer.allocate(this.backend.capacity);
  }

  dispose(): void {
    this.backend.dispose();
    this.renderer.dispose();
    this.shape = null;
    this.shockwaves.length = 0;
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
