"""The existing Mac lsof reader; Linux reads belong to storage-lifecycle."""
import os
import subprocess

MAC_LSOF = ['/usr/sbin/lsof', '-n', '-P', '-w', '-F', 'pn']
MAC_SUDOERS_HINT = ('add "%s ALL=(root) NOPASSWD: /usr/sbin/lsof" with visudo -f /etc/sudoers.d/wt-reaper'
                    % os.environ.get('USER', 'drew'))


def _lsof(extra, use_sudo):
    """Run lsof; returns (stdout or None, used_sudo).

    Exit 1 with no output is normal for `-p` when those PIDs have exited;
    the full listing (no extra args) must produce output.
    """
    def usable(proc):
        return proc.returncode == 0 or (proc.returncode == 1 and (proc.stdout or extra))
    if use_sudo:
        proc = subprocess.run(['sudo', '-n'] + MAC_LSOF + extra, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=600)
        if usable(proc) and b'password' not in proc.stderr:
            return proc.stdout, True
    proc = subprocess.run(MAC_LSOF + extra, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=600)
    if usable(proc):
        return proc.stdout, False
    return None, False


def scan(use_sudo, process_table):
    """lsof snapshot, then lsof -p for PIDs that appeared, until none appear."""
    paths, seen, attempted = set(), set(), set()
    hint = ''
    extra = []
    for _ in range(6):
        out, used_sudo = _lsof(extra, use_sudo)
        if out is None:
            raise RuntimeError('lsof failed')
        if not used_sudo:
            hint = '; lsof needs root to see other accounts: ' + MAC_SUDOERS_HINT
        for line in out.decode('utf-8', 'surrogateescape').splitlines():
            if line.startswith('p'):
                seen.add(int(line[1:]))
            elif line.startswith('n/'):
                # lsof may append ' (...)' notes, but a path can itself contain
                # ' ('. Hold every candidate prefix; extra holds only skip more.
                name = line[1:]
                paths.add(name)
                cut = name.find(' (')
                while cut != -1:
                    paths.add(name[:cut])
                    cut = name.find(' (', cut + 1)
        missing = set(process_table()) - seen - attempted - {os.getpid()}
        if not missing:
            break
        attempted |= missing
        extra = ['-p', ','.join(str(p) for p in sorted(missing))]
    unreadable = sorted(set(process_table()) - seen - {os.getpid()})
    return paths, unreadable, hint

