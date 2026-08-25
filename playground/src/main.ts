import { Stipple, defaultOptions, mergeOptions, shapeFromFile, shapeFromString } from 'stipple-gl';
import { presets } from 'stipple-gl/presets';
import type { ShapeConfig, StippleConfig, StippleInstance, StippleOptions } from 'stipple-gl';
import { WorkerStipple } from 'stipple-gl/worker';

import { mirrorChoreography, resolveChoreography } from 'stipple-gl';
import { buildPanel, controlGroups } from './controls';
import { shapeNames, shapes } from './shapes';

const stage = document.getElementById('stage')!;
const panel = document.getElementById('panel')!;
const panelBody = document.getElementById('panel-body')!;
const statEl = document.getElementById('stat')!;
const dropVeil = document.getElementById('drop-veil')!;

// The panel binds to paths like transition.enter.speed, so the playground works
// in fully expanded choreographies rather than the shorthand names.
const baseConfig: StippleConfig = {
  ...presets.morph,
  mode: 'background',
  count: 6000,
  minorCount: 320,
  transition: {
    enter: resolveChoreography(presets.morph.transition?.enter),
    exit: mirrorChoreography(resolveChoreography(presets.morph.transition?.enter)),
    swap: resolveChoreography(
      presets.morph.transition?.swap === 'none' ? undefined : presets.morph.transition?.swap,
    ),
  },
};

let config: StippleOptions = mergeOptions(defaultOptions, baseConfig);
let activeShape = 'shield';
let customShape: ShapeConfig | null = null;
let morphTarget = 1;
let detail: 'uniform' | 'edges' | 'density' = 'uniform';
let detailStrength = 0.85;

const useWorker = new URLSearchParams(location.search).has('worker');

const instance: StippleInstance = useWorker
  ? new WorkerStipple(stage, {
      ...config,
      worker: new Worker(new URL('../../src/worker/thread.ts', import.meta.url), {
        type: 'module',
      }),
      onDroppedOptions: (keys: string[]) => {
        console.info('[stipple-gl] worker mode dropped non-serialisable options:', keys);
      },
    })
  : new Stipple(stage, config);

declare global {
  interface Window {
    stipple: StippleInstance;
    stippleMode: string;
  }
}

window.stipple = instance;
window.stippleMode = useWorker ? 'worker' : 'main';

const toast = (message: string): void => {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add('visible'));
  setTimeout(() => {
    node.classList.remove('visible');
    setTimeout(() => node.remove(), 300);
  }, 1900);
};

// Detail is a property of the shape, not a runtime option, so changing it means
// re-sampling. Kept here so every shape the playground builds picks it up.
const withDetail = (shape: ShapeConfig): ShapeConfig => ({ ...shape, detail, detailStrength });

const reapplyShape = (): void => {
  if (customShape) instance.setShape(withDetail(customShape));
  else if (activeShape && activeShape !== 'none') applyShape(activeShape);
};

const applyShape = (name: string): void => {
  activeShape = name;
  customShape = null;

  if (name === 'none') {
    // release() keeps the shape so the exit choreography has somewhere to
    // travel from. setShape(null) would clear it and skip the animation.
    void instance.release();
    return;
  }

  const source = shapes[name];
  if (!source) return;

  const shape = withDetail(shapeFromString(source, { scale: 0.62, position: { x: 0.5, y: 0.5 } }));
  if (morphTarget >= 1) {
    void instance.morphTo(shape);
  } else {
    instance.setShape(shape);
    void instance.setMorph(morphTarget);
  }
};

const applyCustomShape = async (file: File): Promise<void> => {
  try {
    const shape = withDetail(await shapeFromFile(file, { scale: 0.62, position: { x: 0.5, y: 0.5 } }));
    customShape = shape;
    activeShape = '';
    void instance.morphTo(shape);
    renderShapeChips();
    toast('Morphing into ' + file.name + (shape.image ? ' (rasterised)' : ' (vector)'));
  } catch (error) {
    toast((error as Error).message);
  }
};

