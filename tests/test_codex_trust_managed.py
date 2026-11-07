import importlib.util
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import tomllib
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'claude/hooks/codex-trust-managed.py'
spec = importlib.util.spec_from_file_location('codex_trust_managed', SCRIPT)
trust = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trust)


class CodexTrustManagedTests(unittest.TestCase):
    def test_installer_preserves_other_hooks_and_trusts_only_its_guard(self):
        with TemporaryDirectory() as tmp:
            home = Path(tmp) / 'seat'
            home.mkdir()
            (home / 'config.toml').write_text('[features]\nhooks = true\n')
            (home / 'hooks.json').write_text(json.dumps({'hooks': {'Stop': [{'hooks': [
                {'type': 'command', 'command': 'echo existing'}]}]}}))
            key = f'{home}/hooks.json:pre_tool_use:0:0'
            with patch.object(trust, 'hook_hash', return_value=(key, 'sha256:exact')):
                trust.install(home, '/guard.sh')
                trust.install(home, '/guard.sh')

            hooks = json.loads((home / 'hooks.json').read_text())['hooks']
            self.assertEqual(hooks['Stop'][0]['hooks'][0]['command'], 'echo existing')
            self.assertEqual(len(hooks['PreToolUse']), 1)
            state = tomllib.loads((home / 'config.toml').read_text())['hooks']['state']
            self.assertEqual(state, {key: {'trusted_hash': 'sha256:exact'}})

            with patch.object(trust, 'hook_hash', return_value=(key, 'sha256:changed')):
                with self.assertRaisesRegex(RuntimeError, 'changed since it was trusted'):
                    trust.install(home, '/guard.sh')

    def test_service_path_finds_codex_linked_by_installer(self):
        with TemporaryDirectory() as tmp:
            home = Path(tmp) / 'home'
            binary = home / 'bin/codex'
            binary.parent.mkdir(parents=True)
            binary.write_text('#!/bin/sh\nexit 0\n')
            binary.chmod(0o755)
            with patch.dict(os.environ, {'HOME': str(home), 'PATH': str(Path(tmp) / 'systemd-path')}):
                self.assertEqual(trust.find_codex(), str(binary))

    def test_symlinked_account_hook_uses_its_own_trust_key(self):
        with TemporaryDirectory() as tmp:
            shared = Path(tmp) / 'shared/hooks.json'
            shared.parent.mkdir()
            shared.write_text('{}')
            account = Path(tmp) / 'account/hooks.json'
            account.parent.mkdir()
            account.symlink_to(shared)
            guard = '/guard.sh'
            hooks = [{'sourcePath': str(source), 'eventName': 'preToolUse',
                      'handlerType': 'command', 'command': guard, 'timeoutSec': 10,
                      'key': key, 'currentHash': 'sha256:exact'}
                     for source, key in ((account, 'account-key'), (shared, 'shared-key'))]
            response = {'result': {'data': [{'hooks': hooks}]}}

            self.assertEqual(trust.installed_hook(response, account, guard)['key'], 'account-key')
            response['result']['data'][0]['hooks'] = hooks[1:]
            self.assertEqual(trust.installed_hook(response, account, guard)['key'], 'shared-key')
