"""Tests for git/worktree-reaper/wt-reaper against temporary repositories.

Each worktree in the fixture carries exactly one reason to be kept, or none.
One live run then checks every decision and the filesystem result.
"""

import json
import os
import re
import shlex
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


def run_reaper(root, *extra, derived=False):
    env = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
    # The derived passes default to this host's journey state and gate cache; a test names its own.
    extra = list(extra) if derived else ['--no-derived'] + list(extra)
    proc = subprocess.run([sys.executable, REAPER, '--root', root, '--no-log-file',
                           '--idle-hours', str(IDLE_HOURS)] + extra,
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
        self.write(self.repo, '.gitignore', 'node_modules/\n.env\ngenerated/\n.react-router/\npackages/sdk-email/\n')
        self.write(self.repo, 'a.txt', 'a\n')
        self.write(self.repo, 'packages/core/index.js', 'x\n')
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

        # Generated sources, and an ignored package directory left holding only build output.
        p['generated'] = f.add('generated')
        f.write(p['generated'], 'src/generated/build-stamp.ts', 'export const stamp = 1\n')
        f.write(p['generated'], '.react-router/types/app.ts', 'export {}\n')
        f.write(p['generated'], 'packages/sdk-email/node_modules/x/index.js', 'x\n')
        f.write(p['generated'], 'packages/sdk-email/dist/index.js', 'x\n')
        f.write(p['generated'], 'packages/sdk-email/.turbo/turbo-build.log', 'x\n')

        # The same ignored package directory with one evidence file in it stays.
        p['package_evidence'] = f.add('package_evidence')
        f.write(p['package_evidence'], 'packages/sdk-email/node_modules/x/index.js', 'x\n')
        f.write(p['package_evidence'], 'packages/sdk-email/notes.md', 'mine\n')

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

        p['nested_bare'] = f.add('nested_bare')
        git(['init', '-q', '--bare', os.path.join(p['nested_bare'], 'node_modules', 'mirror.git')], f.tmp)

        # Git accepts a bare repository whose objects/ is a symlink to a store elsewhere.
        p['nested_bare_link'] = f.add('nested_bare_link')
        mirror = os.path.join(p['nested_bare_link'], 'node_modules', 'mirror.git')
        git(['init', '-q', '--bare', mirror], f.tmp)
        store = os.path.join(p['nested_bare_link'], 'node_modules', 'store')
        os.rename(os.path.join(mirror, 'objects'), store)
        os.symlink('../store', os.path.join(mirror, 'objects'))

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

        # node_modules files hardlinked to a shared pnpm-style store outside the worktree.
        store = os.path.join(f.tmp, 'pnpm-store')
        os.makedirs(store)
        for name in ('hardlinked', 'hardlinked_written'):
            p[name] = f.add(name)
            f.write(store, name + '.js', 'module.exports = 1\n')
            os.makedirs(os.path.join(p[name], 'node_modules', 'pkg'))
            os.link(os.path.join(store, name + '.js'), os.path.join(p[name], 'node_modules', 'pkg', 'index.js'))

        time.sleep(IDLE_HOURS * 3600 + 1.0)

        # Another checkout's install links the same store files: their ctime moves, this tree is untouched.
        for name in ('hardlinked', 'hardlinked_written'):
            os.link(os.path.join(store, name + '.js'), os.path.join(store, name + '.other-install.js'))
        # A real write through the link moves its mtime (an hour ahead, as for 'recent').
        written = os.path.join(p['hardlinked_written'], 'node_modules', 'pkg', 'index.js')
        with open(written, 'a') as fh:
            fh.write('// patched\n')
        ahead = time.time() + 3600
        os.utime(written, (ahead, ahead))

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

    def test_generated_and_build_only_directories_are_build_output(self):
        self.assertRemoved('generated')

    def test_ignored_directory_with_other_files_keeps_the_tree(self):
        self.assertSkipped('package_evidence', 'ignored non-build files: packages/sdk-email')

    def test_hardlink_ctime_is_not_activity(self):
        # 2026-10-10: pnpm store links kept every worktree on beelink2 "modified 0.1h ago".
        self.assertRemoved('hardlinked')

    def test_write_through_a_hardlink_is_activity(self):
        self.assertSkipped('hardlinked_written', 'modified')

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

    def test_skip_nested_bare_repository_in_build_output(self):
        self.assertSkipped('nested_bare', 'nested git repository')
        self.assertSkipped('nested_bare_link', 'nested git repository')

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
        self.assertEqual(int(s['removed']), 7)  # merged, detached, pushed_unmerged, build_output, dry, hardlinked, generated
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
@unittest.skipUnless(SCAN_COMPLETE, NEEDS_SCAN)
class RecheckAfterScanTest(unittest.TestCase):
    """A file written during the final process scan must stop the removal."""

    def test_write_during_final_scan_skips(self):
        f = Fixture()
        self.addCleanup(f.cleanup)
        late = f.add('late')
        time.sleep(IDLE_HOURS * 3600 + 1.0)
        mod = load_reaper()
        real_scan = mod.scan_processes
        calls = []

        def scan_then_write(*a, **k):
            calls.append(1)
            held = real_scan(*a, **k)
            if len(calls) == 2:  # the recheck's first scan, after its first evaluate
                Fixture.write(late, '.env', 'TOKEN=1\n')
            return held

        mod.scan_processes = scan_then_write
        old_env = dict(os.environ)
        os.environ.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(old_env)))
        mod.main(['--root', f.root, '--no-log-file', '--idle-hours', str(IDLE_HOURS)])
        self.assertTrue(os.path.isfile(os.path.join(late, '.env')))


