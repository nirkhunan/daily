// Steps → cloth, exactly. Each step that plays is one row; each sound has its
// own column, ordered by pitch from the centre outward and mirrored:
//
//   hat clap snare | lead high … low | bass high … low | kick ‖ kick | bass … | lead … | snare clap hat
//
// so the cloth is the grid turned on its side and repeated as the loop plays.

import { render, PALETTES } from './render.js?v=6';
import { ROWS, BANDS } from './analyse.js';

export const STYLES = ['Block', 'Stitch', 'Dot', 'Topo', 'Bands', 'Knit', 'Halftone'];
// These four are drawn from a smooth field built from the notes, in the same
// layout as the marks, so they stay readable while looking woven, not plotted.
export const FIELD_STYLES = ['Topo', 'Bands', 'Knit', 'Halftone'];
export const VISIBLE = 32;            // rows on the cloth at once: two bars, square cells like the grid
const HALF = 16, COLS = HALF * 2;

// Grid row index → distance from the centre (0 = the two middle columns).
// Grid rows: 0 kick, 1 snare, 2 hat, 3 clap, 4–11 lead high→low, 12–15 bass high→low.
const OUTWARD = [0, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 1, 3, 2];
const RING = [];
OUTWARD.forEach((row, k) => (RING[row] = k));

const FREQ = { kick: 60, snare: 1800, clap: 1300, hat: 8000 };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;

const WEIGHT = { kick: 1, bass: 0.9, lead: 0.8, snare: 0.7, clap: 0.6, hat: 0.45 };

function boxBlur(f, rt, rb) {
  const t = new Float32Array(f.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < ROWS; r++) for (let b = 0; b < BANDS; b++) {
      let sum = 0, n = 0;
      for (let k = -rb; k <= rb; k++) { const bb = b + k; if (bb >= 0 && bb < BANDS) { sum += f[r * BANDS + bb]; n++; } }
      t[r * BANDS + b] = sum / n;
    }
    for (let r = 0; r < ROWS; r++) for (let b = 0; b < BANDS; b++) {
      let sum = 0, n = 0;
      for (let k = -rt; k <= rt; k++) { const rr = r + k; if (rr >= 0 && rr < ROWS) { sum += t[rr * BANDS + b]; n++; } }
      f[r * BANDS + b] = sum / n;
    }
  }
}

// The visible steps as a ROWS × BANDS field, band 0 at the centre, matching
// the mirrored columns of the marks: each sound fills its own band strip on
// the rows of the step it played in.
function noteField(steps, first, smooth, visible) {
  const f = new Float32Array(ROWS * BANDS);
  const perStep = ROWS / visible, perCol = BANDS / HALF;
  for (let i = first; i < steps.length; i++) {
    const r0 = Math.round((i - first) * perStep), r1 = Math.round((i - first + 1) * perStep);
    for (const hit of steps[i].hits) {
      const v = WEIGHT[hit.kind] * strength(hit, steps[i].cutoff), k = RING[hit.row];
      for (let r = r0; r < r1; r++) for (let b = k * perCol; b < (k + 1) * perCol; b++) f[r * BANDS + b] = Math.max(f[r * BANDS + b], v);
    }
  }
  if (smooth > 0) boxBlur(f, Math.round(1 + smooth * 1.5), Math.ceil(smooth / 2));
  let max = 0;
  for (const v of f) if (v > max) max = v;
  if (max > 0) for (let i = 0; i < f.length; i++) f[i] /= max;
  return f;
}

function colourFor(kind, p) {
  return kind === 'lead' ? p.mid : kind === 'bass' ? p.alt : p.ink;
}

// What the filter lets through: full strength below the cutoff, fading above it.
function strength(hit, cutoff) {
  const f = FREQ[hit.kind] ?? mtof(hit.midi);
  return Math.max(0.18, Math.min(1, cutoff / f));
}

