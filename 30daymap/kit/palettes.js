// The series colourways, all green: bg = paper and water, ink = text and base
// map, mid = the highlight, alt = a second data colour.

export const PALETTES = [
  { name: 'Forest', bg: '#EEF2EA', ink: '#13261B', mid: '#2F8F46', alt: '#B5D334' },
  { name: 'Moss',   bg: '#E2E8D6', ink: '#1E2B17', mid: '#5A7D2B', alt: '#2E6B4F' },
  { name: 'Sage',   bg: '#E8EEE6', ink: '#24372B', mid: '#4E8A62', alt: '#C2A83E' },
  { name: 'Night',  bg: '#0D1A12', ink: '#DCE8D7', mid: '#B6E36B', alt: '#4FB286' },
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
