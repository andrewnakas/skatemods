"""Claim queued ReSkate conversions from skatemods.com, build each Skate 3 pack, upload it.

Runs inside convert.yml (job `reskate`) after apps/studio's CLI is built. The converter reads only the
Thunderstore mod and the CC0 base pack, so the packs hold no game data and are shared with everyone.

usage: run_reskate.py [--max N]
env:   SKATEMODS_API, ACTIONS_ID_TOKEN_REQUEST_URL / _TOKEN, SKATEMODS_RUNNER_TOKEN (see run_jobs.py)
       RESKATE_CLI   path to skate3-convert.mjs (default apps/studio/dist-cli/skate3-convert.mjs)
       BASE_PACK     CC0 base pack URL (default the GitHub Pages copy)
"""
from pathlib import Path
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request

from run_jobs import call

ROOT = Path(__file__).resolve().parent.parent
CLI = Path(os.environ.get('RESKATE_CLI', ROOT / 'apps/studio/dist-cli/skate3-convert.mjs'))
BASE_PACK = os.environ.get('BASE_PACK', 'https://andrewnakas.github.io/skate-base-cc0-pack/')
MAX_ZIP = 2 * 1024 ** 3
TIMEOUT = 60 * 60


def download(url: str, dest: Path) -> int:
    req = urllib.request.Request(url, headers={'User-Agent': 'skatemods-runner (+https://skatemods.com)'})
    n = 0
    with urllib.request.urlopen(req, timeout=600) as r, dest.open('wb') as f:
        while chunk := r.read(1 << 20):
            n += len(chunk)
            if n > MAX_ZIP:
                raise RuntimeError('the mod is larger than 2 GB')
            f.write(chunk)
    return n


def upload(conv: str, which: str, path: Path) -> None:
    size = path.stat().st_size
    _, begin = call('POST', f'/runner/reskate/{conv}/files/{which}', json_body={'name': path.name, 'bytes': size})
    with path.open('rb') as f:
        for part in range(1, begin['parts'] + 1):
            call('PUT', f'/runner/reskate/{conv}/files/{which}/parts/{part}', data=f.read(begin['partSize']))
    call('POST', f'/runner/reskate/{conv}/files/{which}/complete')


def report_of(stdout: str) -> dict:
    """The CLI ends with 'export {json}', 'pack {json}', 'spawn {json}' lines."""
    out = {}
    for line in stdout.splitlines():
        m = re.match(r'\s*(export|pack|spawn)\s+(\{.*\})\s*$', line)
        if m:
            try:
                out[m.group(1)] = json.loads(m.group(2))
            except ValueError:
                pass
    return out


def run_one(claim: dict, work: Path) -> None:
    conv = claim['id']
    print(f'::group::{claim["fullName"]} {claim["version"]} ({conv})', flush=True)
    d = work / conv
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True)
    log = ''
    try:
        zipf = d / 'mod.zip'
        print(f'download {claim["download"]}: {download(claim["download"], zipf)} bytes', flush=True)
        out = d / 'out'
        started = time.time()
        proc = subprocess.run(['node', str(CLI), str(zipf), '-o', str(out), '--base-pack', BASE_PACK, '-v'],
                              capture_output=True, text=True, timeout=TIMEOUT)
        log = (proc.stdout + '\n' + proc.stderr)[-200_000:]
        print(log[-6000:], flush=True)
        if proc.returncode != 0:
            raise RuntimeError(f'converter exited {proc.returncode}: {proc.stderr.strip()[-400:]}')
        packs = [p for p in out.iterdir() if p.is_dir()]
        if len(packs) != 1:
            raise RuntimeError(f'expected one pack folder, found {len(packs)}')
        pack = packs[0]
        big = next(pack.glob('*.big'), None)
        header = next(pack.glob('*.header'), None)
        if not big or not header:
            raise RuntimeError('the converter wrote no .big or .header')
        upload(conv, 'big', big)
        upload(conv, 'header', header)
        report = report_of(proc.stdout)
        report['seconds'] = round(time.time() - started, 1)
        call('POST', f'/runner/reskate/{conv}/complete',
             json_body={'ok': True, 'folder': pack.name, 'log': log, 'report': report})
        print(f'done: {pack.name} {big.stat().st_size} bytes', flush=True)
    except Exception as e:  # report every failure; the next conversion still runs
        print(f'failed: {e}', file=sys.stderr, flush=True)
        call('POST', f'/runner/reskate/{conv}/complete', json_body={'ok': False, 'error': str(e)[:500], 'log': log})
    finally:
        shutil.rmtree(d, ignore_errors=True)
        print('::endgroup::', flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--max', type=int, default=10)
    a = ap.parse_args()
    if not CLI.exists():
        sys.exit(f'{CLI} missing: build it with (cd apps/studio && npm run build:cli)')
    work = Path(tempfile.mkdtemp(prefix='reskate-'))
    for _ in range(a.max):
        status, claim = call('POST', '/runner/reskate/claim')
        if status == 204 or not claim:
            break
        run_one(claim, work)


if __name__ == '__main__':
    main()
