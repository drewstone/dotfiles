"""Tests for `hostlab reap`, `extend` and the free-space refusal.

Fake run dirs stand in for VMs: a `sleep` process plays qemu, and the caller
file names a live or an exited process. One reap pass checks every decision
and the filesystem result. Linux only, because the reaper reads /proc.
"""

import os
import shutil
import subprocess
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
HOSTLAB = os.path.join(HERE, '..', 'claude', 'tools', 'hostlab')


def proc_start(pid):
    with open('/proc/%d/stat' % pid) as f:
        return f.read().rsplit(') ', 1)[1].split()[19]


def alive(pid):
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    # A zombie child still answers kill -0 until it is reaped.
    with open('/proc/%d/stat' % pid) as f:
        return f.read().rsplit(') ', 1)[1].split()[0] != 'Z'


@unittest.skipUnless(os.path.isdir('/proc/self'), 'hostlab reap reads /proc')
class HostlabReapTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='hostlab-reap-')
        self.home = os.path.join(self.tmp, 'cache')
        self.runs = os.path.join(self.home, 'runs')
        self.archive = os.path.join(self.tmp, 'archive')
        os.makedirs(self.runs)
        self.procs = []
        exited = subprocess.Popen(['true'])
        exited.wait()
        self.dead_pid = exited.pid

    def tearDown(self):
        for p in self.procs:
            if p.poll() is None:
                p.kill()
            p.wait()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def env(self, **extra):
        env = dict(os.environ, HOSTLAB_HOME=self.home, HOSTLAB_ARCHIVE=self.archive)
        env.update(extra)
        return env

    def hostlab(self, *args, **env):
        return subprocess.run([HOSTLAB] + list(args), env=self.env(**env), capture_output=True, text=True)

    def qemu(self):
        p = subprocess.Popen(['sleep', '600'])
        self.procs.append(p)
        return p

    def run_dir(self, name, keep, expires, caller, qemu_pid):
        d = os.path.join(self.runs, name)
        os.makedirs(d)
        files = {'owner': 'test %s\n' % name, 'keep': '%d\n' % keep, 'expires': '%s\n' % expires,
                 'qemu.pid': '%d\n' % qemu_pid}
        if caller is not None:
            files['caller'] = caller + '\n'
        for k, v in files.items():
            with open(os.path.join(d, k), 'w') as f:
                f.write(v)
        return d

    def test_one_reap_pass_decides_every_run(self):
        now = int(time.time())
        me = '%d %s' % (os.getpid(), proc_start(os.getpid()))
        gone = '%d 1' % self.dead_pid
        q = {n: self.qemu() for n in ('expired', 'kept', 'orphan', 'active', 'legacy')}
        self.run_dir('expired', 1, now - 10, gone, q['expired'].pid)
        self.run_dir('kept', 1, now + 3600, gone, q['kept'].pid)
        self.run_dir('orphan', 0, 'none', gone, q['orphan'].pid)
        self.run_dir('active', 0, 'none', me, q['active'].pid)
        legacy = self.run_dir('legacy', 1, now + 3600, None, q['legacy'].pid)
        os.remove(os.path.join(legacy, 'expires'))
        self.run_dir('dead-qemu', 1, now + 3600, gone, self.dead_pid)
        old = os.path.join(self.archive, 'old-run')
        manual = os.path.join(self.archive, 'hostlab-orphans-manual')
        os.makedirs(old)
        os.makedirs(manual)
        with open(os.path.join(old, 'reaped'), 'w') as f:
            f.write('expired\n')
        stale = time.time() - 20 * 86400
        os.utime(os.path.join(old, 'reaped'), (stale, stale))

        r = self.hostlab('reap')
        self.assertEqual(r.returncode, 0, r.stderr)

        def reason(name):
            with open(os.path.join(self.archive, name, 'reaped')) as f:
                return f.read().split(' at ')[0]

        self.assertEqual(reason('expired'), 'expired')
        self.assertEqual(reason('orphan'), 'caller exited')
        self.assertEqual(reason('dead-qemu'), 'qemu not running')
        for name in ('expired', 'orphan'):
            self.assertFalse(alive(q[name].pid), name + ' qemu still running')
            self.assertFalse(os.path.exists(os.path.join(self.runs, name)))
        for name in ('kept', 'active', 'legacy'):
            self.assertTrue(alive(q[name].pid), name + ' qemu was stopped')
            self.assertTrue(os.path.isdir(os.path.join(self.runs, name)), name + ' run dir moved')
        with open(os.path.join(legacy, 'expires')) as f:
            self.assertAlmostEqual(int(f.read()), now + 7200, delta=120)
        with open(os.path.join(legacy, 'owner')) as f:
            self.assertIn('unrecorded', f.read())
        self.assertFalse(os.path.exists(old), 'archive entry older than 14 days kept')
        self.assertTrue(os.path.isdir(manual), 'archive entry without a reaped file pruned')
        self.assertIn('caller exited', open(os.path.join(self.home, 'reap.log')).read())

    def test_unmounted_archive_drive_keeps_the_run_on_disk(self):
        # A missing drive leaves its mount point as a plain directory on root.
        mount = os.path.join(self.tmp, 'drive')
        os.makedirs(mount)
        self.run_dir('dead-qemu', 1, int(time.time()) + 3600, '%d 1' % self.dead_pid, self.dead_pid)
        r = self.hostlab('reap', HOSTLAB_ARCHIVE_MOUNT=mount, HOSTLAB_ARCHIVE=os.path.join(mount, 'archive'))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.isdir(os.path.join(self.runs, 'dead-qemu')), 'run moved or deleted')
        self.assertFalse(os.path.exists(os.path.join(mount, 'archive')), 'archive created on the root disk')
        self.assertIn('not mounted', r.stdout)

    def test_unwritable_archive_deletes_the_run(self):
        self.run_dir('dead-qemu', 1, int(time.time()) + 3600, '%d 1' % self.dead_pid, self.dead_pid)
        r = self.hostlab('reap', HOSTLAB_ARCHIVE='/proc/hostlab-archive')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.runs, 'dead-qemu')))
        self.assertIn('not writable', r.stdout)

    def test_extend_moves_expiry_and_rejects_bad_durations(self):
        d = self.run_dir('vm', 0, 'none', '%d 1' % self.dead_pid, self.dead_pid)
        r = self.hostlab('extend', 'vm', '3h')
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(os.path.join(d, 'expires')) as f:
            self.assertAlmostEqual(int(f.read()), int(time.time()) + 3 * 3600, delta=60)
        with open(os.path.join(d, 'keep')) as f:
            self.assertEqual(f.read().strip(), '1')
        bad = self.hostlab('extend', 'vm', '3 hours')
        self.assertNotEqual(bad.returncode, 0)
        self.assertIn('bad duration', bad.stderr)

    def test_boot_refuses_under_100_gb_free(self):
        shm = '/dev/shm'
        st = os.statvfs(shm) if os.path.isdir(shm) else None
        if st is None or st.f_bavail * st.f_frsize >= 100 * 2**30:
            self.skipTest('needs a filesystem with under 100 GB free')
        home = tempfile.mkdtemp(prefix='hostlab-refuse-', dir=shm)
        try:
            r = subprocess.run([HOSTLAB, 'run', '--', 'true'], env=dict(os.environ, HOSTLAB_HOME=home),
                               capture_output=True, text=True, timeout=30)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('a VM needs 100G', r.stderr)
            self.assertEqual(os.listdir(os.path.join(home, 'runs')), [])
        finally:
            shutil.rmtree(home, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
