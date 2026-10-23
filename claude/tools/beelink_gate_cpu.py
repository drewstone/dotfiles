"""Read-only, bounded host CPU attribution for beelink-gate's receipt report.

Process accounting is a lower bound: exited processes cannot be sampled. Cgroup
counters retain their CPU use, so report those alongside the process sample.
No command arguments, cwd or user details are read or retained. The shell supplies
only its own admission measurement through a dedicated environment field.
"""
import collections
import datetime as dt
import json
import os
from pathlib import Path
import stat
import time

SAMPLE_SECONDS = 2.0
BUDGET_SECONDS = 10.0
PROC = Path('/proc')
CGROUP = Path('/sys/fs/cgroup')


def read_text(path):
    try:
        return path.read_text().strip()
    except (OSError, ValueError):
        return None


def io_weight_snapshot(path):
    try:
        return {'state': 'present', 'value': path.read_text().strip()}
    except FileNotFoundError:
        return {'state': 'absent', 'value': None}
    except (OSError, ValueError) as error:
        return {'state': 'unreadable', 'value': None, 'error': type(error).__name__}


def pressure(path):
    value = read_text(path)
    result = {}
    for line in (value or '').splitlines():
        try:
            name, *fields = line.split()
            result[name] = {key: float(value) for key, value in
                            (field.split('=', 1) for field in fields)}
        except (ValueError, TypeError):
            return None
    return result or None


def io_counters(path):
    raw = read_text(path)
    if raw is None:
        return None
    result = {}
    try:
        for line in raw.splitlines():
            device, *fields = line.split()
            major, minor = device.split(':')
            if not major.isdigit() or not minor.isdigit():
                return None
            values = {key: int(value) for key, value in
                      (field.split('=', 1) for field in fields)}
            if any(value < 0 for value in values.values()):
                return None
            result[device] = values
    except (ValueError, TypeError):
        return None
    return result


def io_delta(before, after):
    if before is None or after is None:
        return None
    result = {}
    for device in before.keys() | after.keys():
        previous, current = before.get(device, {}), after.get(device, {})
        fields = {}
        for key in previous.keys() | current.keys():
            value = current.get(key)
            start = previous.get(key, 0)
            if value is None or value < start:
                return None
            fields[key] = value - start
        result[device] = fields
    return result


def process_snapshot(deadline):
    rows = {}
    counts = collections.Counter()
    for path in PROC.iterdir():
        if not path.name.isdigit():
            continue
        if time.monotonic() >= deadline:
            counts['budget_exhausted'] += 1
            break
        counts['processes_seen'] += 1
        stat = read_text(path / 'stat')
        cgroup = read_text(path / 'cgroup')
        if stat is None or cgroup is None:
            counts['unreadable_or_exited'] += 1
            continue
        try:
            end = stat.rindex(')')
            fields = stat[end + 2:].split()
            group = next(line.split(':', 2)[2] for line in cgroup.splitlines()
                         if line.startswith('0::'))
            if not group.startswith('/') or '..' in Path(group).parts:
                raise ValueError('invalid cgroup')
            rows[int(path.name)] = {'start_ticks': int(fields[19]),
                                    'ticks': int(fields[11]) + int(fields[12]),
                                    'comm': stat[stat.index('(') + 1:end][:64],
                                    'cgroup': group}
        except (ValueError, IndexError, StopIteration):
            counts['invalid_or_unsupported'] += 1
    counts['processes_read'] = len(rows)
    return rows, dict(counts)


