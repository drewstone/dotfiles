#!/usr/bin/env bash
# Host admission policy, bundled into immutable gates. Running commands never
# recheck this owner: a release hold stops new work and lets admitted work finish.
release_priority_reason() {
  python3 - "$(limits_file)" "$1" <<'PYTHON'
import fnmatch
import os
from pathlib import Path
import stat
import sys
import time

limits, host = Path(sys.argv[1]), sys.argv[2]
def held(reason):
    print(reason)
    raise SystemExit(3)
try:
    try:
        info = limits.lstat()
    except FileNotFoundError:
        info = None
    if info is not None:
        if not stat.S_ISREG(info.st_mode) or info.st_size > 65536:
            held('release priority limits file is ambiguous')
        with limits.open() as source:
            opened = os.fstat(source.fileno())
            if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                held('release priority limits changed while opening')
            lines = source.read(65537).splitlines()
        if sum(len(line) + 1 for line in lines) > 65536:
            held('release priority limits exceed read bound')
        entries = [line for line in lines
                   if line.lstrip().startswith('release_critical')]
        if entries:
            if len(entries) != 1 or entries[0] not in ('release_critical=0', 'release_critical=1'):
                held('release_critical is malformed or duplicated')
            if entries[0] == 'release_critical=1':
                held('release_critical host hold; release owner clears only after publisher terminal')
    # Native systemd membership avoids argv/env reads and a duplicate host CPU
    # scan. The runner service owns its Worker PID. The persistent key above
    # covers the Build-to-publisher gap, queued publishers and ambiguous exits.
    root = Path('/sys/fs/cgroup/deploy.slice/deploy-runners.slice')
    deadline = time.monotonic() + 0.25
    if not stat.S_ISDIR(root.lstat().st_mode):
        held('release runner cgroup root is ambiguous')
    groups = []
    for index, entry in enumerate(root.iterdir()):
        if index >= 128 or time.monotonic() > deadline:
            held('release runner cgroup inventory exceeds bound')
        if fnmatch.fnmatchcase(entry.name, f'actions.runner.*.release-{host}-adc-*.service'):
            groups.append(entry)
    if len(groups) > 16:
        held('release runner cgroup inventory exceeds bound')
    for group in groups:
        pids = (group / 'cgroup.procs').read_text().split()
        if len(pids) > 1024:
            held('release runner process inventory exceeds bound')
        for pid in pids:
            if time.monotonic() > deadline:
                held('release runner visibility budget exhausted')
            try:
                comm = Path('/proc', pid, 'comm').read_text().strip()
                if comm != 'Runner.Worker':
                    continue
                member = Path('/proc', pid, 'cgroup').read_text()
            except FileNotFoundError:
                continue
            expected = '/' + str(group.relative_to('/sys/fs/cgroup'))
            memberships = [line[3:] for line in member.splitlines() if line.startswith('0::')]
            if len(memberships) != 1:
                held('release Worker cgroup identity is ambiguous')
            if memberships[0] == expected or memberships[0].startswith(expected + '/'):
                held('native release Runner.Worker active on this host')
except (OSError, ValueError) as error:
    held(f'release priority evidence unavailable ({type(error).__name__})')
PYTHON
}

admit_release_priority() {
  local reason
  reason=$(release_priority_reason "$1") || tempfail "$(utc_in_minutes 5)" "$1 $reason"
}

# Windows owns the update policy; WSL owns the local clock and time-zone rules.
# Check again after waiting for the repo lock, before any checkout is touched.
# A gate admitted before the window keeps running, including its install.
check_update_window() {
  python3 - "$@" <<'PY'
from datetime import datetime, time, timedelta, timezone
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

host, raw_day, raw_hour = sys.argv[1:4]
try:
    day, hour = int(raw_day), int(raw_hour)
    if not 0 <= day <= 7 or not 0 <= hour <= 23:
        raise ValueError("day or hour out of range")
    if len(sys.argv) > 4:
        zone = ZoneInfo(sys.argv[4])
    elif os.environ.get("TZ"):
        zone = ZoneInfo(os.environ["TZ"])
    else:
        with Path("/etc/localtime").open("rb") as zonefile:
            zone = ZoneInfo.from_file(zonefile)
    now = (datetime.fromisoformat(sys.argv[5].replace("Z", "+00:00"))
           if len(sys.argv) > 5 else datetime.now(timezone.utc))
    if now.tzinfo is None:
        raise ValueError("probe time requires a UTC offset")
    now = now.astimezone(timezone.utc)
except (OSError, ValueError, IndexError) as exc:
    print(f"beelink-gate: cannot evaluate Windows Update window: {exc}", file=sys.stderr)
    sys.exit(2)

local_day = now.astimezone(zone).date()
for offset in range(-7, 8):
    candidate = local_day + timedelta(days=offset)
    # Registry day 0 is daily; 1=Sunday through 7=Saturday.
    if day and candidate.isoweekday() % 7 + 1 != day:
        continue
    scheduled_local = datetime.combine(candidate, time(hour), zone)
    scheduled = scheduled_local.astimezone(timezone.utc)
    start = scheduled - timedelta(minutes=60)
    end = scheduled + timedelta(minutes=30)
    if start <= now < end:
        next_local = end.astimezone(zone)
        print(
            f"beelink-gate: REFUSED {host} Windows Update is scheduled "
            f"{scheduled.astimezone(zone):%A %Y-%m-%d %H:%M %Z}; "
            f"new gates are blocked from {start.astimezone(zone):%Y-%m-%d %H:%M %Z} "
            f"until {next_local:%Y-%m-%d %H:%M %Z}; "
            f"next allowed {next_local:%Y-%m-%d %H:%M %Z} "
            f"({end:%Y-%m-%d %H:%M} UTC)",
            file=sys.stderr,
        )
        print(f"{end:%Y-%m-%dT%H:%M:%SZ}")
        sys.exit(3)
PY
}

# Starts only outside the update window; inside it, a TEMPFAIL until it ends.
admit_window() {
  local next rc
  next=$(check_update_window "$@"); rc=$?
  case "$rc" in
    0) ;;
    3) tempfail "$next" "$1 is in its Windows Update window" ;;
    *) exit "$rc" ;;
  esac
}