const shapeSection = document.createElement('details');
shapeSection.className = 'group';
shapeSection.open = true;
const shapeSummary = document.createElement('summary');
shapeSummary.textContent = 'Shape';
const shapeBody = document.createElement('div');
shapeBody.className = 'group-body';
const shapeChips = document.createElement('div');
shapeChips.className = 'chips';
shapeBody.appendChild(shapeChips);

const morphRow = document.createElement('div');
morphRow.className = 'row';
morphRow.style.marginTop = '12px';
const morphLabel = document.createElement('label');
morphLabel.textContent = 'Morph';
const morphValue = document.createElement('span');
morphValue.className = 'value';
morphValue.textContent = '1.00';
const morphInput = document.createElement('input');
morphInput.type = 'range';
morphInput.min = '0';
morphInput.max = '1';
morphInput.step = '0.01';
morphInput.value = '1';
morphInput.addEventListener('input', () => {
  morphTarget = Number(morphInput.value);
  morphValue.textContent = morphTarget.toFixed(2);
  instance.setMorph(morphTarget);
});
morphRow.append(morphLabel, morphValue, morphInput);
shapeBody.appendChild(morphRow);

// Detail weighting. Flat-filled artwork spends most of its particles on
// featureless interior; this moves the budget to where the picture is.
const detailRow = document.createElement("div");
detailRow.className = "row";
const detailLabel = document.createElement("label");
detailLabel.textContent = "Detail";
const detailSelect = document.createElement("select");
for (const value of ["uniform", "edges", "density"]) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  detailSelect.appendChild(option);
}
detailSelect.addEventListener("change", () => {
  detail = detailSelect.value as typeof detail;
  reapplyShape();
});
detailRow.append(detailLabel, detailSelect);
shapeBody.appendChild(detailRow);

const strengthRow = document.createElement("div");
strengthRow.className = "row";
const strengthLabel = document.createElement("label");
strengthLabel.textContent = "Detail strength";
const strengthValue = document.createElement("span");
strengthValue.className = "value";
strengthValue.textContent = "0.85";
const strengthInput = document.createElement("input");
strengthInput.type = "range";
strengthInput.min = "0";
strengthInput.max = "1";
strengthInput.step = "0.05";
strengthInput.value = "0.85";
strengthInput.addEventListener("input", () => {
  detailStrength = Number(strengthInput.value);
  strengthValue.textContent = detailStrength.toFixed(2);
  reapplyShape();
});
strengthRow.append(strengthLabel, strengthValue, strengthInput);
shapeBody.appendChild(strengthRow);

shapeSection.append(shapeSummary, shapeBody);
panelBody.appendChild(shapeSection);

function renderShapeChips(): void {
  shapeChips.replaceChildren();

  for (const name of ['none', ...shapeNames]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (name === activeShape ? ' active' : '');
    chip.textContent = name;
    chip.addEventListener('click', () => {
      applyShape(name);
      renderShapeChips();
    });
    shapeChips.appendChild(chip);
  }

  if (customShape) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip active';
    chip.textContent = 'custom';
    shapeChips.appendChild(chip);
  }
}

renderShapeChips();

const presetSection = document.createElement('details');
presetSection.className = 'group';
presetSection.open = true;
const presetSummary = document.createElement('summary');
presetSummary.textContent = 'Preset';
const presetBody = document.createElement('div');
presetBody.className = 'group-body';
const presetChips = document.createElement('div');
presetChips.className = 'chips';

let activePreset = 'morph';

const applyPreset = (name: keyof typeof presets): void => {
  activePreset = name;
  config = mergeOptions(defaultOptions, { ...presets[name], mode: 'background' });
  instance.setOptions(config);
  instance.setCount(config.count, config.minorCount);
  panelHandle.sync(config);
  renderPresetChips();

  if (config.count === 0) {
    instance.setShape(null);
    activeShape = 'none';
    renderShapeChips();
    toast(name + ' is an ambient preset — it has no particles to form a shape');
  }
};