@unittest.skipIf(os.geteuid() == 0, 'wt-reaper refuses to run as root')
@unittest.skipUnless(SCAN_COMPLETE, NEEDS_SCAN)
class ScanLastTest(unittest.TestCase):
    """The last check before the remove must be a process scan."""

    def test_process_scan_is_last(self):
        f = Fixture()
        self.addCleanup(f.cleanup)
        path = f.add('gone')
        time.sleep(IDLE_HOURS * 3600 + 1.0)
        mod = load_reaper()
        order = []
        real_scan, real_eval, real_git = mod.scan_processes, mod.evaluate, mod.git

        def scan(*a, **k):
            order.append('scan')
            return real_scan(*a, **k)

        def ev(*a, **k):
            order.append('evaluate')
            return real_eval(*a, **k)

        def git(argv, *a, **k):
            if 'remove' in argv:
                order.append('remove')
            return real_git(argv, *a, **k)

        mod.scan_processes, mod.evaluate, mod.git = scan, ev, git
        old_env = dict(os.environ)
        os.environ.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(old_env)))
        mod.main(['--root', f.root, '--no-log-file', '--idle-hours', str(IDLE_HOURS)])
        self.assertFalse(os.path.isdir(path))
        self.assertEqual(order[order.index('remove') - 1], 'scan', order)
        self.assertEqual(order[-5:-1], ['evaluate', 'scan', 'evaluate', 'scan'], order)


class MacLsofParseTest(unittest.TestCase):
    """A path containing ' (' must still be held in full."""

    def test_parenthesized_path_is_held(self):
        mod = load_reaper()
        out = b'p42\nn/Users/me/tree (old)/src\nn/Users/me/x.db (deleted)\n'
        mod._lsof = lambda extra, use_sudo: (out, True)
        mod.process_table = lambda: {42: 'S', os.getpid(): 'R'}
        paths, unreadable, _ = mod._mac_scan(True)
        self.assertEqual(unreadable, [])
        self.assertTrue(mod.inside('/Users/me/tree (old)/src', '/Users/me/tree (old)'))
        self.assertIn('/Users/me/tree (old)/src', paths)
        self.assertIn('/Users/me/x.db', paths)


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


@unittest.skipUnless(SCAN_COMPLETE, NEEDS_SCAN)
class RecheckFetchTest(unittest.TestCase):
    """A remote branch deleted after the first pass must stop the removal."""

    def test_remote_branch_deleted_between_passes_skips(self):
        f = Fixture()
        self.addCleanup(f.cleanup)
        path = f.add('gone', detach=True)
        git(['checkout', '-q', '-b', 'tmp-feature'], path)
        f.write(path, 'e.txt', 'e\n')
        git(['add', '.'], path)
        git(['commit', '-qm', 'e'], path)
        git(['push', '-q', 'origin', 'HEAD:refs/heads/tmp-feature'], path)
        git(['checkout', '-q', '--detach'], path)
        git(['branch', '-D', 'tmp-feature'], path)
        time.sleep(IDLE_HOURS * 3600 + 1.0)
        mod = load_reaper()
        real_scan = mod.scan_processes
        calls = []

        def scan_then_delete(*a, **k):
            calls.append(1)
            if len(calls) == 1:
                # Delete on the remote side only; the local tracking ref goes stale.
                git(['--git-dir', f.remote, 'update-ref', '-d', 'refs/heads/tmp-feature'], f.tmp)
            return real_scan(*a, **k)

        mod.scan_processes = scan_then_delete
        old_env = dict(os.environ)
        os.environ.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(old_env)))
        mod.main(['--root', f.root, '--no-log-file', '--idle-hours', str(IDLE_HOURS)])
        self.assertTrue(os.path.isdir(path))


