// Day 02 · Lines — every bike route NYC DOT has built, one line each,
// coloured by the year it went in (or by the kind of lane). Scrub or play the
// timeline to watch the network grow from Ocean Parkway in 1894 to today, with
// retired lanes leaving as they were removed. Pick a neighbourhood, switch
// kinds on and off, and frame any view, year or neighbourhood as a poster.

import { land } from '../kit/map.js';
import { alpha, mix } from '../kit/palettes.js';

const FIRST = 1894, NOW = new Date().getFullYear();
const NONE = 65535;   // a segment outside every neighbourhood
const COLOUR_BY = ['Year built', 'Kind of lane'];

// One colour per kind, safest first: protected lanes in the series green.
export const KIND_COLOURS = ['#2F8F46', '#0F6E6A', '#B5D334', '#C9A227'];
// Line weight per kind, in poster pixels at whole-city scale.
const WEIGHT = [2.2, 1.9, 1.4, 1.0];

const rgb = h => {
  if (h.startsWith('rgb')) return h.match(/\d+/g).slice(0, 3).map(Number);
  return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
};
const fmt = n => n.toLocaleString('en-US');
const km = m => (m >= 10000 ? fmt(Math.round(m / 1000)) : (m / 1000).toFixed(1));

// The year ramp: old lanes dark, new ones bright. Nearly everything went in
// after 1970, so the ramp spreads 1970 to now and everything older is darkest.
const RAMP_FROM = 1970;
function rampAt(p, year) {
  const t = Math.min(1, Math.max(0, (year - RAMP_FROM) / (NOW - RAMP_FROM)));
  const dark = toHex(mix(p.ink, p.mid, 0.25));
  // The newest end is the colourway's bright green, held back a touch so it still reads on pale paper.
  const bright = toHex(mix(p.alt, p.mid, 0.2));
  return t < 0.5 ? mix(dark, p.mid, t * 2) : mix(p.mid, bright, (t - 0.5) * 2);
}
function toHex(c) { return `#${rgb(c).map(v => v.toString(16).padStart(2, '0')).join('')}`; }

function bboxOf(feature) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of feature.geometry.coordinates) for (const [x, y] of poly[0]) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return b;
}

// Does segment i exist in `year`?
const standing = (d, i, year) => d.built[i] <= year && (!d.retired[i] || d.retired[i] > year);

