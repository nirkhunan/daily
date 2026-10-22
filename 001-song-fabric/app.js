import { label, PALETTES } from './render.js?v=6';
import { renderScore, STYLES, FIELD_STYLES } from './score.js?v=16';
import { Sequencer, SOUNDS, PRESETS } from './seq.js?v=19';
import { Pad } from './pad.js?v=19';

const W = 1200, H = 1200, EXPORT_SCALE = 2;   // square, the same shape as the grid

const $ = s => document.querySelector(s);
const art = $('#art'), actx = art.getContext('2d');
art.width = W; art.height = H;

const state = { style: 'Block', palette: 0, detail: 12, smooth: 2, label: false };

// The cloth is drawn note for note from the steps that played.
let steps = [];

const trackName = () => $('#trackName').value.trim() || 'Untitled Loop';
const bars = () => Math.ceil(steps.length / 16);

function buttons(box, items, onPick) {
  items.forEach(v => {
    const b = document.createElement('button');
    b.textContent = v; b.dataset.v = v;
    b.onclick = () => onPick(v);
    box.append(b);
  });
}
const mark = (box, v) => box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));

// The board -----------------------------------------------------------------

function drawBoard(ctx, w, h) {
  const s = w / 1200, p = PALETTES[state.palette];
  renderScore(ctx, w, h, steps, { ...state, weaving: seq.playing });

  if (!steps.length) {
    ctx.fillStyle = p.ink; ctx.textAlign = 'center';
    ctx.font = `${64 * s}px "Instrument Serif", serif`;
    ctx.fillText('Press play.', w / 2, h / 2);
    ctx.textAlign = 'left';
  } else if (state.label) {
    label(ctx, w, h, s, p, { name: trackName(), detail: `${bars()} bars  ·  ${steps.length} steps  ·  ${seq.bpm} bpm` }, state.style);
  }
}

let pending = false;
function draw() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; drawBoard(actx, W, H); status(); });
}

function status() {
  $('#status').textContent =
    seq.playing ? `Bar ${bars() || 1} · step ${(steps.length % 16) || 16}`
    : steps.length ? `Paused · ${bars()} bars woven`
    : '';
}

// Make ---------------------------------------------------------------------

const seq = new Sequencer($('#seq'));
seq.onStep = step => { steps.push(step); draw(); };
seq.onChange = () => saveLink();

buttons($('#presets'), PRESETS, v => seq.preset(v));
buttons($('#sounds'), SOUNDS, v => { seq.sound = v; syncMake(); });
$('#tempo').oninput = e => { seq.bpm = +e.target.value; syncMake(); };
$('#swing').oninput = e => { seq.swing = +e.target.value / 100; syncMake(); };
$('#filter').oninput = e => { seq.setFilter(+e.target.value / 100); syncMake(); };
$('#trackName').oninput = () => { draw(); saveLink(); };

// Drag the pad: across for key, up and down for filter.
const pad = new Pad($('#pad'), (key, filter) => {
  if (key !== seq.key) seq.setKey(key);
  seq.setFilter(filter);
  syncMake();
});

function syncMake() {
  mark($('#sounds'), seq.sound);
  $('#filter').value = Math.round(seq.cutoff * 100);
  pad.show(seq.key, seq.cutoff);
  $('#tempoVal').textContent = `${seq.bpm} bpm`;
  $('#swingVal').textContent = `${Math.round(seq.swing * 100)}%`;
  saveLink();
}

$('#seqPlay').onclick = () => {
  if (seq.playing) { seq.stop(); $('#seqPlay').textContent = 'Play'; }
  else { seq.play(); $('#seqPlay').textContent = 'Pause'; }
  draw();
};

// Start over clears both sides: the grid and the cloth (and the recording).
// For a few seconds afterwards the button offers to undo it, bringing back
// the grid and the cloth (the recording stays cleared).
let undo = null, undoTimer = 0;

function endUndo() {
  undo = null;
  clearTimeout(undoTimer);
  $('#restart').textContent = 'Start over';
}

$('#restart').onclick = () => {
  if (undo) {
    seq.load(undo.loop);
    steps = undo.steps;
    endUndo();
    draw();
    return;
  }
  undo = { loop: seq.save(), steps };
  seq.preset('Clear');
  seq.newCloth();
  steps = [];
  $('#restart').textContent = 'Undo';
  undoTimer = setTimeout(endUndo, 6000);
  draw();
};

// Space plays and pauses, unless you are typing.
addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.target.closest('input, select, textarea')) return;
  e.preventDefault();
  if (e.target instanceof HTMLButtonElement) e.target.blur();
  $('#seqPlay').click();
});

$('#download').onclick = async () => {
  const blob = await seq.tape();
  if (!blob || !blob.size) { $('#status').textContent = 'Nothing recorded yet. Press play first.'; return; }
  save(blob, `${trackName()}.webm`);
};

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Weave --------------------------------------------------------------------

buttons($('#modes'), STYLES, v => { state.style = v; sync(); draw(); });

PALETTES.forEach((p, i) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.title = p.name; b.setAttribute('aria-label', p.name); b.dataset.v = i;
  b.style.background = `conic-gradient(${p.bg} 0 25%, ${p.ink} 0 50%, ${p.mid} 0 75%, ${p.alt} 0)`;
  b.onclick = () => { state.palette = i; sync(); draw(); };
  $('#swatches').append(b);
});

$('#detail').oninput = e => { state.detail = +e.target.value; sync(); draw(); };
$('#smooth').oninput = e => { state.smooth = +e.target.value; sync(); draw(); };
$('#label').onchange = e => { state.label = e.target.checked; draw(); };

