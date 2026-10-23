// The explorer: a real street map you can zoom and pan down to single trees.
// MapLibre draws the streets (OpenFreeMap for light colourways, CARTO for
// dark), and deck.gl draws the day's data on top, fast enough for hundreds
// of thousands of points. Both libraries are loaded as globals by index.html.

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const isDark = p => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(p.bg.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 90;
};

export function createExplorer(el, p) {
  let dark = isDark(p);
  const map = new maplibregl.Map({
    container: el,
    style: STYLES[dark ? 'dark' : 'light'],
    center: [-73.94, 40.7],
    zoom: 9.6,
    minZoom: 9,
    maxZoom: 19,
    maxBounds: [[-74.65, 40.35], [-73.35, 41.05]],
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  const overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay);

  return {
    map,
    overlay,
    setPalette(next) {
      if (isDark(next) !== dark) { dark = !dark; map.setStyle(STYLES[dark ? 'dark' : 'light']); }
    },
    // [west, south, east, north] of what is on screen.
    bounds() {
      const b = map.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    },
    resize: () => map.resize(),
  };
}