export default {
  day: 2,
  theme: 'Lines',
  short: 'Every bike lane',
  title: 'Every bike lane in New York',
  credit: 'Data: NYC DOT, New York City Bike Routes · NYC Planning, Neighborhood Tabulation Areas',

  async load() {
    const [meta, buf, hoods] = await Promise.all([
      fetch('data/bikes.json').then(r => r.json()),
      fetch('data/bikes.bin').then(r => r.arrayBuffer()),
      fetch('data/neighborhoods.json').then(r => r.json()),
    ]);
    const n = meta.count, dv = new DataView(buf), [x0, y0, x1, y1] = meta.bbox;
    // Points: every segment's lon/lat run back to back; start[i] is where segment i begins.
    const start = new Uint32Array(n + 1);
    let o = 0, total = 0;
    for (let i = 0; i < n; i++) { const c = dv.getUint16(o, true); start[i] = total; total += c; o += 2 + c * 4; }
    start[n] = total;
    const pts = new Float64Array(total * 2);
    o = 0;
    for (let i = 0, k = 0; i < n; i++) {
      const c = dv.getUint16(o, true); o += 2;
      for (let j = 0; j < c; j++, k++, o += 4) {
        pts[k * 2] = x0 + (dv.getUint16(o, true) / 65535) * (x1 - x0);
        pts[k * 2 + 1] = y0 + (dv.getUint16(o + 2, true) / 65535) * (y1 - y0);
      }
    }
    const col = (j) => Uint16Array.from(meta.segs, s => s[j]);
    hoods.features.forEach(f => (f.bbox = bboxOf(f)));
    return {
      meta, n, start, pts,
      street: col(0), from: col(1), to: col(2), kind: Uint8Array.from(meta.segs, s => s[3]),
      built: col(4), retired: col(5), nta: col(6), metres: Float32Array.from(meta.segs, s => s[7]),
      hoods: hoods.features,
      hood: null,
      on: new Uint8Array(meta.kinds.length).fill(1),  // which kinds are switched on
      year: NOW,                                      // the network as it stood at the end of this year
      version: 0,
      extent: null,
      bounds: null,
    };
  },

  options: () => ({ colourBy: { label: 'Colour by', values: COLOUR_BY, value: COLOUR_BY[0] } }),

  // Metres per kind standing in `year`, in the chosen neighbourhood, else inside [w, s, e, n], else citywide.
  counts(data, box, year = data.year) {
    const m = new Float64Array(data.meta.kinds.length);
    let protectedRecent = 0;
    for (let i = 0; i < data.n; i++) {
      if (!standing(data, i, year)) continue;
      if (data.hood !== null) { if (data.nta[i] !== data.hood) continue; }
      else if (box && !this.inBox(data, i, box)) continue;
      m[data.kind[i]] += data.metres[i];
      if (data.kind[i] === 0 && data.built[i] >= 2014) protectedRecent += data.metres[i];
    }
    return { m, total: m.reduce((a, b) => a + b, 0), protectedRecent };
  },

  inBox(data, i, b) {
    const k = data.start[i] * 2;   // its first point is enough to place it
    return data.pts[k] >= b[0] && data.pts[k] <= b[2] && data.pts[k + 1] >= b[1] && data.pts[k + 1] <= b[3];
  },

  focus(data) {
    return data.hood === null ? null : { geo: data.hoods[data.hood], id: data.hoods[data.hood].properties.code };
  },

  heading(data) {
    const where = data.hood === null ? 'New York' : this.hoodName(data);
    return `Every bike lane in ${where}${data.year < NOW ? `, ${data.year}` : ''}`;
  },

  hoodName(data) {
    const f = data.hoods[data.hood];
    return f ? f.properties.name : null;
  },

  select(data, k) {
    data.hood = k;
    data.version++;
    if (data.extent && k !== null) data.extent = data.hoods[k].bbox;
  },

  subtitle(data) {
    const { m, total, protectedRecent } = this.counts(data, data.hood === null ? data.extent : null);
    const f = data.hoods[data.hood];
    const where = f ? `in ${f.properties.name}, ${f.properties.borough}` : data.extent ? 'in this view' : 'across New York';
    const when = data.year < NOW ? ` at the end of ${data.year}` : '';
    if (!total) return `No bike routes ${where}${when}.`;
    const share = Math.round((m[0] / total) * 100);
    const lead = `${km(total)} km of streets and paths with a bike route ${where}${when}. ${share}% is protected from traffic.`;
    if (data.year >= NOW && m[0] > 0) {
      const recent = Math.round((protectedRecent / m[0]) * 100);
      return `${lead} ${recent}% of that protection went in after 2013.`;
    }
    return lead;
  },

  // The colour of segment i (as CSS), by year or by kind.
  colourOf(data, i, p, by) {
    return by === COLOUR_BY[1] ? KIND_COLOURS[data.kind[i]] : rampAt(p, data.built[i]);
  },

  // Poster ------------------------------------------------------------------

  draw(ctx, v, { geo, data, opts, p }) {
    const hoodGeo = data.hood === null ? null : data.hoods[data.hood];
    if (hoodGeo) {
      ctx.beginPath();
      v.path(hoodGeo);
      ctx.fillStyle = mix(p.bg, p.ink, 0.05);
      ctx.fill();
      ctx.clip();
    } else {
      land(ctx, v, geo, p, { fill: 0.035, line: 0.18 });
    }
    // Lines thicken as the poster zooms in, up to four times.
    const [ax, ay] = v.xy(-73.95, 40.7), [bx, by] = v.xy(-73.95 + 0.0011838, 40.7);
    const ppm = Math.hypot(bx - ax, by - ay) / 100;
    const zoom = Math.min(4, Math.max(1, ppm / 0.022 / v.s));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Oldest first, so the newest lanes sit on top; quiet kinds under loud ones.
    const order = [];
    for (let i = 0; i < data.n; i++) {
      if (!standing(data, i, data.year) || !data.on[data.kind[i]]) continue;
      if (hoodGeo && data.nta[i] !== data.hood) continue;
      order.push(i);
    }
    const byKind = opts.colourBy === COLOUR_BY[1];
    order.sort((a, b) => (byKind ? data.kind[b] - data.kind[a] : data.built[a] - data.built[b]));
    for (const i of order) {
      ctx.beginPath();
      for (let k = data.start[i]; k < data.start[i + 1]; k++) {
        const [x, y] = v.xy(data.pts[k * 2], data.pts[k * 2 + 1]);
        if (k === data.start[i]) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = this.colourOf(data, i, p, opts.colourBy);
      ctx.lineWidth = WEIGHT[data.kind[i]] * zoom * v.s;
      ctx.stroke();
    }
    if (hoodGeo) {
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
    // Colours, widths and on/off are rebuilt only when they change; the year
    // is a GPU filter, so scrubbing and playing the timeline costs nothing.
    const key = `${data.version}|${p.name}|${opts.colourBy}`;
    if (data.builtKey !== key) {
      const total = data.start[data.n];
      const col = new Uint8Array(total * 4), wid = new Float32Array(total), filt = new Float32Array(total * 3);
      const faded = [...rgb(p.ink), 30];
      const cache = new Map();
      for (let i = 0; i < data.n; i++) {
        const out = data.hood !== null && data.nta[i] !== data.hood;
        const css = this.colourOf(data, i, p, opts.colourBy);
        let c = cache.get(css);
        if (!c) { c = [...rgb(css), 235]; cache.set(css, c); }
        const w = WEIGHT[data.kind[i]] * 1.25;
        for (let k = data.start[i]; k < data.start[i + 1]; k++) {
          col.set(out ? faded : c, k * 4);
          wid[k] = w;
          filt[k * 3] = data.built[i];
          filt[k * 3 + 1] = data.retired[i] || 9999;
          filt[k * 3 + 2] = data.on[data.kind[i]];
        }
      }
      data.paths = { col, wid, filt };
      data.builtKey = key;
    }
    const line = rgb(p.ink), y = data.year;
    return [
      new deck.GeoJsonLayer({
        id: `hoods-${data.hood}-${p.name}`,
        data: { type: 'FeatureCollection', features: data.hoods },
        filled: true,
        stroked: true,
        getFillColor: [0, 0, 0, 1],
        getLineColor: (f) => (data.hoods.indexOf(f) === data.hood ? [...line, 230] : [...line, 50]),
        getLineWidth: (f) => (data.hoods.indexOf(f) === data.hood ? 2.5 : 0.8),
        lineWidthUnits: 'pixels',
        pickable: true,
      }),
      new deck.PathLayer({
        id: `lanes-${key}`,
        data: {
          length: data.n,
          startIndices: data.start,
          attributes: {
            getPath: { value: data.pts, size: 2 },
            getColor: { value: data.paths.col, size: 4, normalized: true },
            getWidth: { value: data.paths.wid, size: 1 },
            getFilterValue: { value: data.paths.filt, size: 3 },
          },
        },
        _pathType: 'open',
        positionFormat: 'XY',
        widthUnits: 'pixels',
        widthMinPixels: 1,
        capRounded: true,
        jointRounded: true,
        extensions: [new deck.DataFilterExtension({ filterSize: 3 })],
        filterRange: [[0, y], [y + 0.5, 10000], [0.5, 1.5]],
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 220],
      }),
    ];
  },

  tooltip(data) {
    const S = data.meta.streets;
    return ({ index, layer, object }) => {
      if (!layer || index < 0) return null;
      if (layer.id.startsWith('hoods')) {
        return { html: `<b>${object.properties.name}</b><span>${object.properties.borough} · click to choose</span>`, className: 'tree-tip' };
      }
      const i = index, k = data.nta[i];
      const between = S[data.from[i]] && S[data.to[i]] ? `<i>${S[data.from[i]]} to ${S[data.to[i]]}</i>` : '';
      const life = data.retired[i] ? `Built ${data.built[i]} · removed ${data.retired[i]}` : `Built ${data.built[i]}`;
      const where = k === NONE ? '' : `<span>${data.hoods[k].properties.name}</span>`;
      return {
        html: `<b>${S[data.street[i]] || 'Path'}</b>${between}<span>${data.meta.kinds[data.kind[i]]} · ${life} · ${fmt(Math.round(data.metres[i]))} m</span>${where}`,
        className: 'tree-tip',
      };
    };
  },

  click(data, info) {
    if (!info.layer || info.index < 0) return undefined;
    if (info.layer.id.startsWith('hoods')) return data.hoods.indexOf(info.object);
    const k = data.nta[info.index];
    return k === NONE ? undefined : k;
  },

  // The side panel: a neighbourhood picker, the timeline, and the four kinds
  // of lane with their length and an on/off switch.
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
      <section class="timeline">
        <div class="tl-head"><h2>Year</h2><button class="tl-play">Play</button></div>
        <p class="tl-year"></p>
        <canvas class="tl-bars" width="528" height="96"></canvas>
        <input class="tl-range" type="range" min="${FIRST}" max="${NOW}" step="1">
        <div class="tl-ends"><span>${FIRST}</span><span>${NOW}</span></div>
        <p class="tl-note">Kilometres built each year. Lanes leave the map in the year they were removed.</p>
      </section>
      <div class="ramp only-year"><span>${RAMP_FROM} or before</span><i></i><span>${NOW}</span></div>
      <h2 class="sp-title">Lanes</h2>
      <p class="inview"><b class="lv-total"></b> km <span class="lv-where">in view</span></p>
      <ul class="species kinds"></ul>`;
    const list = el.querySelector('.kinds'), hood = el.querySelector('.hood');
    const range = el.querySelector('.tl-range'), yearEl = el.querySelector('.tl-year'), bars = el.querySelector('.tl-bars');
    const play = el.querySelector('.tl-play'), ramp = el.querySelector('.ramp');
    const labels = data.hoods.map(f => `${f.properties.name}, ${f.properties.borough}`);
    let counts = null;

    // Kilometres built per year (every segment, including ones later removed).
    const perYear = new Float64Array(NOW - FIRST + 1);
    for (let i = 0; i < data.n; i++) if (data.built[i] >= FIRST) perYear[data.built[i] - FIRST] += data.metres[i];
    const peak = Math.max(...perYear);

    function drawBars() {
      const p = api.palette(), c = bars.getContext('2d'), w = bars.width, h = bars.height, bw = w / perYear.length;
      c.clearRect(0, 0, w, h);
      perYear.forEach((m, k) => {
        const yr = FIRST + k, bh = Math.max(m > 0 ? 2 : 0, Math.sqrt(m / peak) * h);
        c.fillStyle = yr <= data.year ? rampAt(p, yr) : alpha(p.ink, 0.12);
        c.fillRect(k * bw, h - bh, Math.max(1, bw - 1), bh);
      });
    }

    const recount = () => { counts = self.counts(data, data.bounds); render(); };
    const changed = () => { data.version++; api.changed(); recount(); };
    hood.onchange = () => { const k = labels.indexOf(hood.value); if (k >= 0) api.selectHood(k); };
    el.querySelector('.hood-clear').onclick = () => api.selectHood(null);

    const setYear = (y) => { data.year = y; api.changed(); recount(); };
    range.oninput = () => { stop(); setYear(+range.value); };

    // Play: fast through the early years, slower once building picks up.
    let timer = null;
    function stop() { clearTimeout(timer); timer = null; play.textContent = 'Play'; }
    play.onclick = () => {
      if (timer) return stop();
      play.textContent = 'Pause';
      let y = data.year >= NOW ? FIRST : data.year;
      const step = () => {
        setYear(y);
        if (y >= NOW) return stop();
        y++;
        timer = setTimeout(step, y < 1990 ? 35 : 190);
      };
      step();
    };

    function render() {
      counts ??= self.counts(data, data.bounds);
      const p = api.palette();
      hood.value = data.hood === null ? '' : labels[data.hood];
      range.value = data.year;
      yearEl.textContent = data.year;
      drawBars();
      const byYear = (api.opts().colourBy ?? COLOUR_BY[0]) === COLOUR_BY[0];
      ramp.hidden = !byYear;
      ramp.querySelector('i').style.background = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(t => rampAt(p, RAMP_FROM + t * (NOW - RAMP_FROM))).join(',')})`;
      el.querySelector('.lv-where').textContent = data.hood === null ? (data.bounds ? 'in view' : 'in New York') : `in ${self.hoodName(data)}`;
      el.querySelector('.lv-total').textContent = km(counts.total);
      list.replaceChildren(...data.meta.kinds.map((name, s) => {
        const li = document.createElement('li');
        li.className = data.on[s] ? '' : 'off';
        const swatch = byYear ? `linear-gradient(90deg, ${rampAt(p, 1990)}, ${rampAt(p, NOW)})` : KIND_COLOURS[s];
        li.innerHTML = `<button class="sp" title="Switch on or off"><span class="stroke" style="--c:${swatch};--w:${WEIGHT[s] * 2}px"></span><span class="name">${name}</span><span class="n">${km(counts.m[s])} km</span></button><button class="solo" title="Only this kind">Only</button>`;
        li.querySelector('.sp').onclick = () => { data.on[s] = data.on[s] ? 0 : 1; changed(); };
        li.querySelector('.solo').onclick = () => { data.on.fill(0); data.on[s] = 1; changed(); };
        return li;
      }));
    }
    api.onView(recount);
    api.onPalette(render);
    api.onHood(recount);
    api.onOptions?.(render);
    render();
  },
};
