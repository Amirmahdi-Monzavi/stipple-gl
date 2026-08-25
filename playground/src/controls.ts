export interface SliderSpec {
  kind: 'slider';
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
}

export interface ToggleSpec {
  kind: 'toggle';
  path: string;
  label: string;
}

export interface ColorSpec {
  kind: 'color';
  path: string;
  label: string;
}

export interface SelectSpec {
  kind: 'select';
  path: string;
  label: string;
  choices: string[];
}

export type ControlSpec = SliderSpec | ToggleSpec | ColorSpec | SelectSpec;

export interface ControlGroup {
  name: string;
  open?: boolean;
  controls: ControlSpec[];
}

export const readPath = (source: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, source);

export const writePath = (path: string, value: unknown): Record<string, unknown> => {
  const keys = path.split('.');
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const next: Record<string, unknown> = {};
    cursor[keys[i]!] = next;
    cursor = next;
  }
  cursor[keys[keys.length - 1]!] = value;
  return root;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

export interface ControlPanelHandle {
  sync(source: unknown): void;
}

export const buildPanel = (
  container: HTMLElement,
  groups: ControlGroup[],
  source: unknown,
  onChange: (patch: Record<string, unknown>, path: string, value: unknown) => void,
): ControlPanelHandle => {
  const syncers: Array<(source: unknown) => void> = [];

  for (const group of groups) {
    const details = el('details', 'group');
    details.open = group.open ?? false;

    const summary = el('summary');
    summary.textContent = group.name;
    details.appendChild(summary);

    const body = el('div', 'group-body');

    for (const spec of group.controls) {
      const row = el('div', 'row');
      const label = el('label');
      label.textContent = spec.label;
      row.appendChild(label);

      if (spec.kind === 'slider') {
        const value = el('span', 'value');
        const input = el('input');
        input.type = 'range';
        input.min = String(spec.min);
        input.max = String(spec.max);
        input.step = String(spec.step);

        const render = (n: number) => (spec.format ? spec.format(n) : String(n));

        const apply = (source: unknown) => {
          const current = Number(readPath(source, spec.path) ?? spec.min);
          input.value = String(current);
          value.textContent = render(current);
        };

        input.addEventListener('input', () => {
          const next = Number(input.value);
          value.textContent = render(next);
          onChange(writePath(spec.path, next), spec.path, next);
        });

        row.appendChild(value);
        row.appendChild(input);
        syncers.push(apply);
        apply(source);
      }

      if (spec.kind === 'toggle') {
        const input = el('input');
        input.type = 'checkbox';

        const apply = (source: unknown) => {
          input.checked = Boolean(readPath(source, spec.path));
        };

        input.addEventListener('change', () => {
          onChange(writePath(spec.path, input.checked), spec.path, input.checked);
        });

        row.appendChild(input);
        syncers.push(apply);
        apply(source);
      }

      if (spec.kind === 'color') {
        const input = el('input');
        input.type = 'color';

        const apply = (source: unknown) => {
          const current = readPath(source, spec.path);
          input.value = typeof current === 'string' && current.startsWith('#') ? current : '#4f9c7d';
        };

        input.addEventListener('input', () => {
          onChange(writePath(spec.path, input.value), spec.path, input.value);
        });

        row.appendChild(input);
        syncers.push(apply);
        apply(source);
      }

      if (spec.kind === 'select') {
        const select = el('select');
        for (const choice of spec.choices) {
          const option = el('option');
          option.value = choice;
          option.textContent = choice;
          select.appendChild(option);
        }

        const apply = (source: unknown) => {
          const current = readPath(source, spec.path);
          if (typeof current === 'string') select.value = current;
        };

        select.addEventListener('change', () => {
          onChange(writePath(spec.path, select.value), spec.path, select.value);
        });

        row.appendChild(select);
        syncers.push(apply);
        apply(source);
      }

      body.appendChild(row);
    }

    details.appendChild(body);
    container.appendChild(details);
  }

  return {
    sync(next: unknown) {
      for (const syncer of syncers) syncer(next);
    },
  };
};