function renderPresetChips(): void {
  presetChips.replaceChildren();
  for (const name of Object.keys(presets) as Array<keyof typeof presets>) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (name === activePreset ? ' active' : '');
    chip.textContent = name;
    chip.addEventListener('click', () => applyPreset(name));
    presetChips.appendChild(chip);
  }
}

presetBody.appendChild(presetChips);
presetSection.append(presetSummary, presetBody);
panelBody.appendChild(presetSection);
renderPresetChips();

const panelHandle = buildPanel(panelBody, controlGroups, config, (patch, path, value) => {
  config = mergeOptions(config, patch);

  if (path === 'count' || path === 'minorCount') {
    instance.setCount(config.count, config.minorCount);
    if (activeShape && activeShape !== 'none') applyShape(activeShape);
    else if (customShape) instance.setShape(customShape);
    return;
  }

  instance.setOptions(patch as StippleConfig);
  void value;
});

applyShape('shield');

document.getElementById('toggle-panel')!.addEventListener('click', () => {
  panel.classList.toggle('collapsed');
});

document.getElementById('reset')!.addEventListener('click', () => {
  applyPreset('morph');
  applyShape('shield');
  morphInput.value = '1';
  morphTarget = 1;
  morphValue.textContent = '1.00';
  renderShapeChips();
  toast('Reset to defaults');
});

const serialisableKeys: Array<keyof StippleOptions> = [
  'count',
  'minorCount',
  'mode',
  'color',
  'blend',
  'opacity',
  'softness',
  'core',
  'maxFps',
  'maxDpr',
  'adaptiveQuality',
  'autoPause',
  'major',
  'minor',
  'emission',
  'assign',
  'transition',
  'spread',
  'jelly',
  'pointer',
];

document.getElementById('copy')!.addEventListener('click', () => {
  const output: Record<string, unknown> = {};
  for (const key of serialisableKeys) {
    const value = config[key];
    if (key === 'transition') {
      // Easing can be a function, which JSON cannot carry. Names survive.
      const slots = config.transition as unknown as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [slot, value] of Object.entries(slots)) {
        if (typeof value !== 'object' || value === null) {
          out[slot] = value;
          continue;
        }
        const { easing, ...rest } = value as Record<string, unknown>;
        out[slot] = typeof easing === 'function' ? rest : { ...rest, easing };
      }
      output[key] = out;
      continue;
    }
    output[key] = value;
  }

  const text = 'const config = ' + JSON.stringify(output, null, 2) + ';';
  void navigator.clipboard
    .writeText(text)
    .then(() => toast('Config copied to clipboard'))
    .catch(() => toast('Clipboard blocked by the browser'));
});

let dragDepth = 0;

window.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth++;
  dropVeil.classList.add('visible');
});

window.addEventListener('dragover', (event) => event.preventDefault());

window.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropVeil.classList.remove('visible');
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropVeil.classList.remove('visible');

  const file = event.dataTransfer?.files?.[0];
  if (!file) return;

  const isSVG = /.svg$/i.test(file.name) || /svg/i.test(file.type);
  if (!isSVG && !file.type.startsWith('image/')) {
    toast('Drop an SVG, PNG, JPEG, WebP, AVIF or GIF');
    return;
  }

  void applyCustomShape(file);
});

let lastStat = 0;
const updateStat = (now: number): void => {
  requestAnimationFrame(updateStat);
  if (now - lastStat < 400) return;
  lastStat = now;

  const total = config.count + config.minorCount;
  statEl.textContent =
    total.toLocaleString() + '  ·  ' + (instance.fps || 60) + ' fps  ·  ' +
    (useWorker ? 'worker thread' : 'main thread');
};

requestAnimationFrame(updateStat);