@unittest.skipUnless(sys.platform.startswith('linux'), 'Linux /proc walk')
class ScanConvergenceTest(unittest.TestCase):
    """A process that appears after the first /proc listing is still inspected."""

    def test_late_process_is_scanned(self):
        mod = load_reaper()
        tmp = os.path.realpath(tempfile.mkdtemp(prefix='wt-reaper-scan-'))
        self.addCleanup(shutil.rmtree, tmp, True)
        child = subprocess.Popen(['sleep', '60'], cwd=tmp)
        self.addCleanup(child.wait)
        self.addCleanup(child.kill)
        real_listdir = mod.os.listdir
        calls = []

        def listdir(path):
            entries = real_listdir(path)
            if path == '/proc':
                calls.append(1)
                if len(calls) == 1:
                    return [e for e in entries if e != str(child.pid)]
            return entries

        mod.os.listdir = listdir
        try:
            paths, _ = mod.proc_dump()
        finally:
            mod.os.listdir = real_listdir
        self.assertIn(tmp, paths)
        self.assertGreaterEqual(len(calls), 2)


@unittest.skipUnless(sys.platform.startswith('linux'), 'Linux /proc walk')
class UnixSocketTest(unittest.TestCase):
    """A bound Unix socket counts as a held path."""

    def test_bound_socket_path_is_held(self):
        mod = load_reaper()
        tmp = os.path.realpath(tempfile.mkdtemp(prefix='wt-reaper-sock-'))
        self.addCleanup(shutil.rmtree, tmp, True)
        sock = os.path.join(tmp, '.cache', 'svc.sock')
        os.makedirs(os.path.dirname(sock))
        child = subprocess.Popen(
            [sys.executable, '-c', 'import os,socket,sys,time; os.chdir("/"); s=socket.socket(socket.AF_UNIX); '
             's.bind(sys.argv[1]); s.listen(); print("ok", flush=True); time.sleep(60)', sock],
            stdout=subprocess.PIPE)
        self.addCleanup(child.stdout.close)
        self.addCleanup(child.wait)
        self.addCleanup(child.kill)
        child.stdout.readline()
        paths, _ = mod.proc_dump()
        self.assertIn(sock, paths)


    def test_socket_bound_after_cache_fill_is_held(self):
        mod = load_reaper()
        tmp = os.path.realpath(tempfile.mkdtemp(prefix='wt-reaper-sock2-'))
        self.addCleanup(shutil.rmtree, tmp, True)
        sock = os.path.join(tmp, '.cache', 'late.sock')
        os.makedirs(os.path.dirname(sock))
        cache = {}
        self.assertIsNotNone(mod._unix_sockets(os.getpid(), cache))
        child = subprocess.Popen(
            [sys.executable, '-c', 'import os,socket,sys,time; os.chdir("/"); s=socket.socket(socket.AF_UNIX); '
             's.bind(sys.argv[1]); s.listen(); print("ok", flush=True); time.sleep(60)', sock],
            stdout=subprocess.PIPE)
        self.addCleanup(child.stdout.close)
        self.addCleanup(child.wait)
        self.addCleanup(child.kill)
        child.stdout.readline()
        found = mod._proc_one(child.pid, mod._readlink('/proc/self/ns/mnt'), mod._mountinfo('self') or {}, {}, cache)
        self.assertIn(sock, found or [])


class DefaultBranchNameTest(unittest.TestCase):
    """A default branch with a slash is still recognized."""

    def test_slash_default(self):
        mod = load_reaper()
        self.assertTrue(mod.is_default_name('refs/remotes/origin/release/v1', 'release/v1'))
        self.assertTrue(mod.is_default_name('refs/remotes/origin/main', 'main'))
        self.assertFalse(mod.is_default_name('refs/remotes/origin/main', 'feat/x'))


@unittest.skipUnless(sys.platform.startswith('linux'), 'Linux /proc walk')
class DeletedSuffixTest(unittest.TestCase):
    """A directory literally named '... (deleted)' still counts as held."""

    def test_literal_deleted_name_is_held(self):
        mod = load_reaper()
        tmp = os.path.realpath(tempfile.mkdtemp(prefix='wt-reaper-del-'))
        self.addCleanup(shutil.rmtree, tmp, True)
        tree = os.path.join(tmp, 'tree (deleted)')
        os.makedirs(tree)
        child = subprocess.Popen([sys.executable, '-c', 'import time; print("ok", flush=True); time.sleep(60)'],
                                 cwd=tree, stdout=subprocess.PIPE)
        self.addCleanup(child.stdout.close)
        self.addCleanup(child.wait)
        self.addCleanup(child.kill)
        child.stdout.readline()
        found = mod._proc_one(child.pid, mod._readlink('/proc/self/ns/mnt'), mod._mountinfo('self') or {}, {}, {})
        self.assertIn(tree, found or [])


