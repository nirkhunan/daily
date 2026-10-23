import { frame, W, H } from './kit/frame.js';
import { boroughs, view, clip, land, MANHATTAN_GRID } from './kit/map.js';
import { createExplorer } from './kit/explore.js';
import { PALETTES } from './kit/palettes.js';
import { DAYS } from './days/index.js';

const $ = s => document.querySelector(s);
const canvas = $('#map'), ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;

const params = new URLSearchParams(location.search);
const state = { day: +params.get('day') || 1, palette: 0, grid: false, opts: {}, mode: 'explore' };
const loaded = {};   // day number → { mod, data }

async function getDay(n) {
  if (!loaded[n]) {
    const mod = (await DAYS[n]()).default;
    loaded[n] = { mod, data: await mod.load() };
  }
  return loaded[n];
}
const current = () => loaded[state.day];
const palette = () => PALETTES[state.palette];

// Poster ------------------------------------------------------------------

// Draw one day, framed, at width w (1080 for the post, more for print).
async function render(c, w) {
  const { mod, data } = await getDay(state.day);
  const p = palette();
  const meta = { day: mod.day, theme: mod.theme, title: mod.title, credit: mod.credit, subtitle: mod.subtitle?.(data, state.opts) };
  const rect = frame(c, w, meta, p);
  const geo = await boroughs();
  const v = view(c, rect, geo, { angle: state.grid ? MANHATTAN_GRID : 0, extent: data.extent });
  c.save();
  clip(c, rect);
  mod.draw(c, v, { geo, data, opts: state.opts, p, kit: { land } });
  c.restore();
}

let drawing = null, again = false;
async function drawPoster() {
  if (state.mode !== 'poster') return;
  if (drawing) { again = true; return; }
  drawing = render(ctx, W);
  await drawing;
  drawing = null;
  if (again) { again = false; drawPoster(); }
}

// Explorer ----------------------------------------------------------------

let explorer = null;
const listeners = { view: [], palette: [] };

function refreshLayers() {
  const { mod, data } = current();
  if (!explorer || !mod.layers) return;
  explorer.overlay.setProps({ layers: mod.layers(data, palette(), state.opts), getTooltip: mod.tooltip?.(data) });
}

function startExplorer() {
  explorer = createExplorer($('#explore'), palette());
  const { map } = explorer;
  const at = location.hash.match(/^#@(-?[\d.]+),(-?[\d.]+),([\d.]+)/);
  if (at) map.jumpTo({ center: [+at[2], +at[1]], zoom: +at[3] });
  const moved = () => {
    current().data.bounds = explorer.bounds();
    listeners.view.forEach(f => f());
    const c = map.getCenter();
    history.replaceState(null, '', `${location.search}#@${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom().toFixed(2)}`);
  };
  map.on('moveend', moved);
  map.once('load', () => { refreshLayers(); moved(); });
}

// Controls ----------------------------------------------------------------

function changed() { refreshLayers(); drawPoster(); }

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  if (mode === 'explore') explorer?.resize();
  drawPoster();
}
document.querySelectorAll('#modes button').forEach(b => (b.onclick = () => setMode(b.dataset.mode)));

$('#frameView').onclick = () => {
  current().data.extent = explorer.bounds();
  setMode('poster');
};
$('#wholeCity').onclick = () => { current().data.extent = null; drawPoster(); };

async function buildOptions() {
  const { mod, data } = await getDay(state.day);
  const box = $('#options');
  box.replaceChildren();
  for (const [key, o] of Object.entries(mod.options?.(data) ?? {})) {
    state.opts[key] ??= o.value;
    const label = document.createElement('label');
    label.className = 'field';
    label.innerHTML = `<span>${o.label}</span>`;
    const sel = document.createElement('select');
    sel.append(...o.values.map(v => new Option(v, v)));
    sel.value = state.opts[key];
    sel.onchange = e => { state.opts[key] = e.target.value; changed(); };
    label.append(sel);
    box.append(label);
  }
  if (mod.panel) {
    mod.panel($('#legend'), data, {
      changed,
      palette,
      onView: f => listeners.view.push(f),
      onPalette: f => listeners.palette.push(f),
    });
  }
}

PALETTES.forEach((p, i) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.title = p.name; b.setAttribute('aria-label', p.name);
  b.style.background = `conic-gradient(${p.bg} 0 25%, ${p.ink} 0 50%, ${p.mid} 0 75%, ${p.alt} 0)`;
  b.onclick = () => {
    state.palette = i; syncSwatches();
    explorer?.setPalette(palette());
    listeners.palette.forEach(f => f());
    changed();
  };
  $('#swatches').append(b);
});
function syncSwatches() {
  document.querySelectorAll('.swatch').forEach((b, i) => b.classList.toggle('on', i === state.palette));
}

$('#grid').onchange = e => { state.grid = e.target.checked; drawPoster(); };

async function exportPNG(scale) {
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  await render(c.getContext('2d'), W * scale);
  const { mod } = current();
  c.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `30daymap-${String(mod.day).padStart(2, '0')}-${mod.theme.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${scale > 1 ? '@2x' : ''}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
$('#export1').onclick = () => exportPNG(1);
$('#export2').onclick = () => exportPNG(2);

// Start ------------------------------------------------------------------

syncSwatches();
setMode('explore');
await document.fonts.ready;
await Promise.all(['600 14px "Instrument Sans"', '400 19px "Instrument Sans"', '56px "Instrument Serif"'].map(f => document.fonts.load(f)));
await getDay(state.day);
await buildOptions();
startExplorer();
