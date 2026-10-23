// The series colourways: the same four-colour system as Song Fabric, so the
// daily work reads as one brand. bg = paper/water, ink = text and base map,
// mid = the highlight, alt = a second data colour.

export const PALETTES = [
  { name: 'Paper',  bg: '#EFEBE3', ink: '#161616', mid: '#FF5A1F', alt: '#2340FF' },
  { name: 'Night',  bg: '#0D0F12', ink: '#E6E9EC', mid: '#C8F03C', alt: '#8B6CFF' },
  { name: 'Clay',   bg: '#E8DCCB', ink: '#2A211C', mid: '#B4532E', alt: '#5E7A5A' },
  { name: 'Cobalt', bg: '#E9EEF2', ink: '#0F1A3A', mid: '#2340FF', alt: '#FF8A3D' },
];

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// A colour part-way from a to b, as CSS.
export function mix(a, b, t) {
  const x = hex(a), y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

export function alpha(c, a) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}
