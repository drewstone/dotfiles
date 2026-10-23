"""Consumer of tangle-tools' maintained PR signals; no local classifier or outcome cache.

Historical agent-work/_outcomes/prs.jsonl journals are retained as evidence. Current
reads use skill-outcomes/pr-signals.json; only an explicit/daily refresh contacts GitHub.
"""
from __future__ import annotations

import datetime as dt
import importlib
import os
from pathlib import Path
import sys


def _signal_owner():
    root = Path(os.environ.get('TANGLE_TOOLS_DEPLOY', str(Path.home() / '.local/share/tangle-tools')))
    packages = root / 'packages'
    if not (packages / 'skill_pr_outcomes/__init__.py').is_file():
        raise RuntimeError('installed tangle-tools PR-signal owner unavailable; update through its maintained deploy path')
    sys.path.insert(0, str(packages))
    return importlib.import_module('skill_pr_outcomes')


def latest_snapshots(texts):
    try:
        return _signal_owner().signal_snapshots(texts)
    except RuntimeError:
        return {}


def run_outcome(prs, snapshots):
    if not prs:
        return None
    try:
        return _signal_owner().signal_run_result(prs, snapshots)
    except RuntimeError as error:
        return {'status': 'PENDING', 'signal': 'signal-owner-unavailable', 'windowClosed': False,
                'served': None, 'goalAcceptance': 'UNKNOWN', 'error': str(error),
                'prs': [{**ref, 'status': 'PENDING', 'signal': 'signal-owner-unavailable',
                         'unknowns': ['signal owner'], 'served': None, 'windowClosed': False} for ref in prs]}


def join(refs, *, at=None, existing=None, write=True, refresh=False):
    """Read/queue current refs. Only the existing explicit/daily join requests refresh."""
    at = at or dt.datetime.now(dt.timezone.utc)
    try:
        owner = _signal_owner()
        if refresh:
            snapshots, report = owner.refresh_signals(refs, at=at)
        elif write:
            snapshots, report = owner.request_signals(refs, at=at)
        else:
            snapshots = owner.signal_snapshots([owner.SignalCache().path.read_text()], at)
            report = {'checked': 0, 'queued': 0, 'githubCalls': 0, 'errors': []}
        if existing is not None:
            for key, snapshot in snapshots.items():
                if key not in existing or (snapshot.get('checkedAt') or '') >= (existing[key].get('checkedAt') or ''):
                    existing[key] = snapshot
        return {**report, 'due': report.get('queued', report.get('checked', 0))}
    except (RuntimeError, OSError, ValueError) as error:
        return {'checked': 0, 'due': len(refs), 'githubCalls': 0, 'errors': [str(error)]}