@unittest.skipUnless(sys.platform.startswith('linux'), 'Linux /proc walk')
class RelativeSocketTest(unittest.TestCase):
    """A socket bound by relative path has no known directory: the process is unreadable."""

    def test_relative_socket_makes_process_unreadable(self):
        mod = load_reaper()
        tmp = os.path.realpath(tempfile.mkdtemp(prefix='wt-reaper-rsock-'))
        self.addCleanup(shutil.rmtree, tmp, True)
        child = subprocess.Popen(
            [sys.executable, '-c', 'import os,socket,time; s=socket.socket(socket.AF_UNIX); '
             's.bind("rel.sock"); os.chdir("/"); s.listen(); print("ok", flush=True); time.sleep(60)'],
            cwd=tmp, stdout=subprocess.PIPE)
        self.addCleanup(child.stdout.close)
        self.addCleanup(child.wait)
        self.addCleanup(child.kill)
        child.stdout.readline()
        _, unreadable = mod.proc_dump()
        self.assertIn(child.pid, unreadable)


class MountTest(unittest.TestCase):
    """A mount point inside the worktree keeps it."""

    def test_mount_point_inside_skips(self):
        mod = load_reaper()
        tmp = os.path.realpath(tempfile.mkdtemp(prefix='wt-reaper-mnt-'))
        self.addCleanup(shutil.rmtree, tmp, True)
        mod.mount_points = lambda: {'/', os.path.join(tmp, 'node_modules')}
        with self.assertRaises(mod.Skip) as ctx:
            mod.check_no_mounts(tmp)
        self.assertIn('mount point inside', str(ctx.exception))
        mod.mount_points = lambda: {'/', os.path.dirname(tmp)}
        mod.check_no_mounts(tmp)

    def test_real_mount_table_is_read(self):
        mod = load_reaper()
        self.assertIn('/', mod.mount_points())


