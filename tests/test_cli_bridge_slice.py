"""The cli-bridge slice installer copies the cap, is idempotent, and verifies it."""

import os
import subprocess
import tempfile
import unittest

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
INSTALLER = os.path.join(ROOT, 'host', 'install-cli-bridge-slice.sh')
CAP = os.path.join(ROOT, 'host', 'cli-bridge', 'cli-bridge-llm.slice.d', '10-cpu-cap.conf')

STUB = """#!/bin/sh
echo "$*" >> "$HOME/systemctl.calls"
case "$*" in
  *CPUQuotaPerSecUSec*) echo "${STUB_QUOTA:-24s}" ;;
  *CPUWeight*) echo "${STUB_WEIGHT:-50}" ;;
esac
"""


@unittest.skipUnless(os.uname().sysname == 'Linux', 'the slice is GTR only')
class SliceInstallerTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix='slice-test-')
        bindir = os.path.join(self.home, 'bin')
        os.makedirs(bindir)
        with open(os.path.join(bindir, 'systemctl'), 'w') as fh:
            fh.write(STUB)
        os.chmod(os.path.join(bindir, 'systemctl'), 0o755)
        self.env = dict(os.environ, HOME=self.home, PATH=bindir + ':' + os.environ['PATH'])

    def run_installer(self, **extra):
        env = dict(self.env, **extra)
        return subprocess.run(['bash', INSTALLER], env=env, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, universal_newlines=True)

    def calls(self):
        with open(os.path.join(self.home, 'systemctl.calls')) as fh:
            return fh.read()

    def test_cap_values(self):
        with open(CAP) as fh:
            text = fh.read()
        self.assertIn('[Slice]', text)
        self.assertIn('CPUQuota=2400%', text)
        self.assertIn('CPUWeight=50', text)

    @unittest.skipIf(os.geteuid() == 0, 'the installer skips itself for root')
    def test_installs_once_then_is_a_no_op(self):
        first = self.run_installer()
        self.assertEqual(first.returncode, 0, first.stdout)
        self.assertIn('installed', first.stdout)
        self.assertEqual(self.calls().count('daemon-reload'), 1)
        dest = os.path.join(self.home, '.config/systemd/user/cli-bridge-llm.slice.d/10-cpu-cap.conf')
        with open(dest) as a, open(CAP) as b:
            self.assertEqual(a.read(), b.read())
        second = self.run_installer()
        self.assertEqual(second.returncode, 0, second.stdout)
        self.assertNotIn('installed', second.stdout)
        self.assertEqual(self.calls().count('daemon-reload'), 1)

    @unittest.skipIf(os.geteuid() == 0, 'the installer skips itself for root')
    def test_check_reports_drift_and_changes_nothing(self):
        result = self.run_installer_args('--check')
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn('drift', result.stdout)
        self.assertFalse(os.path.exists(os.path.join(self.home, '.config/systemd/user/cli-bridge-llm.slice')))
        self.assertEqual(self.run_installer().returncode, 0)
        self.assertEqual(self.run_installer_args('--check').returncode, 0)

    def run_installer_args(self, *args):
        return subprocess.run(['bash', INSTALLER] + list(args), env=self.env, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, universal_newlines=True)

    @unittest.skipIf(os.geteuid() == 0, 'the installer skips itself for root')
    def test_fails_when_systemd_reports_another_quota(self):
        result = self.run_installer(STUB_QUOTA='16s')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('FAIL', result.stdout)


if __name__ == '__main__':
    unittest.main()