def group_snapshot(groups, deadline):
    # Read only groups the process sample encountered, plus their ancestors.
    names = {'/', '/beelinkgate.slice',
             '/beelinkgate.slice/beelinkgate-normal.slice',
             '/beelinkgate.slice/beelinkgate-dev.slice',
             '/beelink-gate', '/beelink-gate-dev',
             '/deploy.slice', '/deploy.slice/deploy-runners.slice'}
    for name in groups:
        path = Path(name)
        names.update(str(parent) for parent in (path, *path.parents))
    result = {}
    counts = collections.Counter()
    for name in sorted(names):
        if time.monotonic() >= deadline:
            counts['budget_exhausted'] += 1
            break
        path = CGROUP / name.lstrip('/')
        counts['groups_seen'] += 1
        try:
            identity = path.stat().st_ino
            raw = read_text(path / 'cpu.stat')
            values = dict(line.split() for line in (raw or '').splitlines())
            io_weight = io_weight_snapshot(path / 'io.weight')
            row = {'identity': identity,
                            'usage_usec': int(values['usage_usec']),
                            'throttled_usec': int(values.get('throttled_usec', 0)),
                            'cpu_max': read_text(path / 'cpu.max'),
                            'cpu_weight': read_text(path / 'cpu.weight'),
                            'cgroup_events': read_text(path / 'cgroup.events'),
                            'memory_current_bytes': read_text(path / 'memory.current'),
                            'memory_max_bytes': read_text(path / 'memory.max'),
                            'memory_events': read_text(path / 'memory.events'),
                            'cpuset_cpus_effective': read_text(path / 'cpuset.cpus.effective'),
                            'cpu_pressure': pressure(path / 'cpu.pressure'),
                            'io_weight': io_weight['value'],
                            'io_weight_state': io_weight['state'],
                            'io_pressure': pressure(path / 'io.pressure'),
                            'io_counters': io_counters(path / 'io.stat')}
            if path.stat().st_ino != identity:
                counts['identity_changed_during_read'] += 1
                continue
            result[name] = row
        except (OSError, KeyError, ValueError):
            counts['unreadable_or_removed'] += 1
    counts['groups_read'] = len(result)
    return result, dict(counts)


def thread_snapshot(processes, deadline):
    by_process = {}
    by_group = collections.defaultdict(collections.Counter)
    counts = collections.Counter()
    for pid, process in processes.items():
        states = collections.Counter()
        path = PROC / str(pid)
        stat = read_text(path / 'stat')
        try:
            if stat is None or int(stat[stat.rindex(')') + 2:].split()[19]) != process['start_ticks']:
                counts['processes_exited_or_reused'] += 1
                continue
            tasks = (path / 'task').iterdir()
            for task in tasks:
                if time.monotonic() >= deadline:
                    counts['budget_exhausted'] += 1
                    return by_process, by_group, dict(counts)
                counts['threads_seen'] += 1
                value = read_text(task / 'stat')
                if value is None:
                    counts['unreadable_or_exited'] += 1
                    continue
                state = value[value.rindex(')') + 2:].split()[0]
                states[state] += 1
                counts['threads_read'] += 1
        except (OSError, ValueError, IndexError):
            counts['unreadable_or_exited'] += 1
            continue
        by_process[pid] = states
        by_group[process['cgroup']].update(states)
    return by_process, by_group, dict(counts)


def cpu_ticks():
    value = read_text(PROC / 'stat')
    try:
        fields = [int(field) for field in value.splitlines()[0].split()[1:9]]
        return sum(fields), fields[3] + fields[4]
    except (AttributeError, IndexError, ValueError):
        return None


def states_row(states):
    return {'threads': sum(states.values()), 'runnable_threads': states['R'],
            'blocked_threads': states['D']}



def release_priority_observation():
    """Read the admission owner's last result; never refresh GitHub from reports."""
    path = os.environ.get('BEELINK_GATE_RELEASE_STATE')
    result = {'source': 'last_gate_admission', 'state': 'unobserved', 'age_s': None}
    if not path:
        return result
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor) as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > 262144:
                raise ValueError('observation is not a bounded regular file')
            raw = source.read(262145)
        if len(raw) > 262144:
            raise ValueError('observation exceeds read bound')
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError('observation is not an object')
        result['observation'] = value
        result['state'] = 'recorded'
        stamp = value.get('observed_at')
        observed = dt.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
        if observed.tzinfo is None:
            raise ValueError('observation has no timezone')
        age = (dt.datetime.now(dt.timezone.utc) - observed).total_seconds()
        if age < 0:
            raise ValueError('observation clock is in the future')
        result['age_s'] = age
    except (OSError, ValueError, TypeError, AttributeError) as error:
        result['state'] = 'unreadable_or_undated'
        result['error'] = type(error).__name__
    return result


