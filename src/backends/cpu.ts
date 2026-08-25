import { fibonacciSphere, hash2i, noise2, parseColor, rand } from '../core/math';
import type { ColorSpec, RGB } from '../core/types';
import { packColor } from '../core/renderer';
import { sortBehaviors } from '../core/pipeline';
import { resolveChoreography } from '../core/choreography';
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
  flash: new Float32Array(capacity),
  sizeRoll: new Float32Array(capacity),
  brightRoll: new Float32Array(capacity),
  delay: new Float32Array(capacity),
  tx: new Float32Array(capacity),
  ty: new Float32Array(capacity),
  tz: new Float32Array(capacity),
  spreadX: new Float32Array(capacity),
  spreadY: new Float32Array(capacity),
  spreadZ: new Float32Array(capacity),
  shapeX: new Float32Array(capacity),
  shapeY: new Float32Array(capacity),
  shapeZ: new Float32Array(capacity),
  prevShapeX: new Float32Array(capacity),
  prevShapeY: new Float32Array(capacity),
  prevShapeZ: new Float32Array(capacity),
  tint: new Float32Array(capacity),
  shapeTint: new Uint32Array(capacity),
  prevShapeTint: new Uint32Array(capacity),
  hasShapeTint: false,
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
  sizeRoll: new Float32Array(capacity),
  brightRoll: new Float32Array(capacity),
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