export const controlGroups: ControlGroup[] = [
  {
    name: 'Field',
    open: true,
    controls: [
      { kind: 'slider', path: 'count', label: 'Particles', min: 0, max: 24000, step: 100 },
      { kind: 'slider', path: 'minorCount', label: 'Ambient', min: 0, max: 3000, step: 20 },
      { kind: 'color', path: 'color', label: 'Colour' },
      { kind: 'select', path: 'blend', label: 'Blend', choices: ['normal', 'additive'] },
      {
        kind: 'slider',
        path: 'opacity',
        label: 'Opacity',
        min: 0,
        max: 1,
        step: 0.01,
        format: (v) => v.toFixed(2),
      },
      {
        kind: 'slider',
        path: 'softness',
        label: 'Softness',
        min: 0.1,
        max: 2,
        step: 0.05,
        format: (v) => v.toFixed(2),
      },
    ],
  },
  {
    name: 'Particle',
    controls: [
      {
        kind: 'slider',
        path: 'major.size',
        label: 'Size',
        min: 0.5,
        max: 24,
        step: 0.1,
        format: (v) => v.toFixed(1),
      },
      {
        kind: 'slider',
        path: 'major.sizeVariation',
        label: 'Size variation',
        min: 0,
        max: 1.5,
        step: 0.05,
        format: (v) => v.toFixed(2),
      },
      {
        kind: 'slider',
        path: 'major.twinkle',
        label: 'Twinkle',
        min: 0,
        max: 1,
        step: 0.01,
        format: (v) => v.toFixed(2),
      },
      {
        kind: 'slider',
        path: 'major.depth',
        label: 'Depth shading',
        min: 0,
        max: 2,
        step: 0.05,
        format: (v) => v.toFixed(2),
      },
    ],
  },
  {
    name: 'Morph',
    open: true,
    controls: [
      {
        kind: 'slider',
        path: 'transition.speed',
        label: 'Transition speed',
        min: 0.002,
        max: 0.12,
        step: 0.002,
        format: (v) => v.toFixed(3),
      },
      {
        kind: 'select',
        path: 'transition.assign',
        label: 'Target assignment',
        choices: ['angular', 'index', 'random'],
      },
      {
        kind: 'slider',
        path: 'major.follow',
        label: 'Follow (shaped)',
        min: 0.01,
        max: 0.4,
        step: 0.005,
        format: (v) => v.toFixed(3),
      },
      {
        kind: 'slider',
        path: 'major.followSpread',
        label: 'Follow (spread)',
        min: 0.002,
        max: 0.2,
        step: 0.002,
        format: (v) => v.toFixed(3),
      },
      {
        kind: 'slider',
        path: 'major.damping',
        label: 'Damping',
        min: 0.6,
        max: 1,
        step: 0.005,
        format: (v) => v.toFixed(3),
      },
    ],
  },
  {
    name: 'Motion',
    controls: [
      {
        kind: 'slider',
        path: 'jelly.intensity',
        label: 'Wobble',
        min: 0,
        max: 12,
        step: 0.1,
        format: (v) => v.toFixed(1),
      },
      {
        kind: 'slider',
        path: 'jelly.speed',
        label: 'Wobble speed',
        min: 0,
        max: 6,
        step: 0.05,
        format: (v) => v.toFixed(2),
      },
      {
        kind: 'slider',
        path: 'spread.breathe',
        label: 'Breathe',
        min: 0,
        max: 2,
        step: 0.05,
        format: (v) => v.toFixed(2),
      },
      {
        kind: 'slider',
        path: 'spread.zoom',
        label: 'Spread zoom',
        min: 0.6,
        max: 2.4,
        step: 0.05,
        format: (v) => v.toFixed(2),
      },
      {
        kind: 'slider',
        path: 'spread.drift',
        label: 'Spread drift',
        min: 0,
        max: 0.2,
        step: 0.005,
        format: (v) => v.toFixed(3),
      },
      {
        kind: 'slider',
        path: 'spread.radius',
        label: 'Spread radius',
        min: 0.2,
        max: 1.2,
        step: 0.02,
        format: (v) => v.toFixed(2),
      },
    ],
  },
  {
    name: 'Ambient layer',
    controls: [
      {
        kind: 'slider',
        path: 'minor.size',
        label: 'Size',
        min: 0.5,
        max: 12,
        step: 0.1,
        format: (v) => v.toFixed(1),
      },
      {
        kind: 'slider',
        path: 'minor.speed',
        label: 'Speed',
        min: 0,
        max: 3,
        step: 0.05,
        format: (v) => v.toFixed(2),
      },
      {
        kind: 'slider',
        path: 'minor.turbulence',
        label: 'Turbulence',
        min: 0,
        max: 2,
        step: 0.02,
        format: (v) => v.toFixed(2),
      },
      {
        kind: 'slider',
        path: 'minor.maxSpeed',
        label: 'Max speed',
        min: 0.02,
        max: 2,
        step: 0.02,
        format: (v) => v.toFixed(2),
      },
    ],
  },
  {
    name: 'Emission',
    controls: [
      { kind: 'toggle', path: 'emission.enabled', label: 'Enabled' },
      { kind: 'slider', path: 'emission.max', label: 'Max sparks', min: 0, max: 600, step: 10 },
      {
        kind: 'slider',
        path: 'emission.rate',
        label: 'Rate',
        min: 0,
        max: 0.2,
        step: 0.002,
        format: (v) => v.toFixed(3),
      },
      { kind: 'slider', path: 'emission.lifespan', label: 'Lifespan', min: 10, max: 300, step: 5 },
      {
        kind: 'slider',
        path: 'emission.speed',
        label: 'Speed',
        min: 0.1,
        max: 4,
        step: 0.05,
        format: (v) => v.toFixed(2),
      },
    ],
  },
  {
    name: 'Pointer',
    controls: [
      { kind: 'toggle', path: 'pointer.enabled', label: 'Enabled' },
      { kind: 'toggle', path: 'pointer.shockwave', label: 'Shockwave on click' },
      { kind: 'slider', path: 'pointer.radius', label: 'Radius', min: 20, max: 500, step: 5 },
      {
        kind: 'slider',
        path: 'pointer.force',
        label: 'Force',
        min: 0,
        max: 80,
        step: 0.5,
        format: (v) => v.toFixed(1),
      },
      {
        kind: 'slider',
        path: 'pointer.shockwaveForce',
        label: 'Wave force',
        min: 0,
        max: 80,
        step: 0.5,
        format: (v) => v.toFixed(1),
      },
    ],
  },
  {
    name: 'Performance',
    controls: [
      { kind: 'toggle', path: 'adaptiveQuality', label: 'Adaptive quality' },
      { kind: 'toggle', path: 'autoPause', label: 'Pause when hidden' },
      { kind: 'slider', path: 'maxFps', label: 'FPS cap (0 = off)', min: 0, max: 144, step: 1 },
      {
        kind: 'slider',
        path: 'maxDpr',
        label: 'Max DPR',
        min: 1,
        max: 3,
        step: 0.25,
        format: (v) => v.toFixed(2),
      },
    ],
  },
];
