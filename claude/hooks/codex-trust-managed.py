#!/usr/bin/env python3
"""Install and trust the scan guard that this dotfiles tree owns in one Codex home."""
import fcntl
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import sys
import time
import tomllib


def find_codex():
    codex = shutil.which('codex')
    if codex:
        return codex
    # dotfiles-deploy.service does not inherit an interactive PATH. The
    # installer links this executable before it asks Codex to trust the hook.
    installed = Path.home() / 'bin/codex'
    return str(installed) if installed.is_file() and os.access(installed, os.X_OK) else None


def hook_hash(home, path, guard):
    codex = find_codex()
    if not codex:
        raise RuntimeError('codex is unavailable; scan guard trust is pending')
    proc = subprocess.Popen([codex, 'app-server'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL,
                            env={**os.environ, 'CODEX_HOME': str(home)})
    try:
        for message in (
            {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
             'params': {'clientInfo': {'name': 'dotfiles-hook-install', 'version': '1'}}},
            {'jsonrpc': '2.0', 'method': 'initialized'},
            {'jsonrpc': '2.0', 'id': 2, 'method': 'hooks/list',
             'params': {'cwds': [str(Path.cwd())]}},
        ):
            proc.stdin.write((json.dumps(message) + '\n').encode())
            proc.stdin.flush()
        deadline = time.monotonic() + 12
        pending = b''
        while time.monotonic() < deadline:
            if not select.select([proc.stdout], [], [], min(1, deadline - time.monotonic()))[0]:
                continue
            chunk = os.read(proc.stdout.fileno(), 65536)
            if not chunk:
                break
            pending += chunk
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                response = json.loads(line)
                if response.get('id') != 2:
                    continue
                if response.get('error'):
                    raise RuntimeError('Codex hooks/list failed')
                sources = {str(path), str(path.resolve())}
                matches = [hook for data in response['result']['data'] for hook in data['hooks']
                           if hook.get('sourcePath') in sources
                           and hook.get('eventName') == 'preToolUse'
                           and hook.get('handlerType') == 'command'
                           and hook.get('command') == guard
                           and hook.get('timeoutSec') == 10]
                if len(matches) != 1:
                    raise RuntimeError(f'expected one installed scan guard in {path}; found {len(matches)}')
                return matches[0]['key'], matches[0]['currentHash']
        raise RuntimeError('Codex hooks/list did not answer within 12 seconds')
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait()


def install(home, guard):
    path = home / 'hooks.json'
    try:
        config = json.loads(path.read_text())
    except FileNotFoundError:
        config = {}
    entries = config.setdefault('hooks', {}).setdefault('PreToolUse', [])
    if not any(h.get('command') == guard for group in entries for h in group.get('hooks', [])):
        entries.append({'hooks': [{'type': 'command', 'command': guard, 'timeout': 10}]})
        target = path.resolve() if path.is_symlink() else path
        tmp = target.with_name(target.name + '.tmp')
        tmp.write_text(json.dumps(config, indent=2) + '\n')
        if target.exists():
            os.chmod(tmp, target.stat().st_mode & 0o777)
        os.replace(tmp, target)
    key, current_hash = hook_hash(home, path, guard)
    config_path = (home / 'config.toml').resolve()
    with config_path.open('a+') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        stream.seek(0)
        existing = tomllib.loads(stream.read()).get('hooks', {}).get('state', {}).get(key)
        if existing:
            if existing.get('trusted_hash') != current_hash:
                raise RuntimeError(f'{path} changed since it was trusted; review it with Codex /hooks')
            return
        stream.write(f'\n[hooks.state.{json.dumps(key)}]\ntrusted_hash = {json.dumps(current_hash)}\n')
        stream.flush()
        os.fsync(stream.fileno())
    print(f'  CODEX {path}: scan guard trusted')


if __name__ == '__main__':
    try:
        install(Path(sys.argv[1]), sys.argv[2])
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print(f'  CODEX hook trust pending: {error}', file=sys.stderr)
        sys.exit(1)
