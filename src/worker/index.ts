import { resolveTarget, styleCanvas } from '../core/engine';
import { resolveOptions } from '../core/options';
import { fail } from '../core/runtime';
import type {
  ShapeConfig,
  StippleConfig,
  StippleInstance,
  StippleOptions,
} from '../core/types';
import type { MainToWorker, ShapeBox, WorkerToMain } from './protocol';
import { droppedKeys, sanitizeConfig } from './protocol';

export type WorkerTarget = HTMLElement | HTMLCanvasElement | string;

export interface WorkerStippleConfig extends StippleConfig {
  worker?: Worker;
  workerUrl?: string | URL;
  onDroppedOptions?: (keys: string[]) => void;
}

export const workerModeSupported = (): boolean =>
  typeof Worker !== 'undefined' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';

export class WorkerStipple implements StippleInstance {
  readonly canvas: HTMLCanvasElement;

  private host: HTMLElement;
  private ownsCanvas: boolean;
  private worker: Worker;
  private opts: StippleOptions;

  private shapeBox: ShapeBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private hasShape = false;
  private morph = 0;
  private targetMorph = 0;
  private fpsValue = 0;

  private isRunning = true;
  private visible = true;
  private documentVisible = true;
  private disposed = false;
  private pageHeight: number | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(target: WorkerTarget, config?: WorkerStippleConfig) {
    if (typeof window === 'undefined') throw fail('WorkerStipple requires a browser environment');
    if (!workerModeSupported()) throw fail('OffscreenCanvas worker mode is not supported here');

    const { worker, workerUrl, onDroppedOptions, ...rest } = config ?? {};
    this.opts = resolveOptions(rest);

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

    if (this.ownsCanvas) {
      styleCanvas(this.canvas, this.opts.mode, this.opts.background, this.pageHeight);
    }

    this.worker =
      worker ??
      new Worker(workerUrl ?? new URL('./thread.js', import.meta.url), { type: 'module' });

    this.worker.onmessage = this.onMessage;

    const config2 = sanitizeConfig(rest);
    if (droppedKeys.length) onDroppedOptions?.([...droppedKeys]);

    const offscreen = this.canvas.transferControlToOffscreen();
    const viewport = this.measure();

    this.send({ type: 'init', canvas: offscreen, config: config2, viewport }, [offscreen]);
    this.bind();
  }

  private send(message: MainToWorker, transfer?: Transferable[]): void {
    if (this.disposed) return;
    if (transfer) this.worker.postMessage(message, transfer);
    else this.worker.postMessage(message);
  }

  private onMessage = (event: MessageEvent<WorkerToMain>): void => {
    const message = event.data;
    if (message.type === 'stats') {
      this.fpsValue = message.fps;
      this.morph = message.morph;
      this.hasShape = message.hasShape;
      this.shapeBox = message.box;
    } else if (message.type === 'error') {
      this.opts.onError?.(fail(message.message));
    } else if (message.type === 'ready') {
      this.opts.onReady?.(this);
    }
  };

