#!/usr/bin/env python3
"""Manage shared Codex defaults while retaining the rest of the private config."""
import argparse
import json
import os
from pathlib import Path
import re
import tempfile
import tomllib


DEFAULTS = {'model': 'gpt-6.1-sol', 'model_reasoning_effort': 'high'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path.home() / '.codex/config.toml')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    path = args.config.resolve()
    text = path.read_text() if path.exists() else ''
    current = tomllib.loads(text)
    expected = {**current, **DEFAULTS}
    if args.check:
        return int(current != expected)
    if current == expected:
        return 0

    # Only replace top-level keys. Parsing and comparing the whole document
    # before writing also rejects accidental matches inside multiline strings.
    table = re.search(r'^\s*\[', text, re.M)
    split = table.start() if table else len(text)
    top = re.sub(r'^[ \t]*(?:model|model_reasoning_effort)\s*=.*(?:\n|$)', '', text[:split], flags=re.M)
    updated = ''.join(f'{key} = {json.dumps(value)}\n' for key, value in DEFAULTS.items()) + top + text[split:]
    if tomllib.loads(updated) != expected:
        raise ValueError('cannot update Codex defaults while preserving the remaining config')
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.config-')
    try:
        with os.fdopen(fd, 'w') as handle:
            handle.write(updated)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
