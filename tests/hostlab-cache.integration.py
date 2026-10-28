#!/usr/bin/env python3
"""Exercise the real Hostlab CLI, QCOW2 files, QEMU and kernel file locks."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

SUBJECT = Path(os.environ.get('HOSTLAB_CACHE_SUBJECT', Path(__file__).resolve().parents[1] / 'claude/tools/hostlab'))
PAYLOAD = ('base.qcow2', 'base.qcow2.built', 'noble-server-cloudimg-amd64.img', 'id_ed25519', 'id_ed25519.pub')


def run(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, timeout=15, **kw)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prove(root):
    cache = root / 'cache'
    cache.mkdir(mode=0o700)
    cloud, base = cache / PAYLOAD[2], cache / PAYLOAD[0]
    subprocess.run(['qemu-img', 'create', '-q', '-f', 'qcow2', str(cloud), '8M'], check=True)
    subprocess.run(['qemu-img', 'create', '-q', '-f', 'qcow2', '-F', 'qcow2', '-b', str(cloud), str(base)], check=True)
    subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'hostlab', '-f', str(cache / 'id_ed25519')], check=True)
    (cache / 'base.qcow2.built').write_text('native integration\n')
    diagnostics = cache / 'diagnostics'
    diagnostics.mkdir()
    receipt = diagnostics / 'retained.json'
    receipt.write_text('{"outcome":"preserve"}\n')
    before = {name: digest(cache / name) for name in PAYLOAD}
    receipt_hash = digest(receipt)
    env = dict(os.environ, HOSTLAB_HOME=str(cache))
    checks = []

    def clean(refusal=None):
        result = run([str(SUBJECT), 'clean', '--cache'], env=env)
        if refusal:
            assert result.returncode != 0 and refusal in result.stderr, (result.returncode, result.stdout, result.stderr)
            assert {name: digest(cache / name) for name in PAYLOAD} == before
        else:
            assert result.returncode == 0, (result.returncode, result.stdout, result.stderr)
        assert digest(receipt) == receipt_hash
        return result

    with (cache / 'cache.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_SH)
        clean('cache is in use')
    checks.append('kernel shared lock prevents exclusive retirement')
    process = subprocess.Popen(['qemu-io', '-r', '-f', 'qcow2', '-c', 'sleep 30000', str(base)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 5
        while run(['fuser', '-s', str(base)]).returncode != 0:
            assert process.poll() is None and time.monotonic() < deadline, 'QEMU did not open native image'
            time.sleep(0.05)
        clean('cache payload is open')
        assert process.poll() is None, 'retirement killed the image consumer'
    finally:
        process.terminate()
        process.communicate(timeout=5)
    checks.append('real QEMU open QCOW2 prevents deletion without stopping consumer')
    runs = cache / 'runs'
    runs.mkdir()
    pending = runs / '.pending'
    pending.mkdir()
    clean('cache has runs')
    pending.rmdir()
    build = cache / 'build'
    build.mkdir()
    clean('unrecognized cache entry')
    build.rmdir()
    checks.append('pending hidden run and build protect entire cache')
    link = root / 'linked-base'
    os.link(base, link)
    clean('unsafe cache payload')
    link.unlink()
    saved = root / 'saved-base'
    base.rename(saved)
    base.symlink_to(saved)
    clean('unsafe cache payload')
    base.unlink()
    saved.rename(base)
    checks.append('hardlinks and symlinks refuse; outside inode preserved')
    unknown = cache / 'producer-output'
    unknown.write_text('retain me')
    clean('unrecognized cache entry')
    assert unknown.read_text() == 'retain me'
    unknown.unlink()
    help_result = run([str(SUBJECT), 'clean', '--help'], env=env)
    assert help_result.returncode == 0 and '--cache' in help_result.stdout
    assert {name: digest(cache / name) for name in PAYLOAD} == before
    checks.append('unknown producer output and help retain payload')
    result = clean()
    assert all(not (cache / name).exists() for name in PAYLOAD)
    status = run([str(SUBJECT), 'status'], env=env)
    assert status.returncode == 0 and 'base: not built' in status.stdout
    assert all(not (cache / name).exists() for name in PAYLOAD), 'status recreated cache payload'
    clean()
    checks.append('retirement removes payload, preserves receipts; status and second clean remain empty')
    print(json.dumps({'outcome': 'PASS', 'subject': str(SUBJECT), 'checks': checks, 'retirement': result.stdout.strip()}, indent=2))


with tempfile.TemporaryDirectory(prefix='hostlab-cache-native-') as directory:
    prove(Path(directory))