/** Blend two packed 0x00RRGGBB values. Channels are independent, so mix in place. */
const mixPacked = (from: number, to: number, t: number): number => {
  const r = (from & 0xff) + (((to & 0xff) - (from & 0xff)) * t);
  const g = ((from >> 8) & 0xff) + ((((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * t);
  const b = ((from >> 16) & 0xff) + ((((to >> 16) & 0xff) - ((from >> 16) & 0xff)) * t);
  return (r | 0) | ((g | 0) << 8) | ((b | 0) << 16);
};

/** A ramp or shape spec collapsed to one colour, for the ambient field. */
const resolveSolid = (spec: Exclude<ColorSpec, string>, fallback: RGB): string =>
  spec.type === 'ramp' ? spec.from : spec.fallback || packRgbString(fallback);

const packRgbString = (rgb: RGB): string =>
  '#' +
  [rgb[0], rgb[1], rgb[2]]
    .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
    .join('');

const colorCache = new Map<string, RGB>();

const cachedColor = (value: string): RGB => {
  let parsed = colorCache.get(value);
  if (!parsed) {
    parsed = parseColor(value);
    if (colorCache.size > 64) colorCache.clear();
    colorCache.set(value, parsed);
  }
  return parsed;
};

export class CpuBackend implements SimulationBackend {
  readonly name = 'cpu';

  major: MajorState = createMajorState(0);
  minor: MinorState = createMinorState(0);
  emission: EmissionState = createEmissionState(0);

  private behaviors: Behavior[] = [];
  private context: SimContext | null = null;
  private pendingShape: Float32Array | null = null;
  private pendingColors: Uint32Array | null = null;
  private sourceOrder = new Uint32Array(0);
  private sphereVec = { x: 0, y: 0, z: 0 };
  private spreadRadius = 0.62;
  private spreadVolume = 1;
  radiusPx = 1;

  get capacity(): number {
    return this.major.capacity + this.minor.capacity + this.emission.capacity;
  }

  get majorCount(): number {
    return this.major.count;
  }

  get minorCount(): number {
    return this.minor.count;
  }

  init(ctx: BackendContext): void {
    this.spreadRadius = ctx.options.spread.radius;
    this.spreadVolume = ctx.options.spread.volume;
    this.behaviors = sortBehaviors(ctx.options.behaviors ?? []);
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

  precompute(options: StippleOptions): void {
    const major = this.major;
    const majorBias = options.major.sizeBias;
    // `enter` owns the launch ordering: it is the move that establishes where
    // each particle sits in the queue, and exit/swap reuse the same delays so a
    // wipe reverses along its own path instead of scrambling.
    const order = resolveChoreography(options.transition.enter).order;
    const radius = this.radiusPx || 1;
    const count = major.count;

    const ramp = typeof options.color === 'object' && options.color.type === 'ramp'
      ? options.color.by
      : null;

    for (let i = 0; i < count; i++) {
      major.sizeRoll[i] = Math.pow(hash2i(i, 4093), majorBias);
      major.brightRoll[i] = hash2i(i, 9127);

      const lx = major.spreadX[i]!;
      const ly = major.spreadY[i]!;
      let key: number;
      if (order === 'x') key = (lx / radius + 1) * 0.5;
      else if (order === 'y') key = (ly / radius + 1) * 0.5;
      else if (order === 'radial') key = Math.min(1, Math.hypot(lx, ly) / radius);
      else if (order === 'radar') key = (Math.atan2(ly, lx) + Math.PI) / (Math.PI * 2);
      else key = hash2i(i, 5077);
      major.delay[i] = key < 0 ? 0 : key > 1 ? 1 : key;

      if (ramp) {
        let t: number;
        if (ramp === 'depth') t = (major.spreadZ[i]! / radius + 1) * 0.5;
        else if (ramp === 'radius') t = Math.min(1, Math.hypot(lx, ly) / radius);
        else t = count > 1 ? i / (count - 1) : 0;
        major.tint[i] = t < 0 ? 0 : t > 1 ? 1 : t;
      }
    }

    const minor = this.minor;
    const minorBias = options.minor.sizeBias;
    for (let i = 0; i < minor.count; i++) {
      minor.sizeRoll[i] = Math.pow(hash2i(i, 2731), minorBias);
      minor.brightRoll[i] = hash2i(i, 6791);
    }
  }

  private layoutMajor(viewport: Viewport): void {
    const major = this.major;
    const count = major.count;
    if (count === 0) return;

    const radius =
      Math.hypot(viewport.width, viewport.height) * 0.5 * this.spreadRadius;
    this.radiusPx = radius;

    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const fresh = major.seed[0] === 0 && major.seed[count - 1] === 0;
    const shell = 1 - this.spreadVolume;
    const jitter = 0.05;

    for (let i = 0; i < count; i++) {
      fibonacciSphere(i, count, this.sphereVec);

      const dx = this.sphereVec.x + (hash2i(i, 11) - 0.5) * jitter;
      const dy = this.sphereVec.y + (hash2i(i, 23) - 0.5) * jitter;
      const dz = this.sphereVec.z + (hash2i(i, 37) - 0.5) * jitter;
      const length = Math.hypot(dx, dy, dz) || 1;

      const uniform = Math.cbrt(hash2i(i, 8191));
      const depth = (shell + (1 - shell) * uniform) * radius;
      const scale = depth / length;

      major.spreadX[i] = dx * scale;
      major.spreadY[i] = dy * scale;
      major.spreadZ[i] = dz * scale;

      if (fresh) {
        major.x[i] = centerX + major.spreadX[i]!;
        major.y[i] = centerY + major.spreadY[i]!;
        major.z[i] = major.spreadZ[i]!;
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

  setShape(
    points: Float32Array | null,
    options: StippleOptions,
    colors: Uint32Array | null = null,
    keepPrevious = false,
  ): void {
    const major = this.major;

    if (!points || points.length === 0) {
      major.hasShape = false;
      major.hasShapeTint = false;
      this.pendingShape = null;
      this.pendingColors = null;
      return;
    }

    const assign = options.shapes?.assign;
    if (!assign) return;

    const count = major.count;

    // Snapshot the outgoing shape so a swap has somewhere to come from.
    if (keepPrevious && major.hasShape) {
      major.prevShapeX.set(major.shapeX.subarray(0, count));
      major.prevShapeY.set(major.shapeY.subarray(0, count));
      major.prevShapeZ.set(major.shapeZ.subarray(0, count));
      if (major.hasShapeTint) major.prevShapeTint.set(major.shapeTint.subarray(0, count));
    }

    this.pendingShape = points;
    this.pendingColors = colors;

    if (this.sourceOrder.length < count) this.sourceOrder = new Uint32Array(count);

    assign(
      options.assign,
      points,
      count,
      major.x,
      major.y,
      major.shapeX,
      major.shapeY,
      major.shapeZ,
      4,
      this.sourceOrder,
    );

    if (colors && colors.length > 0) {
      const available = colors.length;
      for (let i = 0; i < count; i++) {
        major.shapeTint[i] = colors[this.sourceOrder[i]! % available]!;
      }
      if (!keepPrevious || !major.hasShapeTint) {
        major.prevShapeTint.set(major.shapeTint.subarray(0, count));
      }
      major.hasShapeTint = true;
    } else {
      major.hasShapeTint = false;
    }

    if (!keepPrevious || !major.hasShape) {
      major.prevShapeX.set(major.shapeX.subarray(0, count));
      major.prevShapeY.set(major.shapeY.subarray(0, count));
      major.prevShapeZ.set(major.shapeZ.subarray(0, count));
    }

    major.hasShape = true;
  }

  reassign(options: StippleOptions): void {
    if (this.pendingShape) this.setShape(this.pendingShape, options, this.pendingColors);
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

    const spec = options.color;
    const solid = typeof spec === 'string';
    const ramp = !solid && spec.type === 'ramp' ? spec : null;
    const fromShape = !solid && spec.type === 'shape' ? spec : null;

    const baseRgb = cachedColor(solid ? spec : ramp ? ramp.from : fromShape!.fallback);
    const rampToRgb = ramp ? cachedColor(ramp.to) : baseRgb;

    let majorRgb = baseRgb;
    if (state.shapeColor && morph > 0) {
      const tint = cachedColor(state.shapeColor);
      majorRgb = [
        baseRgb[0] + (tint[0] - baseRgb[0]) * morph,
        baseRgb[1] + (tint[1] - baseRgb[1]) * morph,
        baseRgb[2] + (tint[2] - baseRgb[2]) * morph,
      ];
    }
    const minorSpec = options.minorColor;
    const minorRgb = minorSpec
      ? cachedColor(typeof minorSpec === 'string' ? minorSpec : resolveSolid(minorSpec, baseRgb))
      : baseRgb;

    const majorBase = packColor(majorRgb[0], majorRgb[1], majorRgb[2], 0) & 0x00ffffff;
    const minorBase = packColor(minorRgb[0], minorRgb[1], minorRgb[2], 0) & 0x00ffffff;

    // Per-particle colour only costs anything when it is actually asked for.
    const perParticle = ramp !== null || (fromShape !== null && this.major.hasShapeTint);
    const swapTint = fromShape !== null && this.major.hasShapeTint && state.swapping;
    const swapMix = state.swap;

    // The shader maps a pixel to clip space as
    //   ndc = (px / size * 2 - 1) * scale + offset
    // so the on-screen pixel rect is the inverse of |ndc| <= 1. Culling against
    // the raw viewport instead would crop the field to a hard rectangle as soon
    // as the camera zooms out, which is most visible on the top and bottom of
    // the spread sphere — it is taller than the viewport at the default radius.
    const { scale, offsetX, offsetY } = state.camera;
    const safeScale = Math.abs(scale) < 1e-4 ? 1e-4 : scale;
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const spanX = halfW / safeScale;
    const spanY = halfH / safeScale;
    const centerX = halfW - (offsetX * halfW) / safeScale;
    const centerY = halfH + (offsetY * halfH) / safeScale;

    const minX = centerX - spanX - 64;
    const maxX = centerX + spanX + 64;
    const minY = centerY - spanY - 64;
    const maxY = centerY + spanY + 64;

    let offset = 0;

    const minor = this.minor;
    const minorScale = options.minor.sizeScale * dpr;
    for (let i = 0; i < minor.count; i++) {
      const x = minor.x[i]!;
      const y = minor.y[i]!;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      const o = offset * 4;
      floats[o] = x * invW;
      floats[o + 1] = y * invH;
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
    const depthRange = 0.5 / Math.max(1, this.radiusPx);

    for (let i = 0; i < major.count; i++) {
      const x = major.x[i]!;
      const y = major.y[i]!;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      const seed = major.seed[i]!;
      const normalizedZ = major.z[i]! * depthRange + 0.5;
      const depthScale = 1 + (normalizedZ - 0.5) * depthAmount;

      const flash = major.flash[i]!;
      const sizeJitter = 1 - variation * 0.5 + major.sizeRoll[i]! * variation;
      const size =
        baseSize * sizeJitter * (1 + (depthScale - 1) * spreadInfluence) * (1 + flash * 0.9);

      const twinkle = 1 - twinkleAmount + twinkleAmount * noise2(seed * 0.6, time * 0.0004);
      const morphedOpacity = 0.92 * twinkle;
      const bright = major.brightRoll[i]!;
      const brightness = 0.52 + 0.48 * bright * bright;
      const spreadOpacity = brightness * (0.78 + normalizedZ * 0.22) * major.glow[i]!;
      let opacity = spreadOpacity + (morphedOpacity - spreadOpacity) * morph;
      opacity += flash * 0.75;
      const alpha = opacity < 0 ? 0 : opacity > 1 ? 255 : (opacity * 255) | 0;

      let rgb = majorBase;
      if (perParticle) {
        if (ramp) {
          const t = major.tint[i]!;
          rgb =
            packColor(
              baseRgb[0] + (rampToRgb[0] - baseRgb[0]) * t,
              baseRgb[1] + (rampToRgb[1] - baseRgb[1]) * t,
              baseRgb[2] + (rampToRgb[2] - baseRgb[2]) * t,
              0,
            ) & 0x00ffffff;
        } else {
          const to = major.shapeTint[i]!;
          const sampled = swapTint ? mixPacked(major.prevShapeTint[i]!, to, swapMix) : to;
          // Fade from the spread colour into the SVG's own colour as it forms.
          rgb = morph >= 1 ? sampled : mixPacked(majorBase, sampled, morph);
        }
      }

      const o = offset * 4;
      floats[o] = x * invW;
      floats[o + 1] = y * invH;
      floats[o + 2] = size;
      colors[o + 3] = rgb | (alpha << 24);
      offset++;
    }

    const emission = this.emission;
    for (let i = 0; i < emission.count; i++) {
      const x = emission.x[i]!;
      const y = emission.y[i]!;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      const o = offset * 4;
      floats[o] = x * invW;
      floats[o + 1] = y * invH;
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
