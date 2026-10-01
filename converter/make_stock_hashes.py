"""Build converter/stock-hashes.txt from YOUR OWN extracted Skate 3 game files.

Only SHA-256 digests are written: no game content leaves your machine, and the
list lets the policy check spot uploads that are just retail files repackaged.
Run it over an extracted PS3 or Xbox 360 game (and its DLC), once per platform.

usage: make_stock_hashes.py <extracted game root> [more roots...] >> converter/stock-hashes.txt
"""
from pathlib import Path
import sys

from policy import STREAMS, sha256

seen = set()
for root in map(Path, sys.argv[1:]):
    for p in sorted(root.rglob('*')):
        if p.is_file() and p.suffix.lower() in STREAMS:
            digest = sha256(p)
            if digest not in seen:
                seen.add(digest)
                print(f'{digest}  {p.parent.name}/{p.name}')
print(f'{len(seen)} stock stream hashes', file=sys.stderr)
