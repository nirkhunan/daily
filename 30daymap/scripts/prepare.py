"""Download and pack the data the maps use into data/.

Run from the 30daymap folder:  python3 scripts/prepare.py
Sources (NYC Open Data):
  Borough Boundaries, Department of City Planning      gthc-hcne
  Forestry Tree Points, NYC Parks (live, updated daily) hn5i-inap
  2020 Neighborhood Tabulation Areas, NYC Planning      9nt8-h7nd
"""
import csv, datetime, io, json, struct, urllib.request

import numpy as np
from collections import Counter

API = 'https://data.cityofnewyork.us'


def get(url):
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()


def boroughs():
    geo = json.loads(get(f'{API}/api/geospatial/gthc-hcne?method=export&format=GeoJSON'))

    def r(c):  # 4 decimals is about 10 m, finer than a pixel at poster size
        return [round(c[0], 4), round(c[1], 4)] if isinstance(c[0], (int, float)) else [r(x) for x in c]

    for f in geo['features']:
        f['properties'] = {'name': f['properties']['boroname']}
        f['geometry']['coordinates'] = r(f['geometry']['coordinates'])
    json.dump(geo, open('data/boroughs.json', 'w'), separators=(',', ':'))


def trees():
    """Every living tree NYC Parks manages (street and park trees), packed for the map."""
    rows, page = [], 200000
    while True:
        url = (f"{API}/resource/hn5i-inap.csv?$select=objectid,location,genusspecies,dbh,tpcondition"
               f"&$where=tpstructure='Full'%20AND%20tpcondition!='Dead'&$order=objectid&$limit={page}&$offset={len(rows)}")
        batch = list(csv.DictReader(io.StringIO(get(url).decode())))
        rows += batch
        print(len(rows), 'rows')
        if len(batch) < page:
            break

    trees = []
    for t in rows:
        if not t['location'].startswith('POINT'):
            continue
        lon, lat = map(float, t['location'][t['location'].index('(') + 1:-1].split())
        name = t['genusspecies'] or 'Unknown'
        latin, _, common = name.partition(' - ')
        trees.append((lon, lat, common.strip() or latin.strip(), latin.strip(), int(float(t['dbh'] or 0)), t['tpcondition'] or 'Unknown'))

    counts = Counter(t[2] for t in trees)
    species = [n for n, _ in counts.most_common()]
    latin = {}
    for t in trees:
        latin.setdefault(t[2], t[3])
    sp_index = {n: i for i, n in enumerate(species)}
    conditions = ['Excellent', 'Good', 'Fair', 'Poor', 'Critical', 'Unknown']
    lon = [t[0] for t in trees]; lat = [t[1] for t in trees]
    bbox = [min(lon), min(lat), max(lon), max(lat)]
    # Each tree, 8 bytes: lon, lat (16-bit, about 1 m), species (16-bit), trunk diameter in inches (8-bit), condition (8-bit).
    out = bytearray()
    for t in trees:
        out += struct.pack('<HHHBB',
                           round((t[0] - bbox[0]) / (bbox[2] - bbox[0]) * 65535),
                           round((t[1] - bbox[1]) / (bbox[3] - bbox[1]) * 65535),
                           sp_index[t[2]], min(t[4], 255),
                           conditions.index(t[5]) if t[5] in conditions else 5)
    open('data/trees.bin', 'wb').write(out)
    meta = json.loads(get(f'{API}/api/views/hn5i-inap.json'))
    updated = datetime.datetime.fromtimestamp(meta['rowsUpdatedAt'], datetime.timezone.utc).strftime('%Y-%m-%d')
    json.dump({'count': len(trees), 'bbox': bbox, 'updated': updated, 'conditions': conditions,
               'species': species, 'latin': [latin[n] for n in species],
               'speciesCounts': [counts[n] for n in species]},
              open('data/trees.json', 'w'))
    print(len(trees), 'trees,', len(species), 'species,', len(out) // 1024, 'KB, data updated', updated)


def neighborhoods():
    """Neighbourhood shapes, and which neighbourhood every tree stands in."""
    geo = json.loads(get(f'{API}/api/geospatial/9nt8-h7nd?method=export&format=GeoJSON'))

    def r(c):
        return [round(c[0], 4), round(c[1], 4)] if isinstance(c[0], (int, float)) else [r(x) for x in c]

    feats = sorted(geo['features'], key=lambda f: (f['properties']['boroname'], f['properties']['ntaname']))
    out = []
    for f in feats:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        out.append({'type': 'Feature',
                    'properties': {'code': f['properties']['nta2020'], 'name': f['properties']['ntaname'],
                                   'borough': f['properties']['boroname'], 'kind': int(f['properties']['ntatype'])},
                    'geometry': {'type': 'MultiPolygon', 'coordinates': r(polys)}})
    json.dump({'type': 'FeatureCollection', 'features': out}, open('data/neighborhoods.json', 'w'), separators=(',', ':'))

    # Point in polygon for every tree, with numpy: each ring flips "inside" for the points it crosses.
    meta = json.load(open('data/trees.json'))
    raw = np.frombuffer(open('data/trees.bin', 'rb').read(), dtype=np.dtype([('x', '<u2'), ('y', '<u2'), ('s', '<u2'), ('d', 'u1'), ('c', 'u1')]))
    x0, y0, x1, y1 = meta['bbox']
    lon = x0 + raw['x'] / 65535 * (x1 - x0)
    lat = y0 + raw['y'] / 65535 * (y1 - y0)
    nta = np.full(len(raw), 65535, dtype='<u2')
    for k, f in enumerate(out):
        for poly in f['geometry']['coordinates']:
            ring = np.array(poly[0])
            m = (lon >= ring[:, 0].min()) & (lon <= ring[:, 0].max()) & (lat >= ring[:, 1].min()) & (lat <= ring[:, 1].max()) & (nta == 65535)
            idx = np.nonzero(m)[0]
            if not len(idx):
                continue
            inside = np.zeros(len(idx), bool)
            for ring_pts in poly:   # outer ring, then holes
                rp = np.array(ring_pts)
                xi, yi = rp[:-1, 0], rp[:-1, 1]
                xj, yj = rp[1:, 0], rp[1:, 1]
                px, py = lon[idx], lat[idx]
                for a, b, c, d in zip(xi, yi, xj, yj):
                    if b == d:
                        continue
                    cross = ((b > py) != (d > py)) & (px < (c - a) * (py - b) / (d - b) + a)
                    inside ^= cross
            nta[idx[inside]] = k
    open('data/trees-nta.bin', 'wb').write(nta.tobytes())
    print(len(out), 'neighbourhoods;', int((nta == 65535).sum()), 'trees outside any')


boroughs()
trees()
neighborhoods()
