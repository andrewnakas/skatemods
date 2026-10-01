"""Unpack an uploaded map and report what it is.

Accepts an archive (.zip/.7z/.rar), an EA big (.big, or PS3 .big.edat, which is
the same "EB" container) or a folder. Writes every DIST_* world it finds under
<out>/<platform>/DIST_*, and prints one JSON line per world.

usage: unpack.py <rust-engine checkout> <input> <out dir>
"""
from pathlib import Path
import json, shutil, subprocess, sys

engine, source, out = map(Path, sys.argv[1:4])
sys.path.insert(0, str(engine))
from tools.asset_pipeline.install import extract

MAX_FILES = 20000


def expand(path, into):
    """Archives -> folder (bsdtar handles zip/7z/rar). Rejects path traversal."""
    listing = subprocess.run(['bsdtar', '-tf', str(path)], capture_output=True, text=True, check=True).stdout.split('\n')
    names = [n for n in listing if n]
    if len(names) > MAX_FILES:
        raise SystemExit(f'archive has {len(names)} entries (limit {MAX_FILES})')
    for name in names:
        if name.startswith(('/', '\\')) or '..' in Path(name).parts:
            raise SystemExit(f'unsafe path in archive: {name}')
    into.mkdir(parents=True, exist_ok=True)
    subprocess.run(['bsdtar', '-xf', str(path), '-C', str(into)], check=True)


def bigs(root):
    for p in root.rglob('*'):
        if p.is_file() and (p.name.endswith('.big') or p.name.endswith('.big.edat')):
            if p.read_bytes()[:2] in (b'EB', b'BI'):
                yield p


def platform(dist):
    if any(dist.glob('*.psf')): return 'ps3'
    if any(dist.glob('*.xsf')): return 'x360'
    return None


raw = out / 'raw'
if source.is_dir():
    shutil.copytree(source, raw)
elif source.name.endswith(('.big', '.big.edat')):
    raw.mkdir(parents=True); shutil.copy(source, raw / source.name)
else:
    expand(source, raw)

for big in list(bigs(raw)):
    extract(big, big.parent / (big.name + '.d'))

found = 0
for dist in sorted(p for p in raw.rglob('DIST_*') if p.is_dir() and platform(p)):
    if dist.parent.name.startswith('DIST_'):
        continue  # nested debug folders such as _worldpainter_debug live under a DIST
    kind = platform(dist)
    target = out / kind / dist.name
    if target.exists():
        continue
    shutil.copytree(dist, target)
    found += 1
    print(json.dumps({'platform': kind, 'dist': str(target), 'streams': sum(1 for _ in dist.iterdir())}))
if not found:
    raise SystemExit('no DIST_* world with .psf or .xsf streams found')