function sync() {
  mark($('#modes'), state.style);
  mark($('#swatches'), state.palette);
  $('#shapeCtl').hidden = !FIELD_STYLES.includes(state.style);
  const p = PALETTES[state.palette];
  $('#paletteName').textContent = p.name;
  $('#detailVal').textContent = state.detail;
  $('#smoothVal').textContent = state.smooth;

  // The grid wears the same colourway as the cloth.
  const root = document.documentElement.style;
  for (const k of ['bg', 'ink', 'mid', 'alt']) root.setProperty(`--c-${k}`, p[k]);
  saveLink();
}

// Share link: the whole loop and its look live in the address, so a copied
// link opens exactly this loop for anyone.
let linkTimer = 0, loading = false;
function saveLink() {
  if (loading) return;
  clearTimeout(linkTimer);
  linkTimer = setTimeout(() => {
    const d = { ...seq.save(), y: STYLES.indexOf(state.style), p: state.palette, d: state.detail, o: state.smooth, n: trackName() };
    history.replaceState(null, '', `#${new URLSearchParams(d)}`);
  }, 200);
}

function loadLink() {
  if (!location.hash) return;
  const q = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  const num = k => (q[k] === undefined || q[k] === '' ? undefined : Number(q[k]));
  loading = true;
  seq.load({ g: q.g, m: q.m, t: num('t'), w: num('w'), k: num('k'), s: num('s'), f: num('f') });
  if (STYLES[num('y')]) state.style = STYLES[num('y')];
  if (PALETTES[num('p')]) state.palette = num('p');
  if (num('d') >= 4 && num('d') <= 24) state.detail = num('d');
  if (num('o') >= 0 && num('o') <= 6) state.smooth = num('o');
  if (q.n) $('#trackName').value = q.n.slice(0, 40);
  $('#tempo').value = seq.bpm;
  $('#swing').value = Math.round(seq.swing * 100);
  $('#detail').value = state.detail;
  $('#smooth').value = state.smooth;
  loading = false;
}

$('#share').onclick = async () => {
  clearTimeout(linkTimer);
  const d = { ...seq.save(), y: STYLES.indexOf(state.style), p: state.palette, d: state.detail, o: state.smooth, n: trackName() };
  history.replaceState(null, '', `#${new URLSearchParams(d)}`);
  try {
    await navigator.clipboard.writeText(location.href);
    $('#status').textContent = 'Link copied. Anyone who opens it gets this loop.';
  } catch {
    $('#status').textContent = 'Copy the address bar to share this loop.';
  }
};

$('#export').onclick = () => {
  const c = document.createElement('canvas');
  c.width = W * EXPORT_SCALE; c.height = H * EXPORT_SCALE;
  drawBoard(c.getContext('2d'), c.width, c.height);
  c.toBlob(b => save(b, `song-fabric-${trackName()}-${state.style}.png`));
};

// Repeat tile: one bar is the repeat. Three bars are drawn and the middle one
// is kept, so the edges meet seamlessly when the tile is repeated.
$('#tile').onclick = () => {
  const bar = seq.bar(), w = W * EXPORT_SCALE, h = (w / 32) * 16;
  const big = document.createElement('canvas');
  big.width = w; big.height = h * 3;
  renderScore(big.getContext('2d'), w, h * 3, [...bar, ...bar, ...bar], { ...state, visible: 48, barLines: false, weaving: false });
  const tile = document.createElement('canvas');
  tile.width = w; tile.height = h;
  tile.getContext('2d').drawImage(big, 0, h, w, h, 0, 0, w, h);
  tile.toBlob(b => save(b, `song-fabric-${trackName()}-${state.style}-tile.png`));
};

// Clip: a video of the cloth weaving, with the music, up to 30 seconds.
let clip = null;
$('#clip').onclick = () => {
  if (clip) return clip.rec.stop();
  seq.audio();
  if (!seq.playing) $('#seqPlay').click();
  // The cloth is copied into a 1080 × 1080 frame (Instagram's square) and
  // frames are pushed by hand at 30 fps, so the clip keeps an even frame rate
  // even though the cloth only changes on each step.
  const film = document.createElement('canvas');
  film.width = film.height = 1080;
  const fctx = film.getContext('2d');
  const video = film.captureStream(0);
  const frame = video.getVideoTracks()[0];
  const stream = new MediaStream([...video.getVideoTracks(), ...seq.dest.stream.getAudioTracks()]);
  const type = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { ...(type && { mimeType: type }), videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const ext = rec.mimeType.includes('mp4') ? 'mp4' : 'webm';
    save(new Blob(chunks, { type: rec.mimeType }), `song-fabric-${trackName()}.${ext}`);
    video.getVideoTracks().forEach(t => t.stop());
    clearTimeout(clip.timer);
    clearInterval(clip.ticker);
    clip = null;
    $('#clip').textContent = 'Record clip';
    $('#clip').classList.remove('on');
  };
  rec.start(1000);
  clip = {
    rec,
    timer: setTimeout(() => rec.state !== 'inactive' && rec.stop(), 30000),
    ticker: setInterval(() => { fctx.drawImage(art, 0, 0, 1080, 1080); frame.requestFrame(); }, 1000 / 30),
  };
  $('#clip').textContent = 'Stop clip';
  $('#clip').classList.add('on');
};

// Start ------------------------------------------------------------------

loadLink();
sync();
syncMake();
await document.fonts.ready;
await document.fonts.load('30px "Instrument Serif"');
draw();
