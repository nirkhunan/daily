"""Download and pack the data the maps use into data/.

Run from the 30daymap folder:  python3 scripts/prepare.py
Sources (NYC Open Data):
  Borough Boundaries, Department of City Planning      gthc-hcne
  2015 Street Tree Census - Tree Data, NYC Parks        uvpi-gqnh
"""
import csv, io, json, struct, urllib.request
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
    url = f"{API}/resource/uvpi-gqnh.csv?$select=longitude,latitude,spc_common&$where=status='Alive'&$limit=800000"
    rows = list(csv.DictReader(io.StringIO(get(url).decode())))
    rows = [t for t in rows if t['longitude'] and t['latitude']]
    counts = Counter(t['spc_common'] or 'unknown' for t in rows)
    species = [name for name, _ in counts.most_common(254)]
    index = {name: i for i, name in enumerate(species)}
    lon = [float(t['longitude']) for t in rows]
    lat = [float(t['latitude']) for t in rows]
    bbox = [min(lon), min(lat), max(lon), max(lat)]
    # Each tree: lon and lat quantised to 16 bits inside the bounding box (about 1 m), then a species byte (255 = other).
    out = bytearray()
    for t, x, y in zip(rows, lon, lat):
        qx = round((x - bbox[0]) / (bbox[2] - bbox[0]) * 65535)
        qy = round((y - bbox[1]) / (bbox[3] - bbox[1]) * 65535)
        out += struct.pack('<HHB', qx, qy, index.get(t['spc_common'] or 'unknown', 255))
    open('data/trees.bin', 'wb').write(out)
    json.dump({'count': len(rows), 'bbox': bbox, 'species': species,
               'speciesCounts': [counts[s] for s in species]},
              open('data/trees.json', 'w'))
    print(len(rows), 'trees,', len(out) // 1024, 'KB')


boroughs()
trees()