function stitch(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.ellipse(x + w * 0.32, y + h * 0.5, w * 0.17, h * 0.46, -0.55, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.68, y + h * 0.5, w * 0.17, h * 0.46, 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function mark(ctx, style, hit, sound, x, y, w, h, s) {
  const pad = Math.min(w, h) * 0.14;
  const ix = x + pad, iy = y + pad, iw = w - pad * 2, ih = h - pad * 2;
  const cx = x + w / 2, cy = y + h / 2;

  if (style === 'Stitch') return stitch(ctx, x, y, w, h);

  if (style === 'Dot') {
    const r = (Math.min(w, h) / 2) * { kick: 0.95, bass: 0.85, lead: 0.75, snare: 0.7, clap: 0.6, hat: 0.4 }[hit.kind];
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    return;
  }

  // Block: every sound has its own glyph.
  switch (hit.kind) {
    case 'kick':
    case 'bass':
      ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 2 * s); ctx.fill();
      break;
    case 'snare': {
      const t = ih * 0.24;
      ctx.lineWidth = t;
      ctx.strokeRect(ix + t / 2, iy + t / 2, iw - t, ih - t);
      break;
    }
    case 'hat': {
      const d = ih * 0.42;
      ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
      break;
    }
    case 'clap':
      ctx.fillRect(x + w * 0.28, iy, w * 0.14, ih);
      ctx.fillRect(x + w * 0.58, iy, w * 0.14, ih);
      break;
    case 'lead':
      ctx.beginPath();
      if (sound === 'Saw') {          // a sawtooth wedge
        ctx.moveTo(ix, iy + ih); ctx.lineTo(ix + iw, iy); ctx.lineTo(ix + iw, iy + ih); ctx.closePath();
      } else if (sound === 'Bell') {  // a ringing circle
        ctx.ellipse(cx, cy, ih / 2, ih / 2, 0, 0, Math.PI * 2);
      } else {                        // pluck: a solid block
        ctx.roundRect(ix, iy, iw, ih, 2 * s);
      }
      ctx.fill();
      break;
  }
}

export function renderScore(ctx, W, H, steps, opts) {
  const s = W / 1200, p = PALETTES[opts.palette];
  const visible = opts.visible ?? VISIBLE;
  const cw = W / COLS, rh = H / visible;
  const bg = hex(p.bg), ink = hex(p.ink);
  const first = Math.max(0, steps.length - visible);

  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);

  if (FIELD_STYLES.includes(opts.style)) {
    if (steps.length) {
      const field = noteField(steps, first, opts.smooth, visible);
      render(ctx, W, H, field, { mode: opts.style, palette: opts.palette, detail: opts.detail, mirror: true, label: false });
    }
    keyMarks(ctx, W, s, p, steps, first, rh);
    edge(ctx, W, H, s, p, steps, first, rh, opts.weaving);
    return;
  }

  keyGround(ctx, W, s, p, steps, first, rh);

  // Warp threads, one per column.
  ctx.strokeStyle = p.ink; ctx.globalAlpha = 0.06; ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  for (let c = 0; c < COLS; c++) { const x = (c + 0.5) * cw; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // In Stitch, every cell is knitted, so the empty ones form the ground fabric.
  if (opts.style === 'Stitch') {
    ctx.fillStyle = css(mix(bg, ink, 0.07));
    const rows = Math.min(visible, steps.length);
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) stitch(ctx, c * cw, r * rh, cw, rh);
  }

  for (let i = first; i < steps.length; i++) {
    const step = steps[i], y = (i - first) * rh;

    // A faint line where each bar (one pass of the loop) begins.
    if (opts.barLines !== false && i % 16 === 0 && i > 0) {
      ctx.fillStyle = p.ink; ctx.globalAlpha = 0.14;
      ctx.fillRect(0, y - 0.75 * s, W, 1.5 * s);
      ctx.globalAlpha = 1;
    }

    // Swing delays every second step, so those rows are pushed outward a little.
    const dx = step.step % 2 && step.swing ? step.swing * cw * 0.6 : 0;
    for (const hit of step.hits) {
      const k = RING[hit.row];
      ctx.fillStyle = ctx.strokeStyle = colourFor(hit.kind, p);
      ctx.globalAlpha = strength(hit, step.cutoff);
      mark(ctx, opts.style, hit, step.sound, (HALF - 1 - k) * cw - dx, y, cw, rh, s);
      mark(ctx, opts.style, hit, step.sound, (HALF + k) * cw + dx, y, cw, rh, s);
    }
    ctx.globalAlpha = 1;
  }

  keyMarks(ctx, W, s, p, steps, first, rh);
  edge(ctx, W, H, s, p, steps, first, rh, opts.weaving);
}

// The key, woven in without words: every key gives its rows a slightly
// different ground, and a seam in the lead colour marks each change.
function keyGround(ctx, W, s, p, steps, first, rh) {
  const bg = hex(p.bg), ink = hex(p.ink);
  for (let i = first; i < steps.length; i++) {
    ctx.fillStyle = css(mix(bg, ink, (steps[i].key / 11) * 0.09));
    ctx.fillRect(0, (i - first) * rh, W, rh + 0.5);
  }
}

function keyMarks(ctx, W, s, p, steps, first, rh) {
  ctx.fillStyle = p.mid;
  for (let i = Math.max(first, 1); i < steps.length; i++) {
    if (steps[i - 1].key !== steps[i].key) ctx.fillRect(0, (i - first) * rh - 2 * s, W, 4 * s);
  }
}

// The weaving edge, just under the newest row.
function edge(ctx, W, H, s, p, steps, first, rh, weaving) {
  if (!weaving || !steps.length) return;
  const y = (steps.length - first) * rh;
  ctx.fillStyle = p.mid;
  ctx.fillRect(0, Math.min(y, H - 2 * s) - 1.5 * s, W, 3 * s);
}
