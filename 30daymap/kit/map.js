// Map helpers shared by every day: the borough shapes, a projection fitted to
// the map area (optionally turned to the Manhattan street grid), and the base
// land layer.

import { geoMercator, geoPath } from 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm';
import { alpha, mix } from './palettes.js';

export const MANHATTAN_GRID = 29;   // degrees the street grid is turned from true north

let cache = null;
export async function boroughs() {
  cache ??= fetch('data/boroughs.json').then(r => r.json());
  return cache;
}

// A projection that fits `geo` inside the map area. The returned view draws
// GeoJSON with view.path and turns lon/lat into canvas x/y with view.xy.
// view.key changes whenever the projection does, so days can cache projected data.
// `extent` ([west, south, east, north]) fits that area instead of all of `geo`.
export function view(ctx, rect, geo, { angle = 0, pad = 16, extent = null } = {}) {
  const p = pad * rect.s;
  const target = extent
    ? { type: 'MultiPoint', coordinates: [[extent[0], extent[1]], [extent[2], extent[3]], [extent[0], extent[3]], [extent[2], extent[1]]] }
    : geo;
  const proj = geoMercator().angle(angle)
    .fitExtent([[rect.x + p, rect.y + p], [rect.x + rect.w - p, rect.y + rect.h - p]], target);
  const key = [rect.x, rect.y, rect.w, rect.h, angle, extent ?? 'all'].join(':');
  return { proj, path: geoPath(proj, ctx), xy: (lon, lat) => proj([lon, lat]), rect, s: rect.s, key };
}

// Keep everything a day draws inside the map area.
export function clip(ctx, rect) {
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
}

// The five boroughs as land on the paper; water is the paper itself.
export function land(ctx, v, geo, p, { fill = 0.06, line = 0.22 } = {}) {
  ctx.beginPath();
  v.path(geo);
  ctx.fillStyle = mix(p.bg, p.ink, fill);
  ctx.fill();
  ctx.strokeStyle = alpha(p.ink, line);
  ctx.lineWidth = 0.75 * v.s;
  ctx.stroke();
}
