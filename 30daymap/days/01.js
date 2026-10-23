// Day 01 · Points — every living street tree in New York as one dot, with one
// species picked out.

import { land } from '../kit/map.js';
import { alpha } from '../kit/palettes.js';

const fmt = n => n.toLocaleString('en-US');
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

export default {
  day: 1,
  theme: 'Points',
  title: 'Every street tree',
  credit: 'Data: NYC Parks, 2015 Street Tree Census · NYC Planning, Borough Boundaries',

  async load() {
    const [meta, bin] = await Promise.all([
      fetch('data/trees.json').then(r => r.json()),
      fetch('data/trees.bin').then(r => r.arrayBuffer()),
    ]);
    return { meta, bin: new DataView(bin), xy: null, xyKey: '' };
  },

  options: data => ({
    highlight: { label: 'Highlight', values: data.meta.species.slice(0, 12), value: data.meta.species[0] },
  }),

  subtitle(data, o) {
    const i = data.meta.species.indexOf(o.highlight), n = data.meta.speciesCounts[i];
    const rank = i === 0 ? 'is the most common' : `is the ${ordinal(i + 1)} most common`;
    return `${fmt(data.meta.count)} living trees, one dot each. The ${o.highlight}, highlighted, ${rank}: ${fmt(n)} trees.`;
  },

  draw(ctx, v, { geo, data, opts, p }) {
    land(ctx, v, geo, p, { fill: 0.035, line: 0.18 });

    // Project every tree once per size and angle; changing the highlight or colours reuses it.
    const { meta, bin } = data, n = meta.count, [x0, y0, x1, y1] = meta.bbox;
    if (data.xyKey !== v.key) {
      data.xy = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const o = i * 5;
        const [x, y] = v.xy(x0 + (bin.getUint16(o, true) / 65535) * (x1 - x0), y0 + (bin.getUint16(o + 2, true) / 65535) * (y1 - y0));
        data.xy[i * 2] = x; data.xy[i * 2 + 1] = y;
      }
      data.xyKey = v.key;
    }

    const hi = meta.species.indexOf(opts.highlight), xy = data.xy;
    // Same dot size for both, so the highlight shows its true share of the trees.
    const r = 1.05 * v.s;
    ctx.fillStyle = alpha(p.ink, 0.3);
    for (let i = 0; i < n; i++) if (bin.getUint8(i * 5 + 4) !== hi) ctx.fillRect(xy[i * 2] - r / 2, xy[i * 2 + 1] - r / 2, r, r);
    ctx.fillStyle = p.mid;
    for (let i = 0; i < n; i++) if (bin.getUint8(i * 5 + 4) === hi) ctx.fillRect(xy[i * 2] - r / 2, xy[i * 2 + 1] - r / 2, r, r);
  },
};
