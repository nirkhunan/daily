// Day 01 · Points — every living tree NYC Parks looks after, one dot each,
// coloured by species. Explore it down to a single tree, switch species on and
// off, see what grows in the neighbourhood on screen, and frame any view as a
// poster.

import { land } from '../kit/map.js';
import { alpha } from '../kit/palettes.js';

// One colour each for the 16 most common species; every other species is ink.
export const COLOURS = [
  '#E4572E', '#2340FF', '#17A398', '#F2A541', '#8E3B9E', '#3BB273', '#E15A97', '#4C6085',
  '#C1A13A', '#8A4F2A', '#38A3D1', '#9C3D54', '#6C8A3F', '#D97C2B', '#5E548E', '#2F7F6F',
];
const TOP = COLOURS.length;

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const fmt = n => n.toLocaleString('en-US');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const SIZES = ['Same size', 'Trunk width'];

// Tree radius in metres: a small crown, or one that grows with the trunk.
const radiusM = (dbh, size) => (size === SIZES[1] ? 1.2 + dbh * 0.11 : 2.5);

export default {
  day: 1,
  theme: 'Points',
  title: 'Every tree in New York',
  credit: 'Data: NYC Parks, Forestry Tree Points · NYC Planning, Borough Boundaries',

  async load() {
    const [meta, buf] = await Promise.all([
      fetch('data/trees.json').then(r => r.json()),
      fetch('data/trees.bin').then(r => r.arrayBuffer()),
    ]);
    const n = meta.count, dv = new DataView(buf), [x0, y0, x1, y1] = meta.bbox;
    const lon = new Float64Array(n), lat = new Float64Array(n);
    const sp = new Uint16Array(n), dbh = new Uint8Array(n), cond = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      lon[i] = x0 + (dv.getUint16(o, true) / 65535) * (x1 - x0);
      lat[i] = y0 + (dv.getUint16(o + 2, true) / 65535) * (y1 - y0);
      sp[i] = dv.getUint16(o + 4, true);
      dbh[i] = dv.getUint8(o + 6);
      cond[i] = dv.getUint8(o + 7);
    }
    return {
      meta, n, lon, lat, sp, dbh, cond,
      on: new Uint8Array(meta.species.length).fill(1),   // which species are switched on
      version: 0,                                        // bumps whenever `on` changes
      extent: null,                                      // [w, s, e, n] the poster frames, or null for the whole city
      bounds: null,                                      // what the explorer shows
    };
  },

  options: () => ({ size: { label: 'Dot size', values: SIZES, value: SIZES[0] } }),

  // Trees per species inside [w, s, e, n] (or citywide).
  counts(data, box) {
    const c = new Uint32Array(data.meta.species.length);
    let total = 0;
    for (let i = 0; i < data.n; i++) {
      if (box && (data.lon[i] < box[0] || data.lon[i] > box[2] || data.lat[i] < box[1] || data.lat[i] > box[3])) continue;
      c[data.sp[i]]++; total++;
    }
    return { c, total };
  },

  subtitle(data) {
    const { c, total } = this.counts(data, data.extent);
    let shown = 0, kinds = 0, top = 0;
    c.forEach((v, i) => { if (v) kinds++; if (data.on[i]) shown += v; if (v > c[top]) top = i; });
    const share = total ? Math.round((c[top] / total) * 100) : 0;
    const where = data.extent ? 'in this view' : 'that NYC Parks looks after';
    const lead = `${fmt(total)} living trees ${where}, ${kinds} species, one dot each.`;
    const most = `${cap(data.meta.species[top])} is the most common, ${share}% of them.`;
    const filt = shown < total ? ` Showing ${fmt(shown)}.` : '';
    return `${lead} ${most}${filt}`;
  },

  colour(i, p) {
    return i < TOP ? COLOURS[i] : alpha(p.ink, 0.45);
  },

  // Poster ------------------------------------------------------------------

  draw(ctx, v, { geo, data, opts, p }) {
    land(ctx, v, geo, p, { fill: 0.035, line: 0.18 });
    if (data.xyKey !== v.key) {
      data.xy = new Float32Array(data.n * 2);
      for (let i = 0; i < data.n; i++) {
        const [x, y] = v.xy(data.lon[i], data.lat[i]);
        data.xy[i * 2] = x; data.xy[i * 2 + 1] = y;
      }
      data.xyKey = v.key;
    }
    // Pixels per metre at this scale, so a zoomed-in poster shows real crowns.
    const [ax, ay] = v.xy(-73.95, 40.7), [bx, by] = v.xy(-73.95 + 0.0011838, 40.7);
    const ppm = Math.hypot(bx - ax, by - ay) / 100, min = 1.05 * v.s;
    const { xy, sp, dbh, on } = data;

    const dot = (i) => {
      const r = Math.max(min, radiusM(dbh[i], opts.size) * 2 * ppm);
      if (r <= min * 1.5) ctx.fillRect(xy[i * 2] - r / 2, xy[i * 2 + 1] - r / 2, r, r);
      else { ctx.beginPath(); ctx.arc(xy[i * 2], xy[i * 2 + 1], r / 2, 0, Math.PI * 2); ctx.fill(); }
    };
    ctx.fillStyle = alpha(p.ink, 0.3);
    for (let i = 0; i < data.n; i++) if (sp[i] >= TOP && on[sp[i]]) dot(i);
    for (let s = TOP - 1; s >= 0; s--) {
      if (!on[s]) continue;
      ctx.fillStyle = COLOURS[s];
      for (let i = 0; i < data.n; i++) if (sp[i] === s) dot(i);
    }
  },

  // Explorer ----------------------------------------------------------------

  layers(data, p, opts) {
    const key = `${data.version}|${p.name}|${opts.size}`;
    if (data.builtKey !== key) {
      let m = 0;
      for (let i = 0; i < data.n; i++) if (data.on[data.sp[i]]) m++;
      const pos = new Float32Array(m * 2), col = new Uint8Array(m * 4), rad = new Float32Array(m), ids = new Uint32Array(m);
      const ink = [...rgb(p.ink), 120], tops = COLOURS.map(c => [...rgb(c), 235]);
      for (let i = 0, j = 0; i < data.n; i++) {
        const s = data.sp[i];
        if (!data.on[s]) continue;
        pos[j * 2] = data.lon[i]; pos[j * 2 + 1] = data.lat[i];
        col.set(s < TOP ? tops[s] : ink, j * 4);
        rad[j] = radiusM(data.dbh[i], opts.size);
        ids[j++] = i;
      }
      data.built = { m, pos, col, rad, ids };
      data.builtKey = key;
    }
    const b = data.built;
    return [new deck.ScatterplotLayer({
      id: `trees-${key}`,
      data: { length: b.m, attributes: { getPosition: { value: b.pos, size: 2 }, getFillColor: { value: b.col, size: 4, normalized: true }, getRadius: { value: b.rad, size: 1 } } },
      radiusUnits: 'meters',
      radiusMinPixels: 0.7,
      radiusMaxPixels: 40,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 200],
    })];
  },

  tooltip(data) {
    return ({ index }) => {
      if (index < 0 || !data.built) return null;
      const i = data.built.ids[index], s = data.sp[i];
      return {
        html: `<b>${cap(data.meta.species[s])}</b><i>${data.meta.latin[s]}</i><span>${data.dbh[i]} in trunk · ${data.meta.conditions[data.cond[i]]} condition</span>`,
        className: 'tree-tip',
      };
    };
  },

  // The legend: every species in view, with its colour, count and an on/off switch.
  panel(el, data, api) {
    const p = () => api.palette();
    el.innerHTML = `
      <p class="inview"><b class="lv-total"></b> trees in view · <b class="lv-kinds"></b> species</p>
      <div class="chips">
        <button data-act="all">All</button><button data-act="none">None</button><button data-act="top">Top ${TOP}</button>
      </div>
      <input class="find" type="search" placeholder="Find a species">
      <ul class="species"></ul>`;
    const list = el.querySelector('.species'), find = el.querySelector('.find');
    let counts = null;

    const changed = () => { data.version++; api.changed(); render(); };
    el.querySelector('[data-act=all]').onclick = () => { data.on.fill(1); changed(); };
    el.querySelector('[data-act=none]').onclick = () => { data.on.fill(0); changed(); };
    el.querySelector('[data-act=top]').onclick = () => { data.on.fill(0); data.on.fill(1, 0, TOP); changed(); };
    find.oninput = () => render();

    function render() {
      counts = counts ?? this.counts(data, data.bounds);
      const q = find.value.trim().toLowerCase();
      const rows = [];
      counts.c.forEach((v, s) => {
        const name = data.meta.species[s];
        if (q ? name.toLowerCase().includes(q) || data.meta.latin[s].toLowerCase().includes(q) : v > 0) rows.push(s);
      });
      rows.sort((a, b) => counts.c[b] - counts.c[a]);
      el.querySelector('.lv-total').textContent = fmt(counts.total);
      el.querySelector('.lv-kinds').textContent = counts.c.reduce((k, v) => k + (v > 0), 0);
      list.replaceChildren(...rows.slice(0, 200).map(s => {
        const li = document.createElement('li');
        li.className = data.on[s] ? '' : 'off';
        li.innerHTML = `<button class="sp" title="Switch on or off"><span class="dot" style="--c:${this.colour(s, p())}"></span><span class="name">${cap(data.meta.species[s])}</span><span class="n">${fmt(counts.c[s])}</span></button><button class="solo" title="Only this species">Only</button>`;
        li.querySelector('.sp').onclick = () => { data.on[s] = data.on[s] ? 0 : 1; changed(); };
        li.querySelector('.solo').onclick = () => { data.on.fill(0); data.on[s] = 1; changed(); };
        return li;
      }));
    }
    const self = this;
    render = render.bind(self);
    api.onView(() => { counts = self.counts(data, data.bounds); render(); });
    api.onPalette(() => render());
    render();
  },
};