class ArgumentTest(unittest.TestCase):
    def test_rejects_non_finite_idle_hours(self):
        for value in ('nan', 'inf', '0', '-1'):
            proc = subprocess.run([sys.executable, REAPER, '--dry-run', '--no-log-file', '--idle-hours', value],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.assertEqual(proc.returncode, 2, value)


@unittest.skipUnless(SCAN_COMPLETE, NEEDS_SCAN)
class BareRepositoryTest(unittest.TestCase):
    """Linked worktrees of a bare repository under a root are in scope."""

    def test_bare_repo_worktree_is_found(self):
        f = Fixture()
        self.addCleanup(f.cleanup)
        bare = os.path.join(f.root, 'bare.git')
        git(['clone', '-q', '--bare', f.remote, bare], f.tmp)
        git(['--git-dir', bare, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'], f.tmp)
        git(['--git-dir', bare, 'fetch', '-q', 'origin'], f.tmp)
        linked = os.path.join(f.tmp, 'bare-linked')
        git(['--git-dir', bare, 'worktree', 'add', '-q', '--detach', linked, 'origin/main'], f.tmp)
        time.sleep(IDLE_HOURS * 3600 + 1.0)
        rows = run_reaper(f.root, '--dry-run')
        row = [r for r in rows if r.get('path') == linked]
        self.assertEqual(len(row), 1, rows)
        self.assertEqual(row[0]['decision'], 'would-remove', row)
        self.assertTrue(os.path.isdir(bare))


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


@unittest.skipUnless(sys.platform.startswith('linux'), 'the storage_lifecycle handoff is Linux-only')
# Linux only: on macOS the installer would boot out and replace the live com.drew.wt-reaper agent.
@unittest.skipUnless(sys.platform.startswith('linux'), 'runs the installer, which on macOS touches the live LaunchAgent')
class InstallerDefersToStorageLifecycleTest(unittest.TestCase):
    def test_install_skips_timer_where_storage_lifecycle_is_deployed(self):
        # tangle-tools#239: the dotfiles installer re-enabled wt-reaper.timer on
        # the GTR, beside the salvaging lifecycle that owns deletion there. GTR's
        # host config lists no tiers, so the lifecycle runs its default tiers,
        # worktrees included.
        installer = os.path.join(HERE, '..', 'git', 'worktree-reaper', 'install.sh')
        with tempfile.TemporaryDirectory() as home:
            hosts = os.path.join(home, '.local/share/tangle-tools/storage_lifecycle/hosts')
            os.makedirs(hosts)
            with open(os.path.join(hosts, 'testhost.json'), 'w') as fh:
                json.dump({'docker_cache_bytes': 1}, fh)
            shim = os.path.join(home, 'bin')
            os.makedirs(shim)
            with open(os.path.join(shim, 'hostname'), 'w') as fh:
                fh.write('#!/bin/sh\necho testhost\n')
            os.chmod(os.path.join(shim, 'hostname'), 0o755)
            env = dict(os.environ, HOME=home, PATH=shim + os.pathsep + os.environ['PATH'])
            proc = subprocess.run(['bash', installer], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn(b'storage_lifecycle runs the worktrees tier', proc.stdout)
            self.assertFalse(os.path.exists(os.path.join(home, '.local/bin/wt-reaper')))
            self.assertFalse(os.path.exists(os.path.join(home, '.config/systemd/user/wt-reaper.timer')))


class InstallOwnershipTest(unittest.TestCase):
    """install.sh leaves worktree removal to tangle-tools storage_lifecycle only where that host runs its
    worktrees tier; on the archive-less beelinks wt-reaper is the reaper (tangle-tools #948)."""

    INSTALL = os.path.join(HERE, '..', 'git', 'worktree-reaper', 'install.sh')

    def owns(self, config):
        home = tempfile.mkdtemp(prefix='wt-reaper-install-')
        self.addCleanup(shutil.rmtree, home, True)
        hosts = os.path.join(home, '.local', 'share', 'tangle-tools', 'storage_lifecycle', 'hosts')
        os.makedirs(hosts)
        if config is not None:
            with open(os.path.join(hosts, 'testhost.json'), 'w') as fh:
                json.dump(config, fh)
        shim = os.path.join(home, 'bin')
        os.makedirs(shim)
        with open(os.path.join(shim, 'hostname'), 'w') as fh:
            fh.write('#!/bin/sh\necho testhost\n')
        os.chmod(os.path.join(shim, 'hostname'), 0o755)
        with open(self.INSTALL) as fh:
            source = fh.read()
        func = source[source.index('lifecycle_owns_worktrees() {'):]
        func = func[:func.index('\n}\n') + 3]
        env = dict(os.environ, HOME=home, PATH=shim + os.pathsep + os.environ['PATH'])
        return subprocess.run(['bash', '-c', func + 'lifecycle_owns_worktrees'], env=env).returncode == 0

    def test_beelink_config_without_worktrees_tier_keeps_wt_reaper(self):
        self.assertFalse(self.owns({'tiers': ['docker-cache', 'docker-images', 'tmp'], 'floor_bytes': 1}))

    def test_default_tiers_include_worktrees(self):
        self.assertTrue(self.owns({'docker_cache_bytes': 1}))

    def test_explicit_worktrees_tier(self):
        self.assertTrue(self.owns({'tiers': ['worktrees', 'tmp']}))

    def test_no_host_config_keeps_wt_reaper(self):
        self.assertFalse(self.owns(None))


@unittest.skipUnless(SCAN_COMPLETE, NEEDS_SCAN)
class DerivedFilesTest(unittest.TestCase):
    """node_modules of merged, idle worktrees and journey raw recordings with outputs are derived."""

    @classmethod
    def setUpClass(cls):
        f = cls.f = Fixture()
        p = cls.paths = {}
        # Merged (HEAD is main) but dirty, so the tree itself stays and only node_modules may go.
        p['merged_dirty'] = f.add('merged_dirty')
        f.write(p['merged_dirty'], 'node_modules/x/index.js', 'x\n')
        f.write(p['merged_dirty'], 'packages/core/node_modules/y/index.js', 'y\n')
        f.write(p['merged_dirty'], 'a.txt', 'work in progress\n')
        # Not merged anywhere: its node_modules stays.
        p['unmerged'] = f.add('unmerged')
        f.write(p['unmerged'], 'c.txt', 'c\n')
        git(['add', 'c.txt'], p['unmerged'])
        git(['commit', '-qm', 'local only'], p['unmerged'])
        f.write(p['unmerged'], 'node_modules/x/index.js', 'x\n')
        # A journey run whose outputs exist, and an older run of the same journey whose outputs were replaced.
        state = cls.state = os.path.join(f.tmp, 'journeys-state')
        out = cls.out = os.path.join(f.tmp, 'code', '_wt', 'jw', 'journeys', 'out')
        cls.done_run = os.path.join(state, 'raw', 'j1-new-customer-2026-10-11T08-31-08-644Z', 'founder')
        cls.old_run = os.path.join(state, 'raw', 'j1-new-customer-2026-10-11T07-00-00-000Z', 'founder')
        for run in (cls.done_run, cls.old_run):
            for name in ('founder.webm', 'page@ab12.webm', 'trace.raw.zip', 'founder.clean.mp4', 'founder.highlights.srt'):
                f.write(run, name, 'v\n')
        f.write(out, 'j1-new-customer/timings.json', json.dumps({'journey': 'j1-new-customer', 'startedAt': '2026-10-11T08:31:08.644Z'}))
        f.write(out, 'j1-new-customer/video/founder-full.mp4', 'mp4\n')
        f.write(out, 'j1-new-customer/video/founder-trace.zip', 'scrubbed\n')
        time.sleep(IDLE_HOURS * 3600 + 1.0)
        cls.rows = run_reaper(f.root, '--dependency-idle-hours', str(IDLE_HOURS), '--journey-state', state,
                              '--journey-out', out, '--gate-cache', os.path.join(f.tmp, 'no-gate-cache'), derived=True)

    @classmethod
    def tearDownClass(cls):
        cls.f.cleanup()

    def test_merged_idle_worktree_loses_only_its_ignored_node_modules(self):
        wt = self.paths['merged_dirty']
        self.assertFalse(os.path.exists(os.path.join(wt, 'node_modules')))
        self.assertFalse(os.path.exists(os.path.join(wt, 'packages', 'core', 'node_modules')))
        with open(os.path.join(wt, 'a.txt')) as fh:
            self.assertEqual(fh.read(), 'work in progress\n')
        self.assertTrue(os.path.isfile(os.path.join(wt, 'packages', 'core', 'index.js')))
        removed = [r for r in self.rows if r.get('decision') == 'remove-derived' and r.get('rule') == 'node_modules']
        self.assertEqual(sorted(r['path'] for r in removed),
                         sorted([os.path.join(wt, 'node_modules'), os.path.join(wt, 'packages', 'core', 'node_modules')]))

    def test_unmerged_worktree_keeps_node_modules(self):
        self.assertTrue(os.path.isfile(os.path.join(self.paths['unmerged'], 'node_modules', 'x', 'index.js')))

    def test_journey_raw_goes_only_when_its_own_outputs_exist(self):
        for name in ('founder.webm', 'page@ab12.webm', 'trace.raw.zip'):
            self.assertFalse(os.path.exists(os.path.join(self.done_run, name)), name)
        for name in ('founder.clean.mp4', 'founder.highlights.srt'):
            self.assertTrue(os.path.isfile(os.path.join(self.done_run, name)), name)
        for name in ('founder.webm', 'page@ab12.webm', 'trace.raw.zip', 'founder.clean.mp4'):
            self.assertTrue(os.path.isfile(os.path.join(self.old_run, name)), name)


class GateCheckoutTest(unittest.TestCase):
    """A beelink-gate checkout beyond the configured count goes only while its lock is free."""

    def test_stale_gate_checkout_is_removed_and_a_locked_one_stays(self):
        f = Fixture()
        try:
            cache = os.path.join(f.tmp, 'gate')
            for name in ('repo', 'repo@1', 'repo@2', 'repo@3', 'repo@light'):
                f.write(os.path.join(cache, 'github.com', 'owner', name), 'file.txt', 'x\n')
            locks = os.path.join(cache, '.locks')
            os.makedirs(locks)
            held = os.path.join(locks, 'github.com-owner-repo@3.lock')
            holder = subprocess.Popen(
                [sys.executable, '-c', 'import fcntl,sys,time; fh=open(sys.argv[1],"w"); fcntl.flock(fh, fcntl.LOCK_EX); '
                 'print("held", flush=True); time.sleep(60)', held], stdout=subprocess.PIPE)
            f.procs.append(holder)
            self.assertEqual(holder.stdout.readline().strip(), b'held')
            rows = run_reaper(f.root, '--gate-cache', cache, '--gate-checkouts', '2', '--journey-state',
                              os.path.join(f.tmp, 'none'), '--dependency-idle-hours', '1000', derived=True)
            base = os.path.join(cache, 'github.com', 'owner')
            self.assertFalse(os.path.exists(os.path.join(base, 'repo@2')))
            for name in ('repo', 'repo@1', 'repo@3', 'repo@light'):
                self.assertTrue(os.path.isdir(os.path.join(base, name)), name)
            kept = [r for r in rows if r.get('rule') == 'gate-checkout' and r.get('decision') == 'keep-derived']
            self.assertEqual([r['path'] for r in kept], [os.path.join(base, 'repo@3')])
        finally:
            f.cleanup()


@unittest.skipUnless(SCAN_COMPLETE, NEEDS_SCAN)
class KeptPathTest(unittest.TestCase):
    """Nothing under a --keep path is touched: Discovery's run roots are retired through the Lab."""

    def test_a_worktree_under_a_kept_path_is_neither_removed_nor_stripped(self):
        f = Fixture()
        try:
            control = f.add('control')
            kept = os.path.join(f.root, '_runs', 'trace-coverage-20261004', 'tree')
            os.makedirs(os.path.dirname(kept))
            git(['worktree', 'add', '-q', '-b', 'kept', kept, 'main'], f.repo)
            for wt in (control, kept):
                f.write(wt, 'node_modules/x/index.js', 'x\n')
            time.sleep(IDLE_HOURS * 3600 + 1.0)
            rows = run_reaper(f.root, '--dependency-idle-hours', str(IDLE_HOURS), '--keep', os.path.join(f.root, '_runs'),
                              '--journey-state', os.path.join(f.tmp, 'none'), '--gate-cache', os.path.join(f.tmp, 'none'),
                              derived=True)
            self.assertFalse(os.path.exists(control), 'the control tree is reaped as usual')
            self.assertTrue(os.path.isfile(os.path.join(kept, 'node_modules', 'x', 'index.js')))
            skip = [r for r in rows if r.get('decision') == 'skip' and r.get('path') == kept]
            self.assertTrue(skip and 'which its owner retires' in skip[0]['reason'], skip)
        finally:
            f.cleanup()


@unittest.skipUnless(sys.platform.startswith('linux'), 'the store prune runs on Linux hosts only')
class PnpmStorePruneTest(unittest.TestCase):
    """The store prune runs only in a quiet window while it holds every gate slot, and never waits for one."""

    def setUp(self):
        self.f = Fixture()
        t = self.f.tmp
        self.store = os.path.join(t, 'store')
        os.makedirs(os.path.join(self.store, 'v10', 'files'))
        self.releases = os.path.join(t, 'corepack')
        self.release('10.33.4', {'pnpm': 'bin/pnpm.cjs', 'pnpx': 'bin/pnpx.cjs'})
        self.calls = os.path.join(t, 'node-calls')
        bindir = os.path.join(t, 'bin')
        # The fake prune records its arguments, then tries the slots a gate would create next: none may be free.
        self.f.write(bindir, 'node', '#!/bin/sh\necho "$@" >> %s\n%s -c %s %s >> %s\n' % (
            self.calls, sys.executable, shlex.quote(
                'import fcntl,os,sys\n'
                'for n in ("slot-2.lock", "slot-9.lock", "light-slot-1.lock"):\n'
                '    fd = os.open(os.path.join(sys.argv[1], n), os.O_RDWR | os.O_CREAT)\n'
                '    try:\n'
                '        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB); print("FREE", n)\n'
                '    except OSError:\n'
                '        pass\n'), os.path.join(t, 'gate', '.locks'), self.calls))
        os.chmod(os.path.join(bindir, 'node'), 0o755)
        self.proc = os.path.join(t, 'proc')
        os.makedirs(self.proc)
        self.locks = os.path.join(t, 'gate', '.locks')
        os.makedirs(self.locks)
        # Only slot-0 and light-slot-0 exist, as on a host where one gate of each class has run.
        for name in ('slot-0.lock', 'light-slot-0.lock', 'github.com-owner-repo.lock'):
            open(os.path.join(self.locks, name), 'w').close()
        self.age_locks()
        self.env_path = bindir + os.pathsep + os.environ['PATH']

    def tearDown(self):
        self.f.cleanup()

    def release(self, version, bins):
        """A corepack cache entry laid out as the published package: package.json names the pnpm entry."""
        self.f.write(self.releases, version + '/package.json', json.dumps({'name': 'pnpm', 'version': version, 'bin': bins}))
        entry = bins if isinstance(bins, str) else bins['pnpm']
        self.f.write(self.releases, version + '/' + entry, '// fake pnpm\n')

    def age_locks(self, seconds=3600):
        for name in os.listdir(self.locks):
            os.utime(os.path.join(self.locks, name), (time.time() - seconds, time.time() - seconds))

    def reap(self, hour=12, quiet_load=100000):
        # POSIX TZ "TST<n>" is UTC minus n hours (the name needs three letters), so this fixes the reaper's local hour.
        tz = 'TST%d' % (time.gmtime().tm_hour - hour)
        env = dict(os.environ, PATH=self.env_path, TZ=tz, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
        proc = subprocess.run([sys.executable, REAPER, '--root', self.f.root, '--no-log-file', '--idle-hours', '1000',
                               '--dependency-idle-hours', '1000', '--journey-state', os.path.join(self.f.tmp, 'none'),
                               '--gate-cache', os.path.join(self.f.tmp, 'gate'), '--pnpm-store', self.store,
                               '--pnpm-releases', self.releases, '--pnpm-stamp', os.path.join(self.f.tmp, 'stamp'),
                               '--quiet-load', str(quiet_load), '--proc', self.proc],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        self.assertEqual(proc.returncode, 0, proc.stderr.decode())
        return [r for r in parse(proc.stdout.decode()) if r.get('rule') == 'pnpm-store']

    def pruned(self):
        if not os.path.exists(self.calls):
            return False
        with open(self.calls) as fh:
            self.assertEqual(fh.read().split(), [os.path.join(self.releases, '10.33.4', 'bin', 'pnpm.cjs'),
                                                 'store', 'prune', '--store-dir', self.store])
        os.remove(self.calls)
        return True

    def test_prunes_only_with_every_slot_free_and_at_most_once_a_day(self):
        holder = subprocess.Popen(
            [sys.executable, '-c', 'import fcntl,sys,time; fh=open(sys.argv[1],"a"); fcntl.flock(fh, fcntl.LOCK_EX); '
             'print("held", flush=True); time.sleep(60)', os.path.join(self.locks, 'light-slot-0.lock')], stdout=subprocess.PIPE)
        self.f.procs.append(holder)
        self.assertEqual(holder.stdout.readline().strip(), b'held')
        rows = self.reap()
        self.assertFalse(self.pruned(), 'no prune while a gate holds a slot')
        self.assertIn('a gate holds light-slot-0.lock', rows[0]['reason'])
        holder.kill()
        holder.wait()
        rows = self.reap()
        self.assertTrue(self.pruned())
        self.assertEqual(rows[0]['decision'], 'remove-derived')
        self.reap()
        self.assertFalse(self.pruned(), 'at most once a day')

    def test_each_store_version_is_pruned_by_the_newest_pnpm_script_of_its_major(self):
        # pnpm 11 names bin/pnpm.mjs; until 2026-10-14 the reaper looked only for dist/pnpm.cjs and never pruned v11.
        os.makedirs(os.path.join(self.store, 'v11', 'files'))
        os.makedirs(os.path.join(self.store, 'v12', 'files'))
        self.release('11.17.0', {'pnpm': 'bin/pnpm.mjs'})
        self.release('11.25.0', {'pnpm': 'bin/pnpm.mjs'})
        self.release('11.9.0', {'pnpm': 'bin/pnpm.mjs'})
        self.release('12.6.0', {'pnpm': 'pnpm'})  # a native binary: node cannot run it
        rows = {r['path']: r for r in self.reap()}
        with open(self.calls) as fh:
            calls = [line.split() for line in fh if 'store' in line]
        self.assertEqual(calls, [
            [os.path.join(self.releases, '10.33.4', 'bin', 'pnpm.cjs'), 'store', 'prune', '--store-dir', self.store],
            [os.path.join(self.releases, '11.25.0', 'bin', 'pnpm.mjs'), 'store', 'prune', '--store-dir', self.store]])
        self.assertEqual(rows[os.path.join(self.store, 'v11')]['decision'], 'remove-derived')
        self.assertIn('bytes', rows[os.path.join(self.store, 'v11')])
        self.assertEqual(rows[os.path.join(self.store, 'v12')]['decision'], 'keep-derived')

    def test_a_native_pnpm_binary_is_not_a_release_node_can_run(self):
        self.release('12.6.0', {'pnpm': 'pnpm'})
        self.assertIsNone(load_reaper().pnpm_release(self.releases, '12'))
        self.release('12.7.0', 'bin/pnpm.mjs')  # a string bin names the pnpm entry too
        self.assertEqual(load_reaper().pnpm_release(self.releases, '12'),
                         os.path.join(self.releases, '12.7.0', 'bin', 'pnpm.mjs'))

    def test_a_release_whose_manifest_points_outside_it_is_not_run(self):
        os.makedirs(os.path.join(self.store, 'v11', 'files'))
        self.f.write(self.releases, '11.25.0/package.json', json.dumps({'bin': {'pnpm': '../10.33.4/bin/pnpm.cjs'}}))
        rows = {r['path']: r for r in self.reap()}
        self.assertEqual(rows[os.path.join(self.store, 'v11')]['reason'], 'no node or no pnpm release for this store version')

    def test_a_gate_that_started_recently_or_a_running_install_keeps_the_store_until_overnight(self):
        self.age_locks(5 * 60)
        rows = self.reap()
        self.assertFalse(self.pruned(), 'a gate lock touched 5 minutes ago')
        self.assertIn('not quiet', rows[0]['reason'])
        self.age_locks()
        rows = self.reap(quiet_load=0.0001)
        self.assertFalse(self.pruned(), 'load over the limit')
        self.assertIn('not quiet', rows[0]['reason'])
        self.f.write(self.proc, '4242/cmdline', '\0'.join(['node', '/x/pnpm/dist/pnpm.cjs', 'install', '--frozen-lockfile']) + '\0')
        self.assertIn('pnpm install running', self.reap()[0]['reason'])
        self.assertFalse(self.pruned())
        os.remove(os.path.join(self.proc, '4242', 'cmdline'))
        self.age_locks(60)
        self.reap(hour=2, quiet_load=0.0001)
        self.assertTrue(self.pruned(), 'overnight is quiet whatever the load and the last gate')


if __name__ == '__main__':
    unittest.main()
