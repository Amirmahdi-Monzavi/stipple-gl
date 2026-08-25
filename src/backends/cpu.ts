import { fibonacciSphere, noise2, parseColor, rand } from '../core/math';
import { packColor } from '../core/renderer';
import type {
  BackendContext,
  Behavior,
  EmissionState,
  FrameState,
  MajorState,
  MinorState,
  PackTarget,
  SimContext,
  SimulationBackend,
  StippleOptions,
  Viewport,
} from '../core/types';
import { assignTargets } from '../sources/assign';
import { createDefaultBehaviors } from '../behaviors';

const createMajorState = (capacity: number): MajorState => ({
  count: 0,
  capacity,
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  z: new Float32Array(capacity),
  vx: new Float32Array(capacity),
  vy: new Float32Array(capacity),
  vz: new Float32Array(capacity),
  seed: new Float32Array(capacity),
  glow: new Float32Array(capacity),
  tx: new Float32Array(capacity),
  ty: new Float32Array(capacity),
  tz: new Float32Array(capacity),
  spreadX: new Float32Array(capacity),
  spreadY: new Float32Array(capacity),
  spreadZ: new Float32Array(capacity),
  shapeX: new Float32Array(capacity),
  shapeY: new Float32Array(capacity),
  shapeZ: new Float32Array(capacity),
  hasShape: false,
});

const createMinorState = (capacity: number): MinorState => ({
  count: 0,
  capacity,
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  z: new Float32Array(capacity),
  vx: new Float32Array(capacity),
  vy: new Float32Array(capacity),
  vz: new Float32Array(capacity),
  size: new Float32Array(capacity),
  opacity: new Float32Array(capacity),
  seed: new Float32Array(capacity),
});

const createEmissionState = (capacity: number): EmissionState => ({
  count: 0,
  capacity,
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  z: new Float32Array(capacity),
  vx: new Float32Array(capacity),
  vy: new Float32Array(capacity),
  vz: new Float32Array(capacity),
  life: new Float32Array(capacity),
  maxLife: new Float32Array(capacity),
  size: new Float32Array(capacity),
  baseSize: new Float32Array(capacity),
  opacity: new Float32Array(capacity),
  angle: new Float32Array(capacity),
  r: new Float32Array(capacity),
  g: new Float32Array(capacity),
  b: new Float32Array(capacity),
});

export class CpuBackend implements SimulationBackend {
  readonly name = 'cpu';

  major: MajorState = createMajorState(0);
  minor: MinorState = createMinorState(0);
  emission: EmissionState = createEmissionState(0);

  private behaviors: Behavior[] = [];
  private context: SimContext | null = null;
  private pendingShape: Float32Array | null = null;
  private sphereVec = { x: 0, y: 0, z: 0 };
  private spreadRadius = 0.6;

  get capacity(): number {
    return this.major.capacity + this.minor.capacity + this.emission.capacity;
  }

  init(ctx: BackendContext): void {
    this.spreadRadius = ctx.options.spread.radius;
    const behaviors = ctx.options.behaviors ?? createDefaultBehaviors();
    this.behaviors = [...behaviors].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  reallocate(count: number, minorCount: number, viewport: Viewport): void {
    const emissionCapacity = Math.max(16, Math.ceil(count * 0.1));

    if (count > this.major.capacity) this.major = createMajorState(count);
    if (minorCount > this.minor.capacity) this.minor = createMinorState(minorCount);
    if (emissionCapacity > this.emission.capacity) {
      this.emission = createEmissionState(emissionCapacity);
    }

    this.major.count = count;
    this.minor.count = minorCount;
    this.emission.count = 0;
    this.context = null;

    this.layout(viewport);
  }

  layout(viewport: Viewport): void {
    const { width, height } = viewport;
    if (width <= 0 || height <= 0) return;

    this.layoutMajor(viewport);
    this.layoutMinor(viewport);
  }

  private layoutMajor(viewport: Viewport): void {
    const major = this.major;
    const count = major.count;
    if (count === 0) return;

    const fill = this.spreadRadius;
    const radiusX = viewport.width * fill;
    const radiusY = viewport.height * fill;
    const radiusZ = Math.min(viewport.width, viewport.height) * 0.375;
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const fresh = major.seed[0] === 0 && major.seed[count - 1] === 0;

    for (let i = 0; i < count; i++) {
      fibonacciSphere(i, count, this.sphereVec);

      const sx = centerX + this.sphereVec.x * radiusX;
      const sy = centerY + this.sphereVec.y * radiusY;
      const sz = this.sphereVec.z * radiusZ;

      major.spreadX[i] = sx;
      major.spreadY[i] = sy;
      major.spreadZ[i] = sz;

      if (fresh) {
        major.x[i] = sx;
        major.y[i] = sy;
        major.z[i] = sz;
        major.vx[i] = rand(-0.5, 0.5);
        major.vy[i] = rand(-0.5, 0.5);
        major.vz[i] = rand(-0.2, 0.2);
        major.seed[i] = rand(1, 1000);
        major.glow[i] = Math.random();
      }
    }
  }

  private layoutMinor(viewport: Viewport): void {
    const minor = this.minor;
    const count = minor.count;
    if (count === 0) return;

    const fresh = minor.seed[0] === 0 && minor.seed[count - 1] === 0;
    if (!fresh) return;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(0.5, 1.5);
      minor.x[i] = rand(0, viewport.width);
      minor.y[i] = rand(0, viewport.height);
      minor.z[i] = rand(-30, 30);
      minor.vx[i] = Math.cos(angle) * speed;
      minor.vy[i] = Math.sin(angle) * speed;
      minor.vz[i] = rand(-0.5, 0.5);
      minor.opacity[i] = rand(0.6, 0.9);
      minor.seed[i] = rand(1, 1000);
      minor.size[i] = 1;
    }
  }

