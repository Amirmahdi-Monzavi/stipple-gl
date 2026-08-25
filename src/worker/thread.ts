import { createDefaultBehaviors } from '../behaviors';
import { resolveOptions } from '../core/options';
import { Runtime } from '../core/runtime';
import { shapeSupport } from '../sources/support';
import type { MainToWorker, WorkerToMain } from './protocol';

interface WorkerScope {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  requestAnimationFrame?(callback: (time: number) => void): number;
  cancelAnimationFrame?(handle: number): void;
  setTimeout(handler: () => void, timeout: number): number;
}

const scope = self as unknown as WorkerScope;

let runtime: Runtime | null = null;
let canvas: OffscreenCanvas | null = null;
let running = false;
let frame = 0;
let timer = 0;
let lastTime = 0;
let lastFrameAt = 0;
let lastStatsAt = 0;

const post = (message: WorkerToMain): void => scope.postMessage(message);

const hasRaf = typeof scope.requestAnimationFrame === 'function';

const schedule = (fn: (now: number) => void): void => {
  if (hasRaf) frame = scope.requestAnimationFrame!(fn);
  else timer = scope.setTimeout(() => fn(performance.now()), 16);
};

const unschedule = (): void => {
  if (hasRaf && frame) scope.cancelAnimationFrame!(frame);
  if (!hasRaf && timer) clearTimeout(timer);
  frame = 0;
  timer = 0;
};

const applyResolution = (width: number, height: number, dpr: number): void => {
  if (!runtime || !canvas) return;
  runtime.setResolution(width, height, dpr);
  canvas.width = Math.floor(runtime.viewport.width * runtime.viewport.dpr);
  canvas.height = Math.floor(runtime.viewport.height * runtime.viewport.dpr);
  runtime.renderer.setViewport(runtime.viewport);
};

const loop = (now: number): void => {
  if (!running || !runtime) return;
  schedule(loop);

  const cap = runtime.opts.maxFps;
  if (cap > 0) {
    if (now - lastFrameAt < 1000 / cap - 0.5) return;
    lastFrameAt = now;
  }

  const dt = Math.min(now - lastTime, 100);
  lastTime = now;

  const qualityChanged = runtime.step(now, dt);
  if (qualityChanged) {
    applyResolution(runtime.viewport.width, runtime.viewport.height, runtime.viewport.dpr);
  }

  if (now - lastStatsAt > 500) {
    lastStatsAt = now;
    post({
      type: 'stats',
      fps: runtime.fps,
      morph: runtime.state.morph,
      hasShape: runtime.state.hasShape,
      box: { ...runtime.shapeBox },
    });
  }
};

const start = (): void => {
  if (running || !runtime || runtime.degenerate) return;
  running = true;
  lastTime = performance.now();
  lastFrameAt = lastTime;
  schedule(loop);
};

const stop = (): void => {
  running = false;
  unschedule();
};

scope.onmessage = (event: MessageEvent<MainToWorker>): void => {
  const message = event.data;

  try {
    switch (message.type) {
      case 'init': {
        canvas = message.canvas;
        const options = resolveOptions({
          ...message.config,
          shapes: shapeSupport,
          behaviors: createDefaultBehaviors(),
        });
        runtime = new Runtime(canvas, options);
        applyResolution(message.viewport.width, message.viewport.height, message.viewport.dpr);
        runtime.allocate();
        post({ type: 'ready' });
        start();
        break;
      }

      case 'resize':
        applyResolution(message.viewport.width, message.viewport.height, message.viewport.dpr);
        if (!running) start();
        break;

      case 'morph':
        if (runtime) runtime.state.targetMorph = message.value;
        break;

      case 'shape':
        runtime?.setShape(message.shape);
        break;

      case 'options':
        runtime?.setOptions(message.config);
        break;

      case 'count':
        runtime?.setCount(message.count, message.minorCount);
        break;

      case 'pointer':
        if (runtime) {
          const pointer = runtime.pointer;
          pointer.x = message.x;
          pointer.y = message.y;
          pointer.active = message.active;
          pointer.down = message.down;
        }
        break;

      case 'pulse':
        runtime?.pulse(message.x, message.y, message.strength, performance.now());
        break;

      case 'run':
        if (message.value) start();
        else stop();
        break;

      case 'destroy':
        stop();
        runtime?.dispose();
        runtime = null;
        canvas = null;
        scope.close();
        break;
    }
  } catch (error) {
    post({ type: 'error', message: (error as Error).message });
  }
};
