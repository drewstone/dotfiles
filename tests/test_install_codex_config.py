"""The config owner changes shared defaults without exposing or replacing private settings."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import tomllib

SCRIPT = Path(__file__).resolve().parent.parent / 'claude/install-codex-config.py'


class InstallCodexConfigTest(unittest.TestCase):
    def test_defaults_preserve_private_settings_and_enrolled_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'config.toml'
            original = '# keep this comment\nmodel = "old-model"\nmodel_reasoning_effort = "max"\nprivate_setting = "local-only"\n[profiles.custom]\nmodel = "profile-model"\n'
            config.write_text(original)
            enrolled = Path(tmp) / 'enrolled.toml'
            enrolled.symlink_to(config)
            command = [sys.executable, str(SCRIPT), '--config', str(enrolled)]
            self.assertEqual(subprocess.run([*command, '--check']).returncode, 1)
            self.assertEqual(config.read_text(), original)
            self.assertEqual(subprocess.run(command).returncode, 0)
            parsed = tomllib.loads(config.read_text())
            self.assertEqual(parsed, {**tomllib.loads(original), 'model': 'gpt-6.1-sol', 'model_reasoning_effort': 'high'})
            self.assertIn('# keep this comment', config.read_text())
            self.assertTrue(enrolled.is_symlink())
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            before = config.stat().st_mtime_ns
            self.assertEqual(subprocess.run(command).returncode, 0)
            self.assertEqual(subprocess.run([*command, '--check']).returncode, 0)
            self.assertEqual(config.stat().st_mtime_ns, before)


if __name__ == '__main__':
    unittest.main()