def sample():
    started = time.monotonic()
    deadline = started + BUDGET_SECONDS
    observed_at = dt.datetime.now(dt.timezone.utc).isoformat()
    hz = os.sysconf('SC_CLK_TCK')
    first, first_coverage = process_snapshot(deadline)
    first_groups, first_group_coverage = group_snapshot(
        {row['cgroup'] for row in first.values()}, deadline)
    first_cpu = cpu_ticks()
    first_at = time.monotonic()
    time.sleep(min(SAMPLE_SECONDS, max(0, deadline - first_at - 1)))
    second, second_coverage = process_snapshot(deadline)
    second_groups, second_group_coverage = group_snapshot(
        {row['cgroup'] for row in second.values()}, deadline)
    second_cpu = cpu_ticks()
    second_at = time.monotonic()
    interval = max(second_at - first_at, .001)
    process_states, group_states, thread_coverage = thread_snapshot(second, deadline)
    processes = []
    for pid, row in second.items():
        previous = first.get(pid)
        # A changed start time is a reused PID, never CPU from the old process.
        if previous is None or previous['start_ticks'] != row['start_ticks']:
            continue
        cpu = max(0, row['ticks'] - previous['ticks']) / hz / interval * 100
        processes.append({'pid': pid, 'start_ticks': row['start_ticks'],
                          'comm': row['comm'], 'cgroup': row['cgroup'],
                          'cpu_pct': round(cpu, 2),
                          **states_row(process_states.get(pid, collections.Counter()))})
    groups = []
    reset_groups = []
    for name, row in second_groups.items():
        previous = first_groups.get(name)
        if previous is None:
            continue
        if (previous['identity'] != row['identity'] or
                row['usage_usec'] < previous['usage_usec'] or
                row['throttled_usec'] < previous['throttled_usec']):
            reset_groups.append(name)
            continue
        cpu = max(0, row['usage_usec'] - previous['usage_usec']) / 10000 / interval
        groups.append({'cgroup': name, 'cpu_pct': round(cpu, 2),
                       'cgroup_inode': row['identity'],
                       'cpu_max': row['cpu_max'], 'cpu_weight': row['cpu_weight'],
                       'cgroup_events': row['cgroup_events'],
                       'memory_current_bytes': row['memory_current_bytes'],
                       'memory_max_bytes': row['memory_max_bytes'],
                       'cpu_pressure': row['cpu_pressure'],
                       'io_weight': row['io_weight'], 'io_pressure': row['io_pressure'],
                       'io_weight_state': row['io_weight_state'],
                       'io_delta': io_delta(previous['io_counters'], row['io_counters']),
                       'throttled_pct': round(max(0, row['throttled_usec'] - previous['throttled_usec']) / 10000 / interval, 2),
                       **states_row(group_states.get(name, collections.Counter()))})
    groups.sort(key=lambda row: row['cpu_pct'], reverse=True)
    processes.sort(key=lambda row: row['cpu_pct'], reverse=True)
    # Idle daemons can hold the legacy cap handoff forever while falling below
    # the top-CPU display. Reuse the bounded stable-identity sample, no new scan.
    legacy_members = [row for row in processes if any(
        row['cgroup'] == name or row['cgroup'].startswith(name + '/')
        for name in ('/beelink-gate', '/beelink-gate-dev'))]
    cpu = None
    if first_cpu is not None and second_cpu is not None:
        total = second_cpu[0] - first_cpu[0]
        idle = second_cpu[1] - first_cpu[1]
        cpu = {'total_pct': round(total / hz / interval * 100, 2),
               'busy_pct': round((total - idle) / hz / interval * 100, 2)}
    coverage = {'process_before': first_coverage, 'process_after': second_coverage,
                'groups_before': first_group_coverage, 'groups_after': second_group_coverage,
                'threads': thread_coverage,
                'processes_exited': len(set(first) - set(second)),
                'processes_new_or_reused': sum(pid not in first or first[pid]['start_ticks'] != row['start_ticks']
                                               for pid, row in second.items()),
                'process_rows': len(processes), 'process_rows_retained': min(20, len(processes)),
                'group_rows': len(groups), 'group_rows_retained': min(30, len(groups))}
    coverage['groups_recreated_or_counter_reset'] = reset_groups
    coverage['legacy_gate_member_rows'] = len(legacy_members)
    coverage['legacy_gate_member_rows_retained'] = min(64, len(legacy_members))
    priority_names = {'/beelinkgate.slice',
                      '/beelinkgate.slice/beelinkgate-normal.slice',
                      '/beelinkgate.slice/beelinkgate-dev.slice',
                      '/beelink-gate', '/beelink-gate-dev',
                      '/deploy.slice', '/deploy.slice/deploy-runners.slice'}
    priority_groups = [row for row in groups if row['cgroup'] in priority_names]
    controllers = read_text(CGROUP / 'cgroup.controllers')
    enabled = read_text(CGROUP / 'cgroup.subtree_control')
    return {'kind': 'host_cpu_sample', 'schema_version': 1, 'host': os.uname().nodename,
            'observed_at': observed_at, 'interval_seconds': round(interval, 3),
            'collector_seconds': round(time.monotonic() - started, 3), 'cores': os.cpu_count(),
            'loadavg': list(os.getloadavg()), 'cpu_pressure': pressure(PROC / 'pressure/cpu'),
            'io_pressure': pressure(PROC / 'pressure/io'),
            'io_weight_capability': {
                'root_weight_interface': second_groups.get('/', {}).get('io_weight_state', 'not_observed'),
                'io_controller_available': None if controllers is None else 'io' in controllers.split(),
                'io_controller_enabled': None if enabled is None else 'io' in enabled.split(),
                'device_enforcement': 'not_measured'},
            'admission': json.loads(os.environ.get('BEELINK_GATE_ADMISSION_SAMPLE', 'null')),
            'release_priority': release_priority_observation(),
            'cpu': cpu, 'coverage': coverage, 'groups': groups[:30],
            'priority_groups': priority_groups, 'processes': processes[:20],
            'legacy_gate_members': legacy_members[:64],
            'runnable_threads': sum(states['R'] for states in group_states.values()),
            'blocked_threads': sum(states['D'] for states in group_states.values()),
            'unattributed_cpu_pct': round(max(0, (cpu or {}).get('busy_pct', 0) - sum(row['cpu_pct'] for row in processes)), 2),
            'limits': 'Current sample, not 24-hour history. CPU pct uses 100 per core. Process CPU excludes exited, new or reused PIDs; missing CPU is explicit. Cgroup CPU and block I/O include descendants: overlapping rows must not be summed. I/O deltas are kernel-accounted device counters over interval_seconds; page-cache hits are excluded. Missing/reset counters are unknown, not zero. IOWeight is configured policy, not evidence the backing-device controller enforces it. Thread counts are direct membership at the end, not an atomic host census. Unreadable/exited entries and budget exhaustion are recorded in coverage. CPU pressure is a cgroup/host signal, not a per-process causal measure.'}


if __name__ == '__main__':
    try:
        print(json.dumps(sample(), separators=(',', ':')))
    except (OSError, ValueError) as error:
        print(json.dumps({'kind': 'host_cpu_sample', 'schema_version': 1,
                          'host': os.uname().nodename, 'incomplete': True,
                          'error': type(error).__name__}))
