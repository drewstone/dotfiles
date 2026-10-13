import importlib.util
import json
from pathlib import Path
import tomllib

import pytest


SCRIPT = Path(__file__).resolve().parents[1] / 'claude/hooks/codex-trust-managed.py'
spec = importlib.util.spec_from_file_location('codex_trust_managed', SCRIPT)
trust = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trust)


def test_installer_preserves_other_hooks_and_trusts_only_its_guard(tmp_path, monkeypatch):
    home = tmp_path / 'seat'
    home.mkdir()
    (home / 'config.toml').write_text('[features]\nhooks = true\n')
    (home / 'hooks.json').write_text(json.dumps({'hooks': {'Stop': [{'hooks': [
        {'type': 'command', 'command': 'echo existing'}]}]}}))
    key = f'{home}/hooks.json:pre_tool_use:0:0'
    monkeypatch.setattr(trust, 'hook_hash', lambda *args: (key, 'sha256:exact'))

    trust.install(home, '/guard.sh')
    trust.install(home, '/guard.sh')

    hooks = json.loads((home / 'hooks.json').read_text())['hooks']
    assert hooks['Stop'][0]['hooks'][0]['command'] == 'echo existing'
    assert len(hooks['PreToolUse']) == 1
    state = tomllib.loads((home / 'config.toml').read_text())['hooks']['state']
    assert state == {key: {'trusted_hash': 'sha256:exact'}}

    monkeypatch.setattr(trust, 'hook_hash', lambda *args: (key, 'sha256:changed'))
    with pytest.raises(RuntimeError, match='changed since it was trusted'):
        trust.install(home, '/guard.sh')
