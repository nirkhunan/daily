// The series frame: one layout for all 30 maps, 1080 × 1350 (Instagram 4:5).
//
//   30 DAY MAP CHALLENGE ............................ NEW YORK · NOVEMBER 2026
//   ─────────────────────────────────────────────────────────────────────────
//   [ map ]
//   ─────────────────────────────────────────────────────────────────────────
//   01   POINTS
//        Every street tree
//        A sentence or two on what you are looking at.
//   Data: … ............................................ nirkhunan.github.io/daily

import { alpha } from './palettes.js';

export const W = 1080, H = 1350;
export const MAP = { x: 56, y: 112, w: 968, h: 900 };

const SANS = '"Instrument Sans", sans-serif';
const SERIF = '"Instrument Serif", serif';

function wrap(ctx, text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function fit(ctx, text, weight, family, size, maxW, s) {
  do { ctx.font = `${weight} ${size * s}px ${family}`; size -= 2; }
  while (ctx.measureText(text).width > maxW * s && size > 20);
}

// Draws the frame for one day and returns the map area in canvas pixels.
export function frame(ctx, w, meta, p) {
  const s = w / W;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W * s, H * s);
  ctx.fillStyle = p.ink;
  ctx.textBaseline = 'alphabetic';

  // Top line.
  ctx.font = `600 ${14 * s}px ${SANS}`;
  ctx.letterSpacing = `${2.2 * s}px`;
  ctx.textAlign = 'left';
  ctx.fillText('30 DAY MAP CHALLENGE', 56 * s, 70 * s);
  ctx.textAlign = 'right';
  ctx.fillText('NEW YORK  ·  NOVEMBER 2026', 1024 * s, 70 * s);

  // Rules above and below the map.
  ctx.fillStyle = alpha(p.ink, 0.25);
  ctx.fillRect(56 * s, 88 * s, 968 * s, s);
  ctx.fillRect(56 * s, 1036 * s, 968 * s, s);

  // Title block.
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
  ctx.font = `${176 * s}px ${SERIF}`;
  ctx.fillText(String(meta.day).padStart(2, '0'), 48 * s, 1206 * s);

  const x = 300 * s, maxW = 724;
  ctx.font = `600 ${14 * s}px ${SANS}`;
  ctx.letterSpacing = `${2.2 * s}px`;
  ctx.fillStyle = p.mid;
  ctx.fillText(meta.theme.toUpperCase(), x, 1084 * s);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = p.ink;
  fit(ctx, meta.title, 400, SERIF, 56, maxW, s);
  ctx.fillText(meta.title, x, 1144 * s);
  ctx.font = `400 ${19 * s}px ${SANS}`;
  ctx.fillStyle = alpha(p.ink, 0.8);
  wrap(ctx, meta.subtitle ?? '', maxW * s).slice(0, 3).forEach((l, i) => ctx.fillText(l, x, (1182 + i * 27) * s));

  // Bottom line.
  ctx.font = `500 ${13 * s}px ${SANS}`;
  ctx.fillStyle = alpha(p.ink, 0.6);
  ctx.fillText(meta.credit ?? '', 56 * s, 1306 * s);
  ctx.textAlign = 'right';
  ctx.fillText('nirkhunan.github.io/daily', 1024 * s, 1306 * s);
  ctx.textAlign = 'left';

  return { x: MAP.x * s, y: MAP.y * s, w: MAP.w * s, h: MAP.h * s, s };
}
