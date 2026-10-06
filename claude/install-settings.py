#!/usr/bin/env python3
"""Install ~/.claude/settings.json as the repository base merged with this machine's overlay.

Claude Code writes runtime choices such as /model into ~/.claude/settings.json. While that path
was a symlink to the tracked claude/settings.json, every such write dirtied the installed
checkout and the deploy refused to move it. The installed file is now a plain file:

    settings.json = merge(claude/settings.json, settings.machine.json)

Before writing, any change made to the installed file since the last install (recorded in
.settings.installed.json) is folded into settings.machine.json, so runtime writes survive
every deploy. A key the runtime deleted is kept as null in the overlay, which deletes it.
On the first run after the symlink, the runtime changes are read against the committed version
of the file the link points to, because that tracked file itself holds them.

Usage: install-settings.py --base FILE --claude-dir DIR [--check]
"""
import argparse, json, os, subprocess, sys, tempfile


def merge(base, overlay):
    out = dict(base)
    for key, value in overlay.items():
        if value is None:
            out.pop(key, None)
        elif isinstance(value, dict):
            out[key] = merge(out[key] if isinstance(out.get(key), dict) else {}, value)
        else:
            out[key] = value
    return out


def diff(old, new):
    """The overlay patch that turns old into new: changed or added values, None for deletions."""
    patch = {}
    for key, value in new.items():
        if key not in old:
            patch[key] = value
        elif isinstance(old[key], dict) and isinstance(value, dict):
            nested = diff(old[key], value)
            if nested:
                patch[key] = nested
        elif old[key] != value:
            patch[key] = value
    for key in old:
        if key not in new:
            patch[key] = None
    return patch


def accumulate(overlay, patch):
    out = dict(overlay)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = accumulate(out[key], value)
        else:
            out[key] = value
    return out


def committed(path):
    """The committed content of a tracked file, or None outside a repository."""
    directory, name = os.path.split(os.path.realpath(path))
    try:
        top = subprocess.run(['git', '-C', directory, 'rev-parse', '--show-toplevel'],
                             check=True, capture_output=True, text=True).stdout.strip()
        relative = os.path.relpath(os.path.join(directory, name), top)
        text = subprocess.run(['git', '-C', top, 'show', f'HEAD:{relative}'],
                              check=True, capture_output=True, text=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return json.loads(text)


def load(path):
    with open(path) as handle:
        return json.load(handle)


def write(path, data):
    directory = os.path.dirname(path)
    fd, temporary = tempfile.mkstemp(dir=directory, prefix='.settings-')
    with os.fdopen(fd, 'w') as handle:
        json.dump(data, handle, indent=2)
        handle.write('\n')
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--claude-dir', required=True)
    parser.add_argument('--check', action='store_true', help='exit 1 unless the installed file is current')
    args = parser.parse_args()

    live_path = os.path.join(args.claude_dir, 'settings.json')
    overlay_path = os.path.join(args.claude_dir, 'settings.machine.json')
    record_path = os.path.join(args.claude_dir, '.settings.installed.json')
    base = load(args.base)
    overlay = load(overlay_path) if os.path.exists(overlay_path) else {}

    linked = os.path.islink(live_path)
    patch = {}
    if os.path.exists(live_path):
        live = load(live_path)
        if linked:
            reference = committed(live_path) or base
        elif os.path.exists(record_path):
            reference = load(record_path)
        else:
            reference = merge(base, overlay)
        patch = diff(reference, live)
    overlay = accumulate(overlay, patch)
    installed = merge(base, overlay)

    if args.check:
        current = not linked and os.path.exists(live_path) and load(live_path) == installed
        print('current' if current else 'stale')
        return 0 if current else 1

    if patch:
        write(overlay_path, overlay)
        print(f'  SETTINGS kept runtime changes in {overlay_path}: {sorted(patch)}')
    if linked:
        os.unlink(live_path)
    write(live_path, installed)
    write(record_path, installed)
    print(f'  SETTINGS {live_path} = {os.path.basename(args.base)} + settings.machine.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
