// Day 01 · Points — every living tree NYC Parks looks after, one dot each,
// coloured by species. Explore it down to a single tree, pick a neighbourhood,
// switch species on and off, see what grows there, and frame any view or
// neighbourhood as a poster.

import { land } from '../kit/map.js';
import { alpha, mix } from '../kit/palettes.js';

// One colour each for the 16 most common species, drawn from a forest:
// leaf greens, mosses and teals, with autumn golds and bark browns so each
// species still stands apart. Every other species is ink.
export const COLOURS = [
  '#2F8F46', '#C9A227', '#0F6E6A', '#9BCB3C', '#B5562A', '#1F4D2E', '#6FB98F', '#7A8B2B',
  '#E0B94E', '#3E7CB1', '#8C5A3C', '#4FB286', '#D98E3B', '#5C3F2A', '#A9C47F', '#2C5E72',
];
const TOP = COLOURS.length;
const NONE = 65535;   // a tree outside every neighbourhood

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const fmt = n => n.toLocaleString('en-US');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const SIZES = ['Same size', 'Trunk width'];

// Tree radius in metres: a typical street-tree crown, or one that grows with the trunk.
const radiusM = (dbh, size) => (size === SIZES[1] ? 1.2 + dbh * 0.11 : 3.5);

function bboxOf(feature) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of feature.geometry.coordinates) for (const [x, y] of poly[0]) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return b;
}

