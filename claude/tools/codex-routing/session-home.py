"""Find an enrolled rollout's home using native metadata, never credentials."""
import json
import os
from pathlib import Path
import sqlite3
import sys
import uuid


def same_cwd(a, b):
    return os.path.realpath(a) == os.path.realpath(b)


def select_home(argv):
    values = {'-c', '--config', '-m', '--model', '-p', '--profile', '-C', '--cd',
              '-s', '--sandbox', '-a', '--ask-for-approval', '--enable', '--disable',
              '-i', '--image', '--add-dir', '-o', '--output-last-message', '--output-schema',
              '--thread-source', '--cyber-access-program'}
    cwd, operation, target, last, all_cwds = os.getcwd(), None, None, False, False
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg in values:
            if arg in {'-C', '--cd'}:
                cwd = argv[i + 1]
            i += 2
            continue
        if arg.startswith('--cd='):
            cwd = arg.split('=', 1)[1]
        elif arg == '--last':
            last = True
        elif arg == '--all':
            all_cwds = True
        elif not arg.startswith('-'):
            if operation:
                if target is None:
                    target = arg
            elif arg in {'resume', 'fork'}:
                operation = arg
        i += 1
    try:
        uuid.UUID(target or '')
        by_id = True
    except ValueError:
        by_id = False
    if operation == 'fork' or by_id:
        all_cwds = True
    root = Path(os.environ.get('ACCT_CONFIG', Path.home() / '.config/agent-accounts')) / 'codex'
    homes = [Path.home() / '.codex']
    if root.is_dir():
        homes += [p for p in root.iterdir() if p.is_dir()]
    candidates = []
    for home in dict.fromkeys(p.resolve() for p in homes):
        found = False
        # Codex --last sorts by UpdatedAt, not the session creation timestamp.
        # SQLite also retains the latest cwd and names after a continuation.
        for db in sorted(home.glob('state_*.sqlite'), reverse=True):
            try:
                with sqlite3.connect(f'{db.as_uri()}?mode=ro', uri=True, timeout=1) as con:
                    con.row_factory = sqlite3.Row
                    columns = {r[1] for r in con.execute('PRAGMA table_info(threads)')}
                    if not {'id', 'cwd', 'rollout_path', 'updated_at', 'archived'} <= columns:
                        continue
                    fields = ['id', 'cwd', 'rollout_path', 'updated_at']
                    fields += [c for c in ('updated_at_ms', 'name', 'title') if c in columns]
                    for row in con.execute('SELECT ' + ','.join(fields) + ' FROM threads WHERE archived=0 ORDER BY updated_at DESC'):
                        if not last and (row['id'] != target if by_id else target not in [row[c] for c in ('name', 'title') if c in columns]):
                            continue
                        if not all_cwds and not same_cwd(row['cwd'], cwd):
                            continue
                        if not Path(row['rollout_path']).is_file():
                            continue
                        at = row['updated_at_ms'] if 'updated_at_ms' in columns and row['updated_at_ms'] is not None else row['updated_at'] * 1000
                        candidates.append((at, str(home)))
                        found = True
                break
            except sqlite3.Error:
                continue
        if found:
            continue
        named_id = target
        if target and not by_id:
            try:
                for line in (home / 'session_index.jsonl').read_text().splitlines():
                    entry = json.loads(line)
                    if entry.get('thread_name') == target:
                        named_id = entry.get('id')
            except (OSError, ValueError):
                pass
        # Native Codex can rebuild a missing database from rollouts. Match that
        # fallback's update order and current cwd without parsing message bodies.
        for file in (home / 'sessions').rglob('*.jsonl'):
            if not last and not file.name.endswith(f'-{named_id}.jsonl'):
                continue
            try:
                with file.open() as stream:
                    first = json.loads(stream.readline())
                    if first.get('type') != 'session_meta':
                        continue
                    current_cwd = first['payload'].get('cwd', '/')
                    if not all_cwds:
                        for line in stream:
                            if '"type":"turn_context"' in line or '"type": "turn_context"' in line:
                                current_cwd = json.loads(line).get('payload', {}).get('cwd', current_cwd)
                if all_cwds or same_cwd(current_cwd, cwd):
                    candidates.append((file.stat().st_mtime * 1000, str(home)))
            except (OSError, ValueError):
                continue
    return max(candidates, default=(0, ''))[1]


if __name__ == '__main__':
    sys.stdout.write(select_home(sys.argv[1:]))
