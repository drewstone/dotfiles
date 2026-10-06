"""~/.claude/settings.json is the repository base merged with the machine overlay, and runtime writes survive installs."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / 'claude' / 'install-settings.py'


def run(base, claude_dir, *extra):
    return subprocess.run([sys.executable, str(SCRIPT), '--base', str(base), '--claude-dir', str(claude_dir), *extra],
                          capture_output=True, text=True)


class InstallSettingsTest(unittest.TestCase):
    def test_runtime_writes_survive_the_symlink_migration_and_later_base_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            repo, home = tmp / 'repo', tmp / 'home' / '.claude'
            (repo / 'claude').mkdir(parents=True)
            home.mkdir(parents=True)
            base = repo / 'claude' / 'settings.json'
            base.write_text(json.dumps({'model': 'opus[1m]', 'hooks': {'Stop': 1}, 'modelSettings': {'a': {'effort': 'xhigh'}}}))
            git = ['git', '-c', 'core.hooksPath=/dev/null', '-C', str(repo)]
            subprocess.run([*git, 'init', '-q'], check=True)
            subprocess.run([*git, 'add', '-A'], check=True)
            subprocess.run([*git, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base'], check=True)

            # Claude Code wrote /model through the old symlink into the tracked file.
            os.symlink(base, home / 'settings.json')
            base.write_text(json.dumps({'model': 'opus', 'hooks': {'Stop': 1},
                                        'modelSettings': {'a': {'effort': 'xhigh'}, 'b': {'effort': 'xhigh'}}}))
            r = run(base, home)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertFalse((home / 'settings.json').is_symlink())
            self.assertEqual(json.loads((home / 'settings.machine.json').read_text()),
                             {'model': 'opus', 'modelSettings': {'b': {'effort': 'xhigh'}}})

            # The tracked file goes back to its commit; the installed file keeps the machine's choices.
            subprocess.run([*git, 'checkout', '-q', '--', 'claude/settings.json'], check=True)
            self.assertEqual(run(base, home).returncode, 0)
            installed = json.loads((home / 'settings.json').read_text())
            self.assertEqual(installed['model'], 'opus')
            self.assertEqual(installed['modelSettings'], {'a': {'effort': 'xhigh'}, 'b': {'effort': 'xhigh'}})

            # A later runtime write, and a deletion, survive a base change; the base change still lands.
            live = json.loads((home / 'settings.json').read_text())
            live['model'] = 'sonnet'
            del live['modelSettings']['a']
            (home / 'settings.json').write_text(json.dumps(live))
            self.assertEqual(run(base, home, '--check').returncode, 0)
            base.write_text(json.dumps({'model': 'opus[1m]', 'hooks': {'Stop': 2}, 'modelSettings': {'a': {'effort': 'xhigh'}}}))
            self.assertEqual(run(base, home, '--check').returncode, 1)
            self.assertEqual(run(base, home).returncode, 0)
            self.assertEqual(json.loads((home / 'settings.json').read_text()),
                             {'model': 'sonnet', 'hooks': {'Stop': 2}, 'modelSettings': {'b': {'effort': 'xhigh'}}})
            self.assertEqual(run(base, home, '--check').returncode, 0)


if __name__ == '__main__':
    unittest.main()
