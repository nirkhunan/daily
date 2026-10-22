// Field → pattern. Every mode reads the same field; the width of the cloth is
// frequency (bass in the centre when mirrored), the length is the song.

import { ROWS, BANDS } from './analyse.js';

export const PALETTES = [
  // ink = drums, mid = lead, alt = bass (on the grid and in the cloth alike)
  { name: 'Track',  bg: '#EFEBE3', mid: '#FF5A1F', ink: '#161616', alt: '#2340FF' },
  { name: 'Night',  bg: '#0D0F12', mid: '#C8F03C', ink: '#E6E9EC', alt: '#8B6CFF' },
  { name: 'Clay',   bg: '#E8DCCB', mid: '#B4532E', ink: '#2A211C', alt: '#5E7A5A' },
  { name: 'Cobalt', bg: '#E9EEF2', mid: '#2340FF', ink: '#0F1A3A', alt: '#FF8A3D' },
  { name: 'Rose',   bg: '#F3E6E4', mid: '#E0457B', ink: '#2B1B24', alt: '#3B6E8F' },
  { name: 'Mono',   bg: '#F4F4F2', mid: '#8A8A86', ink: '#111111', alt: '#4A4A47' },
];

export const MODES = ['Topo', 'Bands', 'Knit', 'Halftone'];

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;

