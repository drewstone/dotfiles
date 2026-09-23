"""Tests for git/worktree-reaper/wt-reaper against temporary repositories.

Each worktree in the fixture carries exactly one reason to be kept, or none.
One live run then checks every decision and the filesystem result.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REAPER = os.path.join(HERE, '..', 'git', 'worktree-reaper', 'wt-reaper')
IDLE_HOURS = 1.5 / 3600  # 1.5 seconds
FIELD = re.compile(r'(\w+)=("(?:[^"\\]|\\.)*"|\S+)')


def sh(args, cwd, check=True):
    env = dict(os.environ, GIT_AUTHOR_NAME='t', GIT_AUTHOR_EMAIL='t@t', GIT_COMMITTER_NAME='t',
               GIT_COMMITTER_EMAIL='t@t', GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
    proc = subprocess.run(args, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and proc.returncode != 0:
        raise AssertionError('%s: %s' % (args, proc.stderr.decode()))
    return proc.stdout.decode().strip()


def git(args, cwd, check=True):
    return sh(['git', '-c', 'init.defaultBranch=main', '-c', 'core.hooksPath=/dev/null'] + args, cwd, check)


def parse(stdout):
    rows = []
    for line in stdout.splitlines():
        row = {}
        for key, value in FIELD.findall(line):
            row[key] = json.loads(value) if value.startswith('"') else value
        rows.append(row)
    return rows


def run_reaper(root, *extra):
    env = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
    proc = subprocess.run([sys.executable, REAPER, '--root', root, '--no-log-file',
                           '--idle-hours', str(IDLE_HOURS)] + list(extra),
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    assert proc.returncode == 0, proc.stderr.decode()
    return parse(proc.stdout.decode())


def load_reaper():
    import importlib.machinery
    import importlib.util
    loader = importlib.machinery.SourceFileLoader('wt_reaper', REAPER)
    spec = importlib.util.spec_from_loader('wt_reaper', loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def scan_is_complete():
    """The reaper removes nothing unless it can inspect every process (sudo -n)."""
    if os.geteuid() == 0:
        return False
    mod = load_reaper()

    class Quiet:
        def write(self, **_):
            pass
    try:
        mod._scan_processes(True, Quiet())
        return True
    except mod.Skip:
        try:  # a process may have exited mid-scan; one retry
            mod._scan_processes(True, Quiet())
            return True
        except mod.Skip:
            return False


SCAN_COMPLETE = scan_is_complete()
NEEDS_SCAN = 'needs a complete process scan (passwordless sudo for ps/lsof reads)'


class Fixture:
    """A bare remote, a main clone, and one worktree per case under <root>/_wt."""

    def __init__(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp(prefix='wt-reaper-test-'))
        self.root = os.path.join(self.tmp, 'code')
        self.remote = os.path.join(self.tmp, 'remote.git')
        self.repo = os.path.join(self.root, 'repo')
        self.wt_dir = os.path.join(self.root, '_wt')
        os.makedirs(self.wt_dir)
        git(['init', '--bare', '-q', self.remote], self.tmp)
        git(['clone', '-q', self.remote, self.repo], self.tmp)
        self.write(self.repo, '.gitignore', 'node_modules/\n.env\n')
        self.write(self.repo, 'a.txt', 'a\n')
        git(['add', '.'], self.repo)
        git(['commit', '-qm', 'init'], self.repo)
        self.write(self.repo, 'a.txt', 'a2\n')
        git(['commit', '-qam', 'second'], self.repo)
        git(['push', '-q', '-u', 'origin', 'main'], self.repo)
        git(['remote', 'set-head', 'origin', 'main'], self.repo)
        self.procs = []

    @staticmethod
    def write(base, rel, text):
        path = os.path.join(base, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as fh:
            fh.write(text)

    def add(self, name, start='main', detach=False):
        path = os.path.join(self.wt_dir, name)
        if detach:
            git(['worktree', 'add', '-q', '--detach', path, start], self.repo)
        else:
            git(['worktree', 'add', '-q', '-b', name, path, start], self.repo)
        return path

    def cleanup(self):
        for proc in self.procs:
            proc.kill()
            proc.wait()
        shutil.rmtree(self.tmp, ignore_errors=True)


@unittest.skipUnless(SCAN_COMPLETE, NEEDS_SCAN)
class ReaperTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        f = cls.f = Fixture()
        p = cls.paths = {}
        p['merged'] = f.add('merged')
        p['detached'] = f.add('detached', detach=True)

        p['pushed_unmerged'] = f.add('pushed_unmerged')
        f.write(p['pushed_unmerged'], 'b.txt', 'b\n')
        git(['add', '.'], p['pushed_unmerged'])
        git(['commit', '-qm', 'feature'], p['pushed_unmerged'])
        git(['push', '-q', '-u', 'origin', 'pushed_unmerged'], p['pushed_unmerged'])

        p['build_output'] = f.add('build_output')
        f.write(p['build_output'], 'node_modules/x/index.js', 'x\n')

        p['env'] = f.add('env')
        f.write(p['env'], '.env', 'SECRET=1\n')

        p['dirty'] = f.add('dirty')
        f.write(p['dirty'], 'a.txt', 'changed\n')

        p['untracked'] = f.add('untracked')
        f.write(p['untracked'], 'notes.md', 'mine\n')

        p['unpushed'] = f.add('unpushed')
        f.write(p['unpushed'], 'c.txt', 'c\n')
        git(['add', '.'], p['unpushed'])
        git(['commit', '-qm', 'local only'], p['unpushed'])

        p['nested'] = f.add('nested')
        git(['init', '-q', os.path.join(p['nested'], 'sub')], f.tmp)

        p['locked'] = f.add('locked')
        git(['worktree', 'lock', '--reason', 'agent at work', p['locked']], f.repo)

        p['merge'] = f.add('merge', start='main~1')
        git(['merge', '--no-commit', '--no-ff', '-q', 'main'], p['merge'], check=False)
        assert os.path.exists(os.path.join(f.repo, '.git', 'worktrees', 'merge', 'MERGE_HEAD'))

        p['rebase'] = f.add('rebase', start='main~1')
        f.write(p['rebase'], 'd.txt', 'd\n')
        git(['add', '.'], p['rebase'])
        git(['commit', '-qm', 'd'], p['rebase'])
        git(['rebase', '-q', '--exec', 'false', 'main'], p['rebase'], check=False)
        assert os.path.exists(os.path.join(f.repo, '.git', 'worktrees', 'rebase', 'rebase-merge'))

        p['bisect'] = f.add('bisect')
        git(['bisect', 'start'], p['bisect'])

        p['cwd'] = f.add('cwd')
        p['open_file'] = f.add('open_file')
        p['recent'] = f.add('recent')

        # A second repository whose remote is gone: fetch fails, so it must skip.
        other = os.path.join(f.root, 'other')
        git(['clone', '-q', f.remote, other], f.tmp)
        cls.gone_remote = os.path.join(f.tmp, 'gone.git')
        shutil.copytree(f.remote, cls.gone_remote)
        git(['remote', 'set-url', 'origin', cls.gone_remote], other)
        git(['fetch', '-q'], other)
        p['fetch_failed'] = os.path.join(f.wt_dir, 'fetch_failed')
        git(['worktree', 'add', '-q', '--detach', p['fetch_failed'], 'origin/main'], other)
        shutil.rmtree(cls.gone_remote)

        # A dry-run fixture that would be removed.
        p['dry'] = f.add('dry')

        time.sleep(IDLE_HOURS * 3600 + 1.0)

        # Same content, so the tree stays clean. The mtime is an hour ahead so the
        # file stays inside the idle window however long the lsof scans take.
        f.write(p['recent'], 'a.txt', 'a2\n')
        ahead = time.time() + 3600
        os.utime(os.path.join(p['recent'], 'a.txt'), (ahead, ahead))
        f.procs.append(subprocess.Popen(['sleep', '120'], cwd=p['cwd']))
        holder = os.path.join(p['open_file'], 'a.txt')
        f.procs.append(subprocess.Popen(
            [sys.executable, '-c', 'import sys,time; fh=open(sys.argv[1]); print("ok", flush=True); time.sleep(120)', holder],
            stdout=subprocess.PIPE))
        f.procs[-1].stdout.readline()

        dry_rows = run_reaper(f.root, '--dry-run')
        cls.dry = {r['path']: r for r in dry_rows if 'decision' in r}
        cls.dry_exists = os.path.isdir(p['dry'])
        cls.rows = run_reaper(f.root)
        cls.by_path = {r['path']: r for r in cls.rows if 'decision' in r}

    @classmethod
    def tearDownClass(cls):
        cls.f.cleanup()

    def decision(self, name):
        row = self.by_path.get(self.paths[name])
        self.assertIsNotNone(row, 'no decision for %s: %s' % (name, self.rows))
        return row

    def assertSkipped(self, name, reason_part):
        row = self.decision(name)
        self.assertEqual(row['decision'], 'skip', row)
        self.assertIn(reason_part, row['reason'])
        self.assertTrue(os.path.isdir(self.paths[name]))

    def assertRemoved(self, name):
        row = self.decision(name)
        self.assertEqual(row['decision'], 'remove', row)
        self.assertFalse(os.path.exists(self.paths[name]))

    def test_dry_run_removes_nothing(self):
        self.assertEqual(self.dry[self.paths['dry']]['decision'], 'would-remove')
        self.assertEqual(self.dry[self.paths['env']]['decision'], 'skip')
        self.assertTrue(self.dry_exists)

    def test_removes_clean_pushed_idle_worktrees(self):
        for name in ('merged', 'detached', 'pushed_unmerged', 'build_output', 'dry'):
            with self.subTest(name=name):
                self.assertRemoved(name)
        worktrees = git(['worktree', 'list', '--porcelain'], self.f.repo)
        self.assertNotIn(self.paths['merged'], worktrees)

    def test_deletes_only_merged_branches(self):
        branches = git(['branch', '--format=%(refname:short)'], self.f.repo).split()
        self.assertNotIn('merged', branches)
        self.assertIn('pushed_unmerged', branches)
        events = [r for r in self.rows if r.get('event') == 'branch-kept' and r.get('branch') == 'pushed_unmerged']
        self.assertTrue(events and 'not merged' in events[0]['reason'])

    def test_never_touches_the_main_checkout(self):
        self.assertNotIn(self.f.repo, self.by_path)
        self.assertTrue(os.path.isdir(os.path.join(self.f.repo, '.git')))

    def test_skip_ignored_non_build_file(self):
        self.assertSkipped('env', 'ignored non-build files: .env')

    def test_skip_tracked_change(self):
        self.assertSkipped('dirty', 'not clean')

    def test_skip_untracked_file(self):
        self.assertSkipped('untracked', 'not clean')

    def test_skip_unpushed_commit(self):
        self.assertSkipped('unpushed', 'not on any remote ref')

    def test_skip_nested_repository(self):
        self.assertSkipped('nested', 'nested git repository')

    def test_skip_locked(self):
        self.assertSkipped('locked', 'locked')

    def test_skip_merge_in_progress(self):
        self.assertSkipped('merge', 'merge in progress')

    def test_skip_rebase_in_progress(self):
        self.assertSkipped('rebase', 'rebase')

    def test_skip_bisect_in_progress(self):
        self.assertSkipped('bisect', 'bisect in progress')

    def test_skip_process_cwd(self):
        self.assertSkipped('cwd', 'in use by a process')

    def test_skip_open_file(self):
        self.assertSkipped('open_file', 'in use by a process')

    def test_skip_recent_modification(self):
        self.assertSkipped('recent', 'modified')

    def test_skip_when_fetch_fails(self):
        self.assertSkipped('fetch_failed', 'fetch failed')

    def test_summary_line(self):
        summaries = [r for r in self.rows if r.get('event') == 'summary']
        self.assertEqual(len(summaries), 1)
        s = summaries[0]
        self.assertEqual(s['mode'], 'live')
        self.assertEqual(int(s['removed']), 5)
        self.assertEqual(int(s['scanned']), int(s['removed']) + int(s['skipped']))


@unittest.skipUnless(SCAN_COMPLETE, NEEDS_SCAN)
class RecheckTest(unittest.TestCase):
    """A file written after the first pass must stop the removal."""

    def test_write_between_passes_skips(self):
        f = Fixture()
        self.addCleanup(f.cleanup)
        late = f.add('late')
        time.sleep(IDLE_HOURS * 3600 + 1.0)
        mod = load_reaper()
        real_scan = mod.scan_processes
        calls = []

        def scan_then_write(*a, **k):
            calls.append(1)
            if len(calls) == 1:  # the first-pass scan; the recheck scans again
                Fixture.write(late, '.env', 'TOKEN=1\n')
            return real_scan(*a, **k)

        mod.scan_processes = scan_then_write
        old_env = dict(os.environ)
        os.environ.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(old_env)))
        mod.main(['--root', f.root, '--no-log-file', '--idle-hours', str(IDLE_HOURS)])
        self.assertTrue(os.path.isfile(os.path.join(late, '.env')))
        self.assertGreaterEqual(len(calls), 1)


@unittest.skipIf(os.geteuid() == 0, 'wt-reaper refuses to run as root')
class IncompleteScanTest(unittest.TestCase):
    """Without sudo, root processes are unreadable, so nothing may be removed."""

    def test_unreadable_processes_block_removal(self):
        f = Fixture()
        self.addCleanup(f.cleanup)
        path = f.add('blocked')
        time.sleep(IDLE_HOURS * 3600 + 1.0)
        rows = run_reaper(f.root, '--no-sudo')
        row = [r for r in rows if r.get('path') == path][0]
        self.assertEqual(row['decision'], 'skip', row)
        self.assertIn('process scan incomplete', row['reason'])
        self.assertTrue(os.path.isdir(path))


class RootRefusalTest(unittest.TestCase):
    @unittest.skipUnless(os.geteuid() == 0, 'needs root')
    def test_refuses_root(self):
        proc = subprocess.run([sys.executable, REAPER, '--dry-run', '--no-log-file'],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn(b'not root', proc.stderr)


class IgnoredClassifierTest(unittest.TestCase):
    def test_build_output_classifier(self):
        mod = load_reaper()
        for rel in ('node_modules/', 'packages/a/dist/', 'x/__pycache__/', 'tsconfig.tsbuildinfo', 'target/'):
            self.assertTrue(mod.is_build_output(rel), rel)
        for rel in ('.env', '.env.local', 'notes/', 'secrets.json', '.claude/settings.local.json'):
            self.assertFalse(mod.is_build_output(rel), rel)


if __name__ == '__main__':
    unittest.main()