export default {
  day: 1,
  theme: 'Points',
  short: 'Every tree',
  title: 'Every tree in New York',
  credit: 'Data: NYC Parks, Forestry Tree Points · NYC Planning, Neighborhood Tabulation Areas',

  async load() {
    const [meta, buf, ntaBuf, hoods] = await Promise.all([
      fetch('data/trees.json').then(r => r.json()),
      fetch('data/trees.bin').then(r => r.arrayBuffer()),
      fetch('data/trees-nta.bin').then(r => r.arrayBuffer()),
      fetch('data/neighborhoods.json').then(r => r.json()),
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
    hoods.features.forEach(f => (f.bbox = bboxOf(f)));
    return {
      meta, n, lon, lat, sp, dbh, cond,
      nta: new Uint16Array(ntaBuf),
      hoods: hoods.features,
      hood: null,                                        // index of the chosen neighbourhood, or null
      on: new Uint8Array(meta.species.length).fill(1),   // which species are switched on
      version: 0,                                        // bumps whenever `on` or `hood` changes
      extent: null,                                      // [w, s, e, n] the poster frames, or null for the whole city
      bounds: null,                                      // what the explorer shows
    };
  },

  options: () => ({ size: { label: 'Dot size', values: SIZES, value: SIZES[0] } }),

  // Trees per species in the chosen neighbourhood, else inside [w, s, e, n], else citywide.
  counts(data, box) {
    const c = new Uint32Array(data.meta.species.length);
    let total = 0;
    for (let i = 0; i < data.n; i++) {
      if (data.hood !== null) { if (data.nta[i] !== data.hood) continue; }
      else if (box && (data.lon[i] < box[0] || data.lon[i] > box[2] || data.lat[i] < box[1] || data.lat[i] > box[3])) continue;
      c[data.sp[i]]++; total++;
    }
    return { c, total };
  },

  // With a neighbourhood chosen, the poster fits that neighbourhood's own shape.
  focus(data) {
    return data.hood === null ? null : { geo: data.hoods[data.hood], id: data.hoods[data.hood].properties.code };
  },

  // The poster title names the neighbourhood when one is chosen.
  heading(data) {
    return data.hood === null ? this.title : `Every tree in ${this.hoodName(data)}`;
  },

  hoodName(data) {
    const f = data.hoods[data.hood];
    return f ? f.properties.name : null;
  },

  // Choose a neighbourhood (index) or clear it (null).
  select(data, k) {
    data.hood = k;
    data.version++;
    if (data.extent && k !== null) data.extent = data.hoods[k].bbox;
  },

  subtitle(data) {
    const { c, total } = this.counts(data, data.hood === null ? data.extent : null);
    let shown = 0, kinds = 0, top = 0;
    c.forEach((v, i) => { if (v) kinds++; if (data.on[i]) shown += v; if (v > c[top]) top = i; });
    const share = total ? Math.round((c[top] / total) * 100) : 0;
    const f = data.hoods[data.hood];
    const where = f ? `in ${f.properties.name}, ${f.properties.borough}` : data.extent ? 'in this view' : 'that NYC Parks looks after';
    const lead = `${fmt(total)} living trees ${where}, ${kinds} species.`;
    const most = `${cap(data.meta.species[top])} is the most common, ${share}% of them.`;
    const filt = shown < total ? ` Showing ${fmt(shown)}.` : '';
    return `${lead} ${most}${filt}`;
  },

  colour(i, p) {
    return i < TOP ? COLOURS[i] : alpha(p.ink, 0.45);
  },

  // Poster ------------------------------------------------------------------

  draw(ctx, v, { geo, data, opts, p }) {
    const hoodGeo = data.hood === null ? null : data.hoods[data.hood];
    if (hoodGeo) {
      // Only the neighbourhood: its ground, and nothing drawn outside it.
      ctx.beginPath();
      v.path(hoodGeo);
      ctx.fillStyle = mix(p.bg, p.ink, 0.05);
      ctx.fill();
      ctx.clip();
    } else {
      land(ctx, v, geo, p, { fill: 0.035, line: 0.18 });
    }
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
    const { xy, sp, dbh, on, nta, hood } = data;
    const inside = i => hood === null || nta[i] === hood;

    const dot = i => {
      const r = Math.max(min, radiusM(dbh[i], opts.size) * 2 * ppm);
      if (r <= min * 1.5) ctx.fillRect(xy[i * 2] - r / 2, xy[i * 2 + 1] - r / 2, r, r);
      else { ctx.beginPath(); ctx.arc(xy[i * 2], xy[i * 2 + 1], r / 2, 0, Math.PI * 2); ctx.fill(); }
    };
    ctx.fillStyle = alpha(p.ink, 0.3);
    for (let i = 0; i < data.n; i++) if (sp[i] >= TOP && on[sp[i]] && inside(i)) dot(i);
    for (let s = TOP - 1; s >= 0; s--) {
      if (!on[s]) continue;
      ctx.fillStyle = COLOURS[s];
      for (let i = 0; i < data.n; i++) if (sp[i] === s && inside(i)) dot(i);
    }
    if (hoodGeo) {
      // The edge, drawn after the clip is lifted so the full line shows.
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      v.path(hoodGeo);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.4 * v.s;
      ctx.stroke();
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
      const faded = [...rgb(p.ink), 28];
      for (let i = 0, j = 0; i < data.n; i++) {
        const s = data.sp[i];
        if (!data.on[s]) continue;
        pos[j * 2] = data.lon[i]; pos[j * 2 + 1] = data.lat[i];
        col.set(data.hood !== null && data.nta[i] !== data.hood ? faded : s < TOP ? tops[s] : ink, j * 4);
        rad[j] = radiusM(data.dbh[i], opts.size);
        ids[j++] = i;
      }
      data.built = { m, pos, col, rad, ids };
      data.builtKey = key;
    }
    const b = data.built, line = rgb(p.ink);
    return [
      // Every neighbourhood, faintly outlined; clicking one selects it.
      new deck.GeoJsonLayer({
        id: `hoods-${data.hood}-${p.name}`,
        data: { type: 'FeatureCollection', features: data.hoods },
        filled: true,
        stroked: true,
        getFillColor: [0, 0, 0, 1],   // invisible, but keeps every neighbourhood clickable
        getLineColor: (f) => (data.hoods.indexOf(f) === data.hood ? [...line, 230] : [...line, 50]),
        getLineWidth: (f) => (data.hoods.indexOf(f) === data.hood ? 2.5 : 0.8),
        lineWidthUnits: 'pixels',
        pickable: true,
      }),
      new deck.ScatterplotLayer({
        id: `trees-${key}`,
        data: { length: b.m, attributes: { getPosition: { value: b.pos, size: 2 }, getFillColor: { value: b.col, size: 4, normalized: true }, getRadius: { value: b.rad, size: 1 } } },
        radiusUnits: 'meters',
        radiusMinPixels: 1.3,
        radiusMaxPixels: 40,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 200],
      }),
    ];
  },

  tooltip(data) {
    return ({ index, layer, object }) => {
      if (!layer || index < 0) return null;
      if (layer.id.startsWith('hoods')) {
        return { html: `<b>${object.properties.name}</b><span>${object.properties.borough} · click to choose</span>`, className: 'tree-tip' };
      }
      const i = data.built.ids[index], s = data.sp[i], k = data.nta[i];
      const where = k === NONE ? '' : `<span>${data.hoods[k].properties.name}</span>`;
      return {
        html: `<b>${cap(data.meta.species[s])}</b><i>${data.meta.latin[s]}</i><span>${data.dbh[i]} in trunk · ${data.meta.conditions[data.cond[i]]} condition</span>${where}`,
        className: 'tree-tip',
      };
    };
  },

  // A click chooses the neighbourhood under it (on a tree, that tree's neighbourhood).
  click(data, info) {
    if (!info.layer || info.index < 0) return undefined;
    if (info.layer.id.startsWith('hoods')) return data.hoods.indexOf(info.object);
    const k = data.nta[data.built.ids[info.index]];
    return k === NONE ? undefined : k;
  },

  // The side panel: a neighbourhood picker, then every species there with its
  // colour, count and an on/off switch.
  panel(el, data, api) {
    const self = this;
    el.innerHTML = `
      <label class="field hood-field"><span>Neighbourhood</span>
        <div class="hood-row">
          <input class="hood" list="hood-list" placeholder="All of New York, or type a name">
          <button class="hood-clear" title="Back to all of New York">×</button>
        </div>
        <datalist id="hood-list">${data.hoods.map(f => `<option value="${f.properties.name}, ${f.properties.borough}">`).join('')}</datalist>
      </label>
      <h2 class="sp-title">Species</h2>
      <p class="inview"><b class="lv-total"></b> trees <span class="lv-where">in view</span> · <b class="lv-kinds"></b> species</p>
      <div class="chips">
        <button data-act="all">All</button><button data-act="none">None</button><button data-act="top">Top ${TOP}</button>
      </div>
      <input class="find" type="search" placeholder="Find a species">
      <ul class="species"></ul>`;
    const list = el.querySelector('.species'), find = el.querySelector('.find'), hood = el.querySelector('.hood');
    const labels = data.hoods.map(f => `${f.properties.name}, ${f.properties.borough}`);
    let counts = null;

    const recount = () => { counts = self.counts(data, data.bounds); render(); };
    const changed = () => { data.version++; api.changed(); render(); };
    el.querySelector('[data-act=all]').onclick = () => { data.on.fill(1); changed(); };
    el.querySelector('[data-act=none]').onclick = () => { data.on.fill(0); changed(); };
    el.querySelector('[data-act=top]').onclick = () => { data.on.fill(0); data.on.fill(1, 0, TOP); changed(); };
    find.oninput = () => render();
    hood.onchange = () => { const k = labels.indexOf(hood.value); if (k >= 0) api.selectHood(k); };
    el.querySelector('.hood-clear').onclick = () => api.selectHood(null);

    function render() {
      counts ??= self.counts(data, data.bounds);
      hood.value = data.hood === null ? '' : labels[data.hood];
      el.querySelector('.lv-where').textContent = data.hood === null ? 'in view' : `in ${self.hoodName(data)}`;
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
        li.innerHTML = `<button class="sp" title="Switch on or off"><span class="dot" style="--c:${self.colour(s, api.palette())}"></span><span class="name">${cap(data.meta.species[s])}</span><span class="n">${fmt(counts.c[s])}</span></button><button class="solo" title="Only this species">Only</button>`;
        li.querySelector('.sp').onclick = () => { data.on[s] = data.on[s] ? 0 : 1; changed(); };
        li.querySelector('.solo').onclick = () => { data.on.fill(0); data.on[s] = 1; changed(); };
        return li;
      }));
    }
    api.onView(recount);
    api.onPalette(render);
    api.onHood(recount);
    render();
  },
};
