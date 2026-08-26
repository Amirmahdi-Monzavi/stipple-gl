import { clamp, clamp01 } from './math';
import { defaultOptions, mergeOptions } from './options';
import { baseChoreography, mirrorChoreography, resolveChoreography } from './choreography';
import { PointRenderer } from './renderer';
import type {
  ChoreographyConfig,
  Choreography,
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
  onMorphProgress?(value: number): void;
  onMorphSettled?(value: number): void;
  onSwapEnd?(): void;
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

  /** Per-call override from `setShape`, cleared when the swap finishes. */
  private swapChoreography: Choreography | null = null;

  quality = 1;
  degenerate = true;

  private spreadPhase = 0;

  private frameAccumulator = 0;
  private frameSamples = 0;
  private fpsValue = 0;
  private callbacks: RuntimeCallbacks;

  constructor(surface: RuntimeSurface, options: StippleOptions, callbacks: RuntimeCallbacks = {}) {
    this.opts = options;
    this.callbacks = callbacks;

    const gl = surface.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });

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
      camera: { scale: 1, offsetX: 0, offsetY: 0 },
      swap: 1,
      swapping: false,
      choreo: {
        enter: baseChoreography,
        exit: baseChoreography,
        swap: null,
      },
    };

    this.refreshChoreography();

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

  applyShape(shape: ShapeConfig, swap = false): void {
    if (this.degenerate) return;

    const shapes = this.opts.shapes;
    if (!shapes) {
      this.opts.onError?.(
        fail(
          'setShape needs the SVG sampler; import Stipple from "stipple-gl", not "stipple-gl/lite"',
        ),
      );
      return;
    }

    const count = Math.min(shape.count ?? this.opts.count, this.opts.count);
    const sampled = shapes.sample(shape, count, this.viewport.width, this.viewport.height);

    if (sampled.points.length === 0) {
      this.backend.setShape(null, this.opts);
      this.state.hasShape = false;
      this.state.shapeColor = null;
      return;
    }

    const bounds = shapes.bounds(sampled.points);
    this.shapeBox.minX = bounds.minX;
    this.shapeBox.minY = bounds.minY;
    this.shapeBox.maxX = bounds.maxX;
    this.shapeBox.maxY = bounds.maxY;

    this.backend.setShape(sampled.points, this.opts, sampled.colors, swap);
    this.state.hasShape = true;
    this.state.shapeColor = shape.color ?? null;
  }

  /**
   * Install a shape. Returns false when the request could not be honoured —
   * currently only when the field has no major particles to arrange.
   */
  setShape(shape: ShapeConfig | null, choreography?: ChoreographyConfig | 'none'): boolean {
    const had = this.state.hasShape;
    this.shape = shape;

    // A raster-backed shape carries no paths, so emptiness has to consider both.
    if (!shape || (shape.paths.length === 0 && !shape.image)) {
      this.backend.setShape(null, this.opts);
      this.state.hasShape = false;
      this.state.shapeColor = null;
      this.state.swapping = false;
      return true;
    }

    if (this.opts.count === 0) {
      this.opts.onError?.(
        fail(
          'setShape was ignored: this configuration has no major particles (count is 0). ' +
            'Ambient presets like starfield and dust cannot form a shape.',
        ),
      );
      return false;
    }

    // A swap only makes sense when a shape is already on screen and the field is
    // actually showing it. Otherwise this is a plain enter and the sphere is the
    // starting point.
    const resolved = choreography === undefined ? this.opts.transition.swap : choreography;
    const wantsSwap = resolved !== 'none';
    const swapping = wantsSwap && had && this.state.morph > 0.02;

    this.applyShape(shape, swapping);

    if (swapping) {
      this.state.swap = 0;
      this.state.swapping = true;
      this.swapChoreography =
        choreography !== undefined && choreography !== 'none'
          ? resolveChoreography(choreography, this.state.choreo.enter)
          : null;
      this.refreshChoreography();
    } else {
      this.state.swap = 1;
      this.state.swapping = false;
      this.swapChoreography = null;
    }

    return true;
  }

  /** Recompute the resolved choreographies. Cheap, and only on option changes. */
  refreshChoreography(): void {
    const transition = this.opts.transition;
    const enter = resolveChoreography(transition.enter);
    const exit =
      transition.exit === 'mirror'
        ? mirrorChoreography(enter)
        : resolveChoreography(transition.exit, enter);
    const swap =
      this.swapChoreography ??
      (transition.swap === 'none' ? null : resolveChoreography(transition.swap, enter));

    this.state.choreo = { enter, exit, swap };
  }

  setOptions(config: StippleConfig): void {
    const before = this.opts;
    this.opts = mergeOptions(this.opts, config);
    const next = this.opts;

    // `behaviors`, `shapes` and `backend` are capabilities injected once at
    // construction (by `Stipple`, or by the worker thread), and they all default
    // to `null`. Any config built from `defaultOptions` — every preset switch,
    // for instance — carries those nulls, which would silently tear the engine
    // down: an empty behaviour pipeline freezes the field, and a missing sampler
    // makes `setShape` a no-op. Treat `null` here as "unspecified", not "remove".
    // Pass an explicit `[]` to genuinely run no behaviours.
    if (next.behaviors === null) next.behaviors = before.behaviors;
    if (next.shapes === null) next.shapes = before.shapes;
    if (next.backend === null) next.backend = before.backend;

    if (next.behaviors !== before.behaviors) {
      this.backend.init({ gl: this.gl, options: next, viewport: this.viewport });
    }

    if (next.blend !== before.blend) this.renderer.setBlend(next.blend);

    if (next.transition !== before.transition) this.refreshChoreography();

    const orderChanged =
      this.state.choreo.enter.order !== resolveChoreography(before.transition.enter).order;

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
      orderChanged ||
      next.color !== before.color ||
      next.major.sizeBias !== before.major.sizeBias ||
      next.minor.sizeBias !== before.minor.sizeBias
    ) {
      this.backend.precompute(next);
    }

    if (next.assign !== before.assign && this.shape) {
      this.applyShape(this.shape);
    }
  }

  /**
   * Drop every runtime tweak and rebuild from the defaults, keeping the
   * capabilities that were injected at construction and the shape on screen.
   */
  resetOptions(config?: StippleConfig): void {
    const { behaviors, shapes, backend, onReady, onError } = this.opts;

    this.setOptions({ ...(defaultOptions as StippleConfig), ...config });

    // `mergeOptions` deep-clones plain objects, which would hand back a *copy* of
    // the sampler rather than the sampler itself. Capabilities are identities,
    // not values, so they are restored directly.
    this.opts.behaviors = behaviors;
    this.opts.shapes = shapes;
    this.opts.backend = backend;
    this.opts.onReady = onReady;
    this.opts.onError = onError;
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

    // Entering and leaving are separate moves with separate rates, so the one in
    // force depends on which way the morph is heading.
    const previousMorph = state.morph;
    const moving = state.targetMorph < state.morph ? state.choreo.exit : state.choreo.enter;
    const speed = clamp01(1 - Math.pow(1 - moving.speed, state.dtScale));
    state.morph += (state.targetMorph - state.morph) * speed;
    if (Math.abs(state.targetMorph - state.morph) < 0.0005) state.morph = state.targetMorph;

    // A swap advances on its own clock and finishes independently of the morph.
    if (state.swapping) {
      const swapChoreo = state.choreo.swap;
      if (!swapChoreo) {
        state.swap = 1;
        state.swapping = false;
      } else {
        const swapSpeed = clamp01(1 - Math.pow(1 - swapChoreo.speed, state.dtScale));
        state.swap += (1 - state.swap) * swapSpeed;
        // The last fraction of a swap is a sub-pixel move between two shapes,
        // and  smooths the handover, so finishing early costs nothing
        // visible and keeps a swap as quick as an enter.
        if (state.swap > 0.995) {
          state.swap = 1;
          state.swapping = false;
          this.swapChoreography = null;
          this.refreshChoreography();
          this.callbacks.onSwapEnd?.();
        }
      }
    }

    if (state.morph !== previousMorph) {
      this.callbacks.onMorphProgress?.(state.morph);
      if (state.morph === state.targetMorph) this.callbacks.onMorphSettled?.(state.morph);
    }

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

    const camera = this.state.camera;
    camera.scale += (targetScale - camera.scale) * speed;
    camera.offsetX += (targetX - camera.offsetX) * speed;
    camera.offsetY += (targetY - camera.offsetY) * speed;
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
      this.state.camera.offsetX,
      this.state.camera.offsetY,
      this.state.camera.scale,
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
