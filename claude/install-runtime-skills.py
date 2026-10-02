#!/usr/bin/env python3
"""Install agent-runtime's skills from a published npm version.

Spawned agents read these skills from the @tangle-network/agent-runtime version their
project pins. Operators used to read them from whatever agent-runtime checkout sat on the
machine, which on 2026-09-27 was 316 commits behind on the laptop and a feature branch on
the dev box, so the two sides read different text. Installing from a published version
gives operators the same bytes a pinned project mounts, and the manifest records each
SKILL.md's sha256 so the two can be compared.

The version comes from AGENT_RUNTIME_SKILLS_VERSION (an exact version or a dist-tag),
default `latest`. The tarball's npm integrity is checked before anything is extracted.
When the registry cannot be reached, the installed version stays in place.

Usage: install-runtime-skills.py --store DIR [--registry URL] [--version SPEC]
Prints the installed version and skill names as JSON on stdout.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

PACKAGE = '@tangle-network/agent-runtime'
DEFAULT_REGISTRY = 'https://registry.npmjs.org'


def fetch(url: str, accept: str | None = None) -> bytes:
    # curl uses the system trust store; the python.org macOS build ships none of its own.
    command = ['curl', '-fsSL', '--retry', '2', '--max-time', '120']
    if accept:
        command += ['-H', f'Accept: {accept}']
    return subprocess.run(command + [url], check=True, capture_output=True).stdout


def resolve(registry: str, spec: str) -> dict:
    name = PACKAGE.replace('/', '%2f')
    meta = json.loads(fetch(f'{registry.rstrip("/")}/{name}/{spec}', 'application/json'))
    dist = meta.get('dist') or {}
    if not meta.get('version') or not dist.get('tarball') or not dist.get('integrity'):
        raise RuntimeError(f'{PACKAGE}@{spec}: registry metadata has no version, tarball or integrity')
    return {'version': meta['version'], 'tarball': dist['tarball'], 'integrity': dist['integrity']}


def verify(data: bytes, integrity: str) -> None:
    for entry in integrity.split():
        algorithm, _, expected = entry.partition('-')
        if algorithm in ('sha512', 'sha384', 'sha256'):
            actual = base64.b64encode(hashlib.new(algorithm, data).digest()).decode()
            if actual != expected:
                raise RuntimeError(f'tarball {algorithm} integrity mismatch')
            return
    raise RuntimeError(f'no supported integrity in {integrity!r}')


def extract_skills(data: bytes, destination: Path) -> dict:
    skills: dict[str, dict] = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for member in archive.getmembers():
            parts = Path(member.name).parts
            if len(parts) < 3 or parts[:2] != ('package', 'skills') or not member.isfile():
                continue
            if any(part in ('', '.', '..') for part in parts) or member.name.startswith('/'):
                raise RuntimeError(f'unsafe path in tarball: {member.name}')
            target = destination.joinpath(*parts[1:])
            target.parent.mkdir(parents=True, exist_ok=True)
            body = archive.extractfile(member).read()
            target.write_bytes(body)
            if len(parts) == 4 and parts[3] == 'SKILL.md':
                skills[parts[2]] = {'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}
    if not skills:
        raise RuntimeError('the tarball has no skills/*/SKILL.md')
    return skills


def install(store: Path, registry: str, spec: str) -> dict:
    store.mkdir(parents=True, exist_ok=True)
    release = resolve(registry, spec)
    target = store / release['version']
    manifest_path = target / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.is_file() else None
    if not manifest or manifest.get('integrity') != release['integrity']:
        data = fetch(release['tarball'])
        verify(data, release['integrity'])
        staging = Path(tempfile.mkdtemp(prefix='.staging-', dir=store))
        try:
            skills = extract_skills(data, staging)
            manifest = {
                'package': PACKAGE,
                'version': release['version'],
                'requested': spec,
                'tarball': release['tarball'],
                'integrity': release['integrity'],
                'installedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'skills': skills,
            }
            (staging / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
            if target.exists():
                shutil.rmtree(target)
            staging.rename(target)
        finally:
            shutil.rmtree(staging, ignore_errors=True)
    # Links go through `current`, so a version change moves every skill at once.
    link = store / f'.current-{os.getpid()}'
    link.symlink_to(release['version'])
    os.replace(link, store / 'current')
    for entry in store.iterdir():
        if entry.is_dir() and not entry.is_symlink() and entry.name != release['version'] and not entry.name.startswith('.'):
            shutil.rmtree(entry)
    return {'version': manifest['version'], 'skills': sorted(manifest['skills'])}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--store', required=True, type=Path)
    parser.add_argument('--registry', default=os.environ.get('AGENT_RUNTIME_SKILLS_REGISTRY', DEFAULT_REGISTRY))
    parser.add_argument('--version', default=os.environ.get('AGENT_RUNTIME_SKILLS_VERSION', 'latest'))
    args = parser.parse_args()
    try:
        result = install(args.store, args.registry, args.version)
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError, tarfile.TarError) as error:
        current = args.store / 'current' / 'manifest.json'
        kept = json.loads(current.read_text())['version'] if current.is_file() else None
        print(f'install-runtime-skills: {PACKAGE}@{args.version} not installed: {error}', file=sys.stderr)
        if kept is None:
            return 1
        print(f'install-runtime-skills: keeping installed {PACKAGE}@{kept}', file=sys.stderr)
        result = {'version': kept, 'skills': sorted(json.loads(current.read_text())['skills']), 'kept': True}
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
