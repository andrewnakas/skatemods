"""Claim queued conversions from skatemods.com, convert them, upload the results.

Runs inside convert.yml. Authenticates with the job's GitHub OIDC token, so no
secret is stored anywhere. Standard library only.

usage: run_jobs.py [--max N]
env:   SKATEMODS_API (default https://skatemods.com/api)
       ACTIONS_ID_TOKEN_REQUEST_URL / _TOKEN (set by GitHub when id-token: write)
       SKATEMODS_RUNNER_TOKEN  local testing only (e.g. "dev-runner" against wrangler dev)
"""
from pathlib import Path
import argparse, json, os, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

API = os.environ.get('SKATEMODS_API', 'https://skatemods.com/api').rstrip('/')
AUDIENCE = 'https://skatemods.com/api/runner'
HERE = Path(__file__).resolve().parent
PART = 50 * 1024 * 1024


def runner_token() -> str:
    if os.environ.get('SKATEMODS_RUNNER_TOKEN'):
        return os.environ['SKATEMODS_RUNNER_TOKEN']
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=' + urllib.parse.quote(AUDIENCE)
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    with urllib.request.urlopen(req) as r:
        return json.load(r)['value']


def call(method, path, *, json_body=None, data=None, stream_to=None, ok=(200, 201, 204)):
    """One API request with a fresh token (OIDC tokens are short-lived)."""
    headers = {'Authorization': 'Bearer ' + runner_token(), 'User-Agent': 'skatemods-runner'}
    if json_body is not None:
        data = json.dumps(json_body).encode()
        headers['Content-Type'] = 'application/json'
    if data is not None:
        headers['Content-Length'] = str(len(data))
    req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                if r.status not in ok:
                    raise RuntimeError(f'{method} {path}: HTTP {r.status}')
                if stream_to:
                    with open(stream_to, 'wb') as f:
                        shutil.copyfileobj(r, f, 1 << 20)
                    return None
                body = r.read()
                return (r.status, json.loads(body) if body else None)
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 3:
                raise RuntimeError(f'{method} {path}: HTTP {e.code} {e.read()[:500]!r}') from None
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)


def upload(job, kind, path: Path):
    size = path.stat().st_size
    _, begin = call('POST', f'/runner/jobs/{job}/files', json_body={'kind': kind, 'name': path.name, 'bytes': size})
    fid = begin['fileId']
    with path.open('rb') as f:
        for part in range(1, begin['parts'] + 1):
            call('PUT', f'/runner/jobs/{job}/files/{fid}/parts/{part}', data=f.read(begin['partSize']))
    call('POST', f'/runner/jobs/{job}/files/{fid}/complete')


def run_one(claim: dict, work: Path) -> None:
    job, inp = claim['job'], claim['input']
    print(f'::group::job {job}: {claim["map"]["title"]} ({inp["name"]}, {inp["bytes"]} bytes)', flush=True)
    jobdir = work / job
    shutil.rmtree(jobdir, ignore_errors=True)
    (jobdir / 'in').mkdir(parents=True)
    src = jobdir / 'in' / inp['name']
    call('GET', f'/runner/jobs/{job}/input', stream_to=src)

    out = jobdir / 'out'
    started = time.time()
    proc = subprocess.run([str(HERE / 'convert.sh'), str(src), str(out)], capture_output=True, text=True,
                          timeout=4 * 3600, stdin=subprocess.DEVNULL)
    log = proc.stdout + proc.stderr
    for name in sorted(out.glob('*.log')):
        log += f'\n===== {name.name} =====\n' + name.read_text(errors='replace')
    print(log[-20000:], flush=True)

    policy_file = out / 'policy.json'
    policy = json.loads(policy_file.read_text()) if policy_file.exists() else \
        {'verdict': 'flag', 'reasons': ['policy check did not run'], 'notes': []}
    results = [json.loads(l) for l in (out / 'manifest.jsonl').read_text().splitlines() if l] \
        if (out / 'manifest.jsonl').exists() else []

    if policy['verdict'] != 'reject':
        for r in results:
            if r.get('ok') and r.get('file'):
                upload(job, r['target'], out / r['file'])
    ok = proc.returncode == 0 and (policy['verdict'] == 'reject' or any(r.get('ok') for r in results)
                                    or inp['name'].lower().endswith('.skate'))
    call('POST', f'/runner/jobs/{job}/complete', json_body={
        'ok': ok, 'results': results, 'policy': policy,
        'log': f'exit {proc.returncode} after {time.time() - started:.0f}s\n' + log,
    })
    shutil.rmtree(jobdir, ignore_errors=True)
    print(f'::endgroup::\njob {job}: {"ok" if ok else "FAILED"}, policy {policy["verdict"]}', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--max', type=int, default=10, help='jobs to run before exiting')
    args = ap.parse_args()
    work = Path(tempfile.mkdtemp(prefix='skatemods-'))
    done = 0
    while done < args.max:
        status, claim = call('POST', '/runner/claim')
        if status == 204:
            break
        try:
            run_one(claim, work)
        except Exception as e:  # report and move on; the job stays visible as failed
            print(f'::error::job {claim["job"]}: {e}', flush=True)
            try:
                call('POST', f'/runner/jobs/{claim["job"]}/complete', json_body={
                    'ok': False, 'results': [], 'log': f'runner error: {e}',
                    'policy': {'verdict': 'flag', 'reasons': ['conversion crashed'], 'notes': []}})
            except Exception as e2:
                print(f'::error::could not report failure: {e2}', flush=True)
        done += 1
    print(f'{done} job(s) processed')


if __name__ == '__main__':
    sys.exit(main())
