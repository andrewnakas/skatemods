"""Xbox 360 DIST folder -> .skate, using the rust engine's own asset pipeline.

Runs without the game executable or any retail data: this is the prepare /
collision / write half of tools/asset_pipeline/install.py:convert_map, minus
the props pass (needs the disc's DMO catalog) and the --check-assets launch.

usage: to_skate.py <rust-engine checkout> <DIST_* stream dir> <out dir>
"""
from pathlib import Path
import struct, sys, time

engine, stream, out = map(Path, sys.argv[1:4])
tools = engine / 'tools'
sys.path.insert(0, str(engine))
sys.path.insert(0, str(tools / 'vendor/university/tools/vanilla_map_extraction/tools'))

import prepare_hawaiian_dream
import retail_grind_splines as rgs

_decode = rgs.decode_grind_splines


def decode_tolerant(data):
    """Community packs carry an all-zero tSplineData section (no rails). The
    retail decoder rejects its zero table offsets; drop those sections only."""
    try:
        return _decode(data)
    except ValueError as error:
        if 'inconsistent table layout' not in str(error):
            raise
    count = struct.unpack_from('>I', data, 0x20)[0]
    table = struct.unpack_from('>I', data, 0x30)[0]
    size = rgs.RX2_TOC_RECORD_SIZE
    keep = []
    for i in range(count):
        record = table + i * size
        offset = struct.unpack_from('>I', data, record)[0]
        kind = struct.unpack_from('>I', data, record + 20)[0]
        empty = struct.unpack_from('>HH', data, offset)[1] == 0 and struct.unpack_from('>I', data, offset + 4)[0] == 0
        if not (kind == rgs.RX2_TYPE_SPLINE_DATA and empty):
            keep.append(i)
    if len(keep) == count:
        return _decode(data)  # not the empty-section case; re-raise
    patched = bytearray(data)
    for n, i in enumerate(keep):
        patched[table + n * size:table + (n + 1) * size] = data[table + i * size:table + (i + 1) * size]
    struct.pack_into('>I', patched, 0x20, len(keep))
    return _decode(bytes(patched))


prepare_hawaiian_dream.decode_grind_splines = decode_tolerant

from prepare_hawaiian_dream import prepare
from prepare_university import EXCLUDED_NORMAL_TEXTURE_IDS
from build_retail_collision_archive import build_archive
from tools.asset_pipeline.map_writer import write as write_map, SpawnSelector

district = stream.name
label = district.removeprefix('DIST_')
work = out / 'work' / district
started = time.perf_counter()
spawn = SpawnSelector(district)
manifest = prepare(
    stream_directory=stream, output_root=work / 'intermediate', utt_root=tools / 'vendor/utt',
    district_name=district, map_name=label, package_name='skatemods.com conversion',
    cache_format='skate3-rust-map-v1',
    texture_stream_names=('Tex',) if any(stream.glob('cTex_*.xsf')) else (),
    excluded_normal_texture_ids=EXCLUDED_NORMAL_TEXTURE_IDS, raw_texture_cache=True,
    collision_consumer=spawn.consider, write_render_sources=False)
collision = work / 'collision.rwcmset'
build_archive(manifest, collision)
final = out / (label + '.skate')
write_map(manifest, final, collision, print, prepared_spawn=spawn.result(label))
print(f'skate: {final} {final.stat().st_size} bytes in {time.perf_counter() - started:.1f}s')