  setShape(points: Float32Array | null, options: StippleOptions): void {
    const major = this.major;

    if (!points || points.length === 0) {
      major.hasShape = false;
      this.pendingShape = null;
      return;
    }

    this.pendingShape = points;
    assignTargets(
      options.transition.assign,
      points,
      major.count,
      major.spreadX,
      major.spreadY,
      major.shapeX,
      major.shapeY,
      major.shapeZ,
      4,
    );
    major.hasShape = true;
  }

  reassign(options: StippleOptions): void {
    if (this.pendingShape) this.setShape(this.pendingShape, options);
  }

  step(state: FrameState, options: StippleOptions): void {
    if (!this.context || this.context.options !== options) {
      this.context = {
        options,
        state,
        major: this.major,
        minor: this.minor,
        emission: this.emission,
      };
    }

    const ctx = this.context;
    ctx.state = state;
    ctx.major = this.major;
    ctx.minor = this.minor;
    ctx.emission = this.emission;
    ctx.options = options;

    state.hasShape = this.major.hasShape;

    for (let i = 0; i < this.behaviors.length; i++) {
      this.behaviors[i]!.step(ctx);
    }
  }

  pack(target: PackTarget, options: StippleOptions, state: FrameState): number {
    const { floats, colors } = target;
    const { width, height, dpr } = state.viewport;
    if (width <= 0 || height <= 0) return 0;

    const invW = 1 / width;
    const invH = 1 / height;
    const morph = state.morph;

    const majorRgb = parseColor(options.color);
    const minorRgb = options.minorColor ? parseColor(options.minorColor) : majorRgb;

    const majorBase = packColor(majorRgb[0], majorRgb[1], majorRgb[2], 0) & 0x00ffffff;
    const minorBase = packColor(minorRgb[0], minorRgb[1], minorRgb[2], 0) & 0x00ffffff;

    let offset = 0;

    const minor = this.minor;
    const minorScale = options.minor.sizeScale * dpr;
    for (let i = 0; i < minor.count; i++) {
      const o = offset * 4;
      floats[o] = minor.x[i]! * invW;
      floats[o + 1] = minor.y[i]! * invH;
      floats[o + 2] = minor.size[i]! * minorScale;
      colors[o + 3] = minorBase | (((minor.opacity[i]! * 255) | 0) << 24);
      offset++;
    }

    const major = this.major;
    const baseSize = options.major.size * dpr;
    const variation = options.major.sizeVariation;
    const twinkleAmount = options.major.twinkle;
    const depthAmount = options.major.depth;
    const spreadInfluence = morph >= 0.2 ? 0 : 1 - morph / 0.2;
    const time = state.time;
    const depthRange = 1 / Math.max(1, Math.min(width, height) * 0.75);

    for (let i = 0; i < major.count; i++) {
      const seed = major.seed[i]!;
      const normalizedZ = major.z[i]! * depthRange + 0.5;
      const depthScale = 1 + (normalizedZ - 0.5) * depthAmount;
      const sizeJitter = 1 - variation * 0.5 + ((seed % 100) / 100) * variation;
      const size = baseSize * sizeJitter * (1 + (depthScale - 1) * spreadInfluence);

      const twinkle = 1 - twinkleAmount + twinkleAmount * noise2(seed * 0.6, time * 0.0004);
      const morphedOpacity = 0.9 * twinkle;
      const spreadOpacity = 0.85 * (0.7 + normalizedZ * 0.3) * major.glow[i]!;
      const opacity = spreadOpacity + (morphedOpacity - spreadOpacity) * morph;
      const alpha = opacity < 0 ? 0 : opacity > 1 ? 255 : (opacity * 255) | 0;

      const o = offset * 4;
      floats[o] = major.x[i]! * invW;
      floats[o + 1] = major.y[i]! * invH;
      floats[o + 2] = size;
      colors[o + 3] = majorBase | (alpha << 24);
      offset++;
    }

    const emission = this.emission;
    for (let i = 0; i < emission.count; i++) {
      const o = offset * 4;
      floats[o] = emission.x[i]! * invW;
      floats[o + 1] = emission.y[i]! * invH;
      floats[o + 2] = emission.size[i]! * dpr;
      colors[o + 3] = packColor(
        emission.r[i]!,
        emission.g[i]!,
        emission.b[i]!,
        emission.opacity[i]!,
      );
      offset++;
    }

    return offset;
  }

  dispose(): void {
    for (const behavior of this.behaviors) behavior.dispose?.();
    this.behaviors = [];
    this.context = null;
    this.pendingShape = null;
    this.major = createMajorState(0);
    this.minor = createMinorState(0);
    this.emission = createEmissionState(0);
  }
}

export const createCpuBackend = (): SimulationBackend => new CpuBackend();
