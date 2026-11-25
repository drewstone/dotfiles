#!/usr/bin/env python3
"""Install and trust the hooks this dotfiles tree owns in one Codex home: process_guard.py before each tool call, and the change ledger after it."""
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


class TrustPending(RuntimeError):
    """Codex did not answer in time; trust is retried on the next install pass."""


def find_codex():
    codex = shutil.which('codex')
    if codex:
        return codex
    # dotfiles-deploy.service does not inherit an interactive PATH. The
    # installer links this executable before it asks Codex to trust the hook.
    installed = Path.home() / 'bin/codex'
    return str(installed) if installed.is_file() and os.access(installed, os.X_OK) else None


def installed_hook(response, path, guard, event_name='preToolUse'):
    hooks = [hook for data in response['result']['data'] for hook in data['hooks']
             if hook.get('eventName') == event_name
             and hook.get('handlerType') == 'command'
             and hook.get('command') == guard
             and hook.get('timeoutSec') == 10]
    # Codex may list both an account's hooks.json and the shared file it
    # symlinks to. Trust the account's key; use the target only when Codex
    # did not report the account path at all.
    matches = [hook for hook in hooks if hook.get('sourcePath') == str(path)]
    if not matches:
        matches = [hook for hook in hooks if hook.get('sourcePath') == str(path.resolve())]
    if len(matches) != 1:
        raise RuntimeError(f'expected one installed {event_name} hook {guard} in {path}; found {len(matches)}')
    return matches[0]


def hook_hash(home, path, guard, event_name='preToolUse'):
    codex = find_codex()
    if not codex:
        raise RuntimeError('codex is unavailable; hook trust is pending')
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
                hook = installed_hook(response, path, guard, event_name)
                return hook['key'], hook['currentHash']
        raise TrustPending('Codex hooks/list did not answer within 12 seconds')
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait()


def specs_for(guard, ledger=None):
    """The hooks this tree installs. The ledger hook is told its harness on the command line: Codex runs the command as written."""
    return [
        {'event': 'PreToolUse', 'eventName': 'preToolUse', 'command': guard, 'replaces': os.path.dirname(guard) + '/'},
    ] + ([{'event': 'PostToolUse', 'eventName': 'postToolUse', 'command': f'{ledger} codex', 'replaces': None}] if ledger else [])


def write_hooks_json(path, specs):
    try:
        config = json.loads(path.read_text())
    except FileNotFoundError:
        config = {}
    changed = False
    for spec in specs:
        groups = config.setdefault('hooks', {}).setdefault(spec['event'], [])
        # The guards installed earlier sit beside process_guard.py, and it replaced them.
        beside = spec['replaces']
        kept = [g for g in groups if not beside or not any(h.get('command', '').startswith(beside) and h['command'] != spec['command'] for h in g.get('hooks', []))]
        if not any(h.get('command') == spec['command'] for group in kept for h in group.get('hooks', [])):
            kept.append({'hooks': [{'type': 'command', 'command': spec['command'], 'timeout': 10}]})
        if kept != groups:
            config['hooks'][spec['event']] = kept
            changed = True
    if not changed:
        return
    target = path.resolve() if path.is_symlink() else path
    tmp = target.with_name(target.name + '.tmp')
    tmp.write_text(json.dumps(config, indent=2) + '\n')
    if target.exists():
        os.chmod(tmp, target.stat().st_mode & 0o777)
    os.replace(tmp, target)


def trust(home, path, name, key, current_hash):
    config_path = (home / 'config.toml').resolve()
    with config_path.open('a+') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        stream.seek(0)
        text = stream.read()
        state = tomllib.loads(text).get('hooks', {}).get('state', {})
        existing = state.get(key)
        if existing:
            if existing.get('trusted_hash') == current_hash:
                return
            # Dropping a replaced guard renumbers the group (pre_tool_use:2:0 became :0:0, 11-17): the same hash trusted at
            # another index of this file is the same guard moved, not an edit for a human to review.
            stale = f'[hooks.state.{json.dumps(key)}]\ntrusted_hash = {json.dumps(existing.get("trusted_hash"))}'
            if stale not in text or not any(k.startswith(key.rsplit(':', 2)[0] + ':') and v.get('trusted_hash') == current_hash
                                            for k, v in state.items()):
                raise RuntimeError(f'{path} changed since it was trusted; review it with Codex /hooks')
            stream.truncate(0)
            stream.write(text.replace(stale, f'[hooks.state.{json.dumps(key)}]\ntrusted_hash = {json.dumps(current_hash)}'))
            stream.flush()
            os.fsync(stream.fileno())
            print(f'  CODEX {path}: {name} trusted at its new index')
            return
        stream.write(f'\n[hooks.state.{json.dumps(key)}]\ntrusted_hash = {json.dumps(current_hash)}\n')
        stream.flush()
        os.fsync(stream.fileno())
        print(f'  CODEX {path}: {name} trusted')


def install(home, guard, ledger=None):
    path = home / 'hooks.json'
    specs = specs_for(guard, ledger)
    write_hooks_json(path, specs)
    for spec in specs:
        key, current_hash = hook_hash(home, path, spec['command'], spec['eventName'])
        trust(home, path, Path(spec['command'].split(' ')[0]).name, key, current_hash)


if __name__ == '__main__':
    try:
        install(Path(sys.argv[1]), sys.argv[2], *sys.argv[3:4])
    except TrustPending as error:
        # A slow app-server under host load is not a broken install; the next pass retries.
        print(f'  CODEX hook trust pending (retry next pass): {error}', file=sys.stderr)
        sys.exit(0)
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print(f'  CODEX hook trust pending: {error}', file=sys.stderr)
        sys.exit(1)