function sampler(field, mirror) {
  return (px, py, W, H) => {
    const u = mirror ? Math.abs((px / W) * 2 - 1) : px / W;
    const x = u * (BANDS - 1), y = (py / H) * (ROWS - 1);
    const x0 = x | 0, y0 = y | 0;
    const x1 = Math.min(x0 + 1, BANDS - 1), y1 = Math.min(y0 + 1, ROWS - 1);
    const fx = x - x0, fy = y - y0;
    const a = field[y0 * BANDS + x0], b = field[y0 * BANDS + x1];
    const c = field[y1 * BANDS + x0], d = field[y1 * BANDS + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

function ramp(p, k) {
  const bg = hex(p.bg), mid = hex(p.mid), ink = hex(p.ink);
  return Array.from({ length: k }, (_, i) => {
    const t = k === 1 ? 0 : i / (k - 1);
    return t < 0.6 ? mix(bg, mid, t / 0.6) : mix(mid, ink, (t - 0.6) / 0.4);
  });
}

// Marching squares, one segment table entry per corner case (tl=8 tr=4 br=2 bl=1).
const CASES = {
  1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']],
  5: [['l', 't'], ['b', 'r']], 6: [['t', 'b']], 7: [['l', 't']], 8: [['l', 't']],
  9: [['t', 'b']], 10: [['l', 'b'], ['t', 'r']], 11: [['t', 'r']], 12: [['l', 'r']],
  13: [['b', 'r']], 14: [['l', 'b']],
};

function topo(ctx, W, H, s, sample, p, levels) {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  const gw = 220, gh = Math.round((gw * H) / W), cw = W / (gw - 1), ch = H / (gh - 1);
  const g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = sample(i * cw, j * ch, W, H);
  ctx.lineCap = 'round';
  for (let k = 1; k < levels; k++) {
    const t = k / levels, index = k % 4 === 0;
    ctx.beginPath();
    for (let j = 0; j < gh - 1; j++) {
      for (let i = 0; i < gw - 1; i++) {
        const a = g[j * gw + i], b = g[j * gw + i + 1], c = g[(j + 1) * gw + i + 1], d = g[(j + 1) * gw + i];
        const id = (a > t) << 3 | (b > t) << 2 | (c > t) << 1 | (d > t);
        const segs = CASES[id];
        if (!segs) continue;
        const x = i * cw, y = j * ch;
        const pt = e => e === 't' ? [x + cw * (t - a) / (b - a), y]
          : e === 'r' ? [x + cw, y + ch * (t - b) / (c - b)]
          : e === 'b' ? [x + cw * (t - d) / (c - d), y + ch]
          : [x, y + ch * (t - a) / (d - a)];
        for (const [e1, e2] of segs) {
          const [x1, y1] = pt(e1), [x2, y2] = pt(e2);
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        }
      }
    }
    ctx.strokeStyle = index ? p.mid : p.ink;
    ctx.globalAlpha = index ? 1 : 0.62;
    ctx.lineWidth = (index ? 2.4 : 1.1) * s;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function bands(ctx, W, H, s, sample, p, levels) {
  const img = ctx.createImageData(W, H), d = img.data, cols = ramp(p, levels);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = cols[Math.min(levels - 1, (sample(x, y, W, H) * levels) | 0)];
      const o = (y * W + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function knit(ctx, W, H, s, sample, p, levels) {
  const bg = hex(p.bg), ink = hex(p.ink);
  ctx.fillStyle = css(mix(bg, ink, 0.05)); ctx.fillRect(0, 0, W, H);
  const cols = Math.max(24, Math.round(20 + levels * 3)), cw = W / cols, chh = cw * 0.78;
  const rows = Math.ceil(H / chh);
  const yarn = [css(mix(bg, ink, 0.1)), p.mid, p.ink];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * cw, cy = (r + 0.5) * chh;
      const v = sample(cx, Math.min(cy, H - 1), W, H);
      ctx.fillStyle = yarn[v > 0.66 ? 2 : v > 0.38 ? 1 : 0];
      ctx.beginPath();
      ctx.ellipse(cx - cw * 0.2, cy, cw * 0.19, chh * 0.6, -0.5, 0, Math.PI * 2);
      ctx.ellipse(cx + cw * 0.2, cy, cw * 0.19, chh * 0.6, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function halftone(ctx, W, H, s, sample, p, levels) {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  const n = Math.round(30 + levels * 2), sp = W / n;
  for (let r = 0, y = sp / 2; y < H + sp; r++, y += sp * 0.866) {
    for (let x = (r % 2 ? sp : sp / 2); x < W + sp; x += sp) {
      const v = sample(Math.min(x, W - 1), Math.min(y, H - 1), W, H);
      const rad = Math.sqrt(v) * sp * 0.58;
      if (rad < 0.4 * s) continue;
      ctx.fillStyle = v > 0.82 ? p.mid : p.ink;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
  }
}

const DRAW = { Topo: topo, Bands: bands, Knit: knit, Halftone: halftone };

export function label(ctx, W, H, s, p, meta, mode) {
  const pad = 40 * s, bw = 330 * s, bh = 112 * s, x = pad, y = H - pad - bh;
  ctx.fillStyle = p.bg; ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = p.ink; ctx.lineWidth = 1.5 * s; ctx.strokeRect(x, y, bw, bh);
  ctx.fillStyle = p.ink; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${11 * s}px "Instrument Sans", sans-serif`;
  ctx.letterSpacing = `${1.6 * s}px`;
  ctx.fillText('SONG FABRIC  ·  NO. 001', x + 18 * s, y + 30 * s);
  ctx.letterSpacing = '0px';
  ctx.font = `${30 * s}px "Instrument Serif", serif`;
  let name = meta.name;
  while (ctx.measureText(name).width > bw - 36 * s && name.length > 4) name = name.slice(0, -2);
  if (name !== meta.name) name = name.trimEnd() + '…';
  ctx.fillText(name, x + 18 * s, y + 66 * s);
  ctx.font = `500 ${12 * s}px "Instrument Sans", sans-serif`;
  ctx.globalAlpha = 0.7;
  ctx.fillText(meta.detail ?? `${meta.length}  ·  ${BANDS} bands × ${ROWS} rows  ·  ${mode}`, x + 18 * s, y + 92 * s);
  ctx.globalAlpha = 1;
}

export function render(ctx, W, H, field, opts) {
  const s = W / 1200, p = PALETTES[opts.palette];
  const sample = sampler(field, opts.mirror);
  DRAW[opts.mode](ctx, W, H, s, sample, p, opts.detail);
  if (opts.label && opts.meta) label(ctx, W, H, s, p, opts.meta, opts.mode);
}
