import { Stipple, defaultOptions, mergeOptions, shapeFromString } from 'stipple-gl';
import { presets } from 'stipple-gl/presets';
import type { ShapeConfig, StippleConfig, StippleOptions } from 'stipple-gl';

import { buildPanel, controlGroups } from './controls';
import { shapeNames, shapes } from './shapes';

const stage = document.getElementById('stage')!;
const panel = document.getElementById('panel')!;
const panelBody = document.getElementById('panel-body')!;
const statEl = document.getElementById('stat')!;
const dropVeil = document.getElementById('drop-veil')!;

const baseConfig: StippleConfig = {
  ...presets.morph,
  mode: 'background',
  count: 6000,
  minorCount: 320,
};

let config: StippleOptions = mergeOptions(defaultOptions, baseConfig);
let activeShape = 'shield';
let customShape: ShapeConfig | null = null;
let morphTarget = 1;

const instance = new Stipple(stage, config);

declare global {
  interface Window {
    stipple: Stipple;
  }
}

window.stipple = instance;

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

const applyShape = (name: string): void => {
  activeShape = name;
  customShape = null;

  if (name === 'none') {
    instance.setShape(null);
    instance.setMorph(0);
    return;
  }

  const source = shapes[name];
  if (!source) return;

  instance.setShape(shapeFromString(source, { scale: 0.62, position: { x: 0.5, y: 0.5 } }));
  instance.setMorph(morphTarget);
};

const applyCustomShape = (source: string, label: string): void => {
  try {
    const shape = shapeFromString(source, { scale: 0.62, position: { x: 0.5, y: 0.5 } });
    customShape = shape;
    activeShape = '';
    instance.setShape(shape);
    instance.setMorph(morphTarget);
    renderShapeChips();
    toast('Morphing into ' + label);
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
      const { easing, ...rest } = config.transition;
      void easing;
      output[key] = rest;
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

  if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
    toast('That is not an SVG file');
    return;
  }

  void file.text().then((source) => applyCustomShape(source, file.name));
});

let lastStat = 0;
const updateStat = (now: number): void => {
  requestAnimationFrame(updateStat);
  if (now - lastStat < 400) return;
  lastStat = now;

  const total = config.count + config.minorCount;
  statEl.textContent =
    total.toLocaleString() + ' particles  ·  ' + (instance.fps || 60) + ' fps  ·  cpu backend';
};

requestAnimationFrame(updateStat);