  private measure(): { width: number; height: number; dpr: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      width: Math.round(rect.width || this.host.clientWidth),
      height: Math.round(rect.height || this.host.clientHeight),
      dpr: window.devicePixelRatio || 1,
    };
  }

  private lastWidth = 0;
  private lastHeight = 0;

  private handleResize = (): void => {
    const viewport = this.measure();
    if (
      Math.abs(viewport.width - this.lastWidth) < 2 &&
      Math.abs(viewport.height - this.lastHeight) < 2
    ) {
      return;
    }
    this.lastWidth = viewport.width;
    this.lastHeight = viewport.height;
    this.send({ type: 'resize', viewport });
  };

  private surface(): EventTarget {
    return this.opts.mode === 'container' ? this.host : window;
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

  private bind(): void {
    this.resizeObserver = new ResizeObserver(this.handleResize);
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

    if (this.opts.pointer.enabled) {
      const surface = this.surface();
      for (const [type, handler] of this.pointerBindings()) {
        surface.addEventListener(type, handler, { passive: true });
      }
    }
  }

  private onVisibilityChange = (): void => {
    this.documentVisible = !document.hidden;
    this.syncRunning();
  };

  private syncRunning(): void {
    const shouldRun =
      !this.disposed && this.documentVisible && (this.visible || !this.opts.autoPause);
    if (shouldRun === this.isRunning) return;
    this.isRunning = shouldRun;
    this.send({ type: 'run', value: shouldRun });
  }

  private within(x: number, y: number): boolean {
    if (!this.hasShape) return true;
    const pad = this.opts.pointer.radius;
    return (
      x >= this.shapeBox.minX - pad &&
      x <= this.shapeBox.maxX + pad &&
      y >= this.shapeBox.minY - pad &&
      y <= this.shapeBox.maxY + pad
    );
  }

  private local(event: PointerEvent): { x: number; y: number; inside: boolean } {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
  }

  private pointerDown = false;

  private onPointerMove = (event: PointerEvent): void => {
    const { x, y, inside } = this.local(event);
    const active = inside && this.within(x, y);
    if (!active) this.pointerDown = false;
    this.send({ type: 'pointer', x, y, active, down: this.pointerDown });
  };

  private onPointerDown = (event: PointerEvent): void => {
    const { x, y, inside } = this.local(event);
    if (!inside || !this.within(x, y)) return;
    this.pointerDown = true;
    this.send({ type: 'pointer', x, y, active: true, down: true });
    if (this.opts.pointer.shockwave) this.pulse(x, y);
  };

  private onPointerUp = (): void => {
    this.pointerDown = false;
    this.send({ type: 'pointer', x: 0, y: 0, active: true, down: false });
  };

  private onPointerLeave = (): void => {
    this.pointerDown = false;
    this.send({ type: 'pointer', x: -1, y: -1, active: false, down: false });
  };

  get options(): StippleOptions {
    return this.opts;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get fps(): number {
    return this.fpsValue;
  }

  setMorph(value: number): void {
    this.targetMorph = value < 0 ? 0 : value > 1 ? 1 : value;
    this.send({ type: 'morph', value: this.targetMorph });
  }

  getMorph(): number {
    return this.morph;
  }

  setShape(shape: ShapeConfig | null): void {
    this.send({ type: 'shape', shape });
  }

  setOptions(config: StippleConfig): void {
    this.opts = resolveOptions({ ...this.opts, ...config } as StippleConfig);
    this.send({ type: 'options', config: sanitizeConfig(config) });
  }

  setCount(count: number, minorCount?: number): void {
    this.opts.count = count;
    if (minorCount !== undefined) this.opts.minorCount = minorCount;
    this.send({ type: 'count', count, minorCount: this.opts.minorCount });
  }

  setPageHeight(height: number | null): void {
    this.pageHeight = height;
    if (this.opts.mode === 'page' && this.ownsCanvas) {
      this.canvas.style.height = height ? height + 'px' : '100%';
    }
  }

  pulse(x: number, y: number, strength = 0.55): void {
    this.send({ type: 'pulse', x, y, strength });
  }

  tick(): void {
    this.opts.onError?.(fail('tick() is not available in worker mode; the worker drives its own loop'));
  }

  resize(): void {
    this.lastWidth = 0;
    this.handleResize();
  }

  start(): void {
    this.isRunning = true;
    this.send({ type: 'run', value: true });
  }

  stop(): void {
    this.isRunning = false;
    this.send({ type: 'run', value: false });
  }

  destroy(): void {
    if (this.disposed) return;
    this.send({ type: 'destroy' });
    this.disposed = true;

    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const surface = this.surface();
    for (const [type, handler] of this.pointerBindings()) {
      surface.removeEventListener(type, handler);
    }

    setTimeout(() => this.worker.terminate(), 0);
    if (this.ownsCanvas) this.canvas.remove();
  }
}

export const createWorkerStipple = (
  target: WorkerTarget,
  config?: WorkerStippleConfig,
): WorkerStipple => new WorkerStipple(target, config);

export { sanitizeConfig } from './protocol';
export type { MainToWorker, WorkerToMain } from './protocol';
