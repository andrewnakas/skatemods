"""Automated content checks for an uploaded map, run on the unpacked upload.

Verdicts:
  reject  never published: executables, a retail district, or mostly stock files
  flag    a moderator should look closely (some stock files, odd contents)
  ok      nothing found (a moderator still approves every map)

usage: policy.py <unpacked dir> [stock hash list]  -> JSON on stdout
"""
from pathlib import Path
import hashlib, json, sys

# Retail worlds. A pack whose world *is* one of these is the game itself, not a
# community map. (Community packs often reuse DLC *package* slots, which is fine;
# only the world folder name is checked here.)
RETAIL_WORLDS = {
    'dist_university', 'dist_downtown', 'dist_industrial', 'dist_megapark',
    'dist_skateschool', 'dist_university_owned',
}

EXECUTABLE = {
    '.exe', '.dll', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.js', '.jse', '.wsf', '.scr', '.msi',
    '.com', '.jar', '.sh', '.command', '.app', '.dylib', '.so', '.py', '.lnk', '.reg', '.hta',
}
STREAMS = {'.psf', '.xsf', '.psm', '.xsm', '.pmm', '.xmm', '.pss', '.xss', '.pst', '.xst', '.rx2', '.rx3'}

# Share of stream files identical to retail above which a pack is a rip.
REJECT_STOCK_SHARE = 0.5


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def load_stock(path: Path | None) -> set[str]:
    if not path or not path.exists():
        return set()
    return {line.split()[0] for line in path.read_text().splitlines() if line and not line.startswith('#')}


def check(root: Path, stock: set[str]) -> dict:
    reject, flag, notes = [], [], []
    files = [p for p in root.rglob('*') if p.is_file()]

    bad = sorted({p.name for p in files if p.suffix.lower() in EXECUTABLE})
    if bad:
        reject.append(f'contains executable or script files: {", ".join(bad[:10])}')

    worlds = sorted({p.name for p in root.rglob('DIST_*') if p.is_dir() and not p.parent.name.startswith('DIST_')
                     and any(q.suffix.lower() in ('.psf', '.xsf') for q in p.iterdir())})
    retail = [w for w in worlds if w.lower() in RETAIL_WORLDS]
    if retail:
        reject.append(f'world is a retail district: {", ".join(retail)}')
    if not worlds and not any(p.suffix.lower() == '.skate' for p in files):
        flag.append('no map world found in the upload')

    streams = [p for p in files if p.suffix.lower() in STREAMS]
    if stock and streams:
        matched = [p for p in streams if sha256(p) in stock]
        share = len(matched) / len(streams)
        notes.append(f'{len(matched)}/{len(streams)} stream files identical to retail')
        if share >= REJECT_STOCK_SHARE:
            reject.append(f'{share:.0%} of stream files are identical to the retail game')
        elif matched:
            flag.append(f'{len(matched)} stream files are identical to the retail game '
                        f'(e.g. {", ".join(sorted(p.name for p in matched)[:5])})')
    elif not stock:
        notes.append('retail hash list not configured; stock-file check skipped')

    total = sum(p.stat().st_size for p in files)
    notes.append(f'{len(files)} files, {total / 1e6:.1f} MB unpacked, worlds: {", ".join(worlds) or "none"}')
    verdict = 'reject' if reject else 'flag' if flag else 'ok'
    return {'verdict': verdict, 'reasons': reject + flag, 'notes': notes, 'worlds': worlds}


if __name__ == '__main__':
    root = Path(sys.argv[1])
    stock = load_stock(Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).with_name('stock-hashes.txt'))
    print(json.dumps(check(root, stock)))
