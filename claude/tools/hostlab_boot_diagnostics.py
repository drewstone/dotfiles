"""Bounded, read-only boot evidence for hostlab's existing diagnostics surface.

QMP running means runnable vCPUs, not guest readiness. No monitor mutation,
process arguments, environment, guest files or unrelated process scan is used.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import struct
import sys
import time

from beelink_gate_cpu import group_snapshot, pressure


def tail(path, limit):
    try:
        with path.open('rb') as stream:
            stream.seek(0, 2)
            stream.seek(max(0, stream.tell() - limit))
            return stream.read(limit).decode(errors='replace')
    except OSError as error:
        return 'hostlab: diagnostic unavailable: ' + type(error).__name__


def clean(text):
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    text = re.sub(r'(?s)-----BEGIN[^\n]*KEY[^\n]*-----.*?(?:-----END[^\n]*KEY[^\n]*-----|\Z)', '[redacted key material]', text)
    return ''.join(c for c in text if c in '\n\t' or ord(c) >= 32)


def retain_logs(source, dest, stage):
    sensitive = re.compile(r'(?i)private key|offering public key|will attempt key|identity file|fingerprint|\b(?:password|token|secret|credential|authorization|cookie)\s*[:=]|(?:^|\s)(?:ssh-rsa|ssh-ed25519|ecdsa-sha2-\S+)\s+[A-Za-z0-9+/=]+|^[A-Za-z0-9+/=]{32,}$')
    log_stage = 'mount' if stage == 'ready' else stage
    for original, output, limit, marker in (
            (log_stage + '-ssh.stderr', 'ssh.stderr', 262144, 'all attempt summaries retained in ssh.stderr'),
            ('console.log', 'console.txt', 32768, 'complete bounded tail retained in console.txt')):
        lines = [line for line in clean(tail(source / original, limit)).splitlines()
                 if not sensitive.search(line)]
        (dest / output).write_text('\n'.join(lines) + '\n')
        display = lines if len(lines) <= 60 else lines[:20] + ['... ' + marker + ' ...'] + lines[-40:]
        name = 'ssh-display.txt' if output == 'ssh.stderr' else 'console-display.txt'
        (dest / name).write_text('\n'.join(display) + '\n')
    (dest / 'stage').write_text(stage + '\n')


def bounded_file(path, limit=4096):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ValueError('unsafe_file')
        data = stream.read(limit + 1)
        if len(data) > limit:
            raise ValueError('file_limit')
        return data


def native(pid, tid=None):
    path = Path('/proc') / str(pid)
    if tid is not None:
        path = path / 'task' / str(tid)
    raw = bounded_file(path / 'stat').decode()
    fields = raw[raw.rindex(')') + 2:].split()
    return {'pid': pid, 'tid': tid, 'state': fields[0],
            'start_ticks': int(fields[19]), 'cpu_ticks': int(fields[11]) + int(fields[12]),
            'threads': int(fields[17]), 'rss_pages': int(fields[21])}


def qmp_snapshot(endpoint, pid, deadline):
    info = endpoint.lstat()
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('unsafe_qmp_socket')
    pending = b''
    received = 0
    messages = 0
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        def timeout():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('qmp_deadline')
            client.settimeout(remaining)

        def message():
            nonlocal pending, received, messages
            while b'\n' not in pending:
                timeout()
                chunk = client.recv(8192)
                if not chunk:
                    raise ValueError('qmp_eof')
                received += len(chunk)
                if received > 262144:
                    raise ValueError('qmp_byte_limit')
                pending += chunk
            line, pending = pending.split(b'\n', 1)
            messages += 1
            if messages > 64:
                raise ValueError('qmp_message_limit')
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError('qmp_shape')
            return row

        def query(command):
            timeout()
            client.sendall((json.dumps({'execute': command, 'id': command}) + '\n').encode())
            while True:
                row = message()
                if 'event' in row:
                    continue
                if row.get('id') != command:
                    raise ValueError('qmp_response_identity')
                if 'error' in row:
                    return {'unknown': 'qmp_command_error'}
                if 'return' not in row:
                    raise ValueError('qmp_response_shape')
                return row['return']

        timeout()
        client.connect(str(endpoint))
        peer_pid, peer_uid, _ = struct.unpack('3i', client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        if peer_pid != pid or peer_uid != os.getuid():
            raise ValueError('qmp_peer_identity')
        greeting = message()
        version = greeting.get('QMP', {}).get('version', {}).get('qemu', {})
        version = {key: value for key, value in version.items()
                   if key in ('major', 'minor', 'micro') and type(value) is int}
        if query('qmp_capabilities') != {}:
            raise ValueError('qmp_capabilities_failed')
        status = query('query-status')
        cpus = query('query-cpus-fast')
        kvm = query('query-kvm')
        if not isinstance(status, dict) or not isinstance(kvm, dict):
            raise ValueError('qmp_query_shape')
        result = {'version': version,
                  'status': {key: value for key, value in status.items()
                             if (key == 'running' and type(value) is bool)
                             or (key == 'status' and isinstance(value, str) and re.fullmatch('[a-z-]{1,40}', value))
                             or (key == 'unknown' and value == 'qmp_command_error')},
                  'kvm': {key: value for key, value in kvm.items()
                          if (key in ('enabled', 'present') and type(value) is bool)
                          or (key == 'unknown' and value == 'qmp_command_error')},
                  'cpus': [], 'bytes_received': received, 'messages_received': messages}
        if isinstance(cpus, list) and len(cpus) <= 256:
            for cpu in cpus:
                if not isinstance(cpu, dict) or any(type(cpu.get(key)) is not int or cpu[key] < 0
                                                   for key in ('cpu-index', 'thread-id')):
                    raise ValueError('qmp_cpu_shape')
                result['cpus'].append({key: cpu[key] for key in ('cpu-index', 'thread-id')})
        else:
            result['cpus_unknown'] = 'qmp_command_error_or_shape'
        return result


def process_groups(pid, deadline):
    raw = bounded_file(Path('/proc') / str(pid) / 'cgroup').decode()
    name = next(line[3:] for line in raw.splitlines() if line.startswith('0::'))
    if not name.startswith('/') or '..' in Path(name).parts:
        raise ValueError('invalid_cgroup')
    names = {str(path) for path in (Path(name), *Path(name).parents)}
    rows, coverage = group_snapshot({name}, deadline)
    return {'path': name, 'ancestors': {key: value for key, value in rows.items() if key in names},
            'reader_coverage': coverage,
            'scope': 'shared cumulative counters; no preboot baseline, no attributed OOM or throttle delta'}


def source_hashes(hostlab):
    files = {'hostlab': hostlab, 'diagnostics': Path(__file__),
             'cpu_reader': Path(__file__).with_name('beelink_gate_cpu.py')}
    return {name: hashlib.sha256(bounded_file(path, 262144)).hexdigest()
            for name, path in files.items()}


def snapshot(source, hostlab, deadline):
    row = {'schema': 'hostlab-boot-state.v1', 'complete': False, 'unknowns': [],
           'captured_at_unix': time.time(), 'host_pressure': {},
           'limits': 'bounded observer; QMP runnable is not guest health; no preboot counter baseline'}
    try:
        row['source_sha256_at_observation'] = source_hashes(hostlab)
        launch_hashes = bounded_file(source / 'source-sha256').decode().splitlines()
        if len(launch_hashes) != 3 or any(not re.fullmatch('[a-f0-9]{64}', value) for value in launch_hashes):
            raise ValueError('invalid_launch_hashes')
        row['source_sha256_at_launch'] = dict(zip(('hostlab', 'diagnostics', 'cpu_reader'), launch_hashes))
        row['source_unchanged_since_launch'] = row['source_sha256_at_observation'] == row['source_sha256_at_launch']
        pid_text, start_text = bounded_file(source / 'qemu.identity').decode().split()
        pid, start = int(pid_text), int(start_text)
        if pid <= 1 or start <= 0:
            raise ValueError('invalid_qemu_identity')
        before = native(pid)
        if before['start_ticks'] != start:
            raise ValueError('qemu_identity_changed')
        row['process_before'] = before
        row['clock_ticks_per_second'] = os.sysconf('SC_CLK_TCK')
        row['uptime_seconds'] = float(bounded_file(Path('/proc/uptime')).split()[0])
        row['process_age_seconds'] = row['uptime_seconds'] - start / row['clock_ticks_per_second']
        row['process_cpu_seconds_since_birth'] = before['cpu_ticks'] / row['clock_ticks_per_second']
        row['qmp'] = qmp_snapshot(source / 'qmp.sock', pid, deadline)
        if any(not row['qmp'].get(key) or 'unknown' in row['qmp'][key] for key in ('status', 'kvm')):
            row['unknowns'].append('qmp_query_unavailable')
        if not row['qmp']['cpus']:
            row['unknowns'].append('qmp_cpu_unavailable')
        row['vcpu_threads'] = []
        for cpu in row['qmp']['cpus']:
            if time.monotonic() >= deadline:
                raise TimeoutError('observer_deadline')
            thread = native(pid, cpu['thread-id'])
            row['vcpu_threads'].append({'cpu_index': cpu['cpu-index'], **thread})
        row['cgroup'] = process_groups(pid, deadline)
        expected = {str(path) for path in (Path(row['cgroup']['path']), *Path(row['cgroup']['path']).parents)}
        if set(row['cgroup']['ancestors']) != expected:
            row['unknowns'].append('cgroup_coverage_incomplete')
        row['host_pressure'] = {kind: pressure(Path('/proc/pressure') / kind)
                                for kind in ('cpu', 'io', 'memory')}
        after = native(pid)
        if after['start_ticks'] != start:
            raise ValueError('qemu_identity_changed')
        row['process_after'] = after
        row['identity_verified'] = True
        if time.monotonic() >= deadline:
            row['unknowns'].append('observer_deadline')
        row['complete'] = not row['unknowns']
    except (OSError, ValueError, KeyError, TypeError, IndexError, StopIteration, struct.error) as error:
        reason = str(error) if type(error) is ValueError and re.fullmatch('[a-z_]{1,80}', str(error)) else type(error).__name__
        row['unknowns'].append(reason)
        row['identity_verified'] = False
        row['qmp_identity_binding'] = 'unverified; partial data is not authoritative'
    row['observation_finished_at_unix'] = time.time()
    return row


def publish(dest, row):
    temporary = dest / 'boot-state.json.tmp'
    temporary.write_text(json.dumps(row, sort_keys=True) + '\n')
    temporary.replace(dest / 'boot-state.json')


def main():
    source, dest, stage, hostlab, budget = sys.argv[1:]
    source, dest, hostlab = Path(source), Path(dest), Path(hostlab)
    if stage not in ('readiness', 'mount', 'ready'):
        raise ValueError('invalid_stage')
    budget = float(budget)
    if not 0 < budget <= 10:
        raise ValueError('invalid_budget')
    deadline = time.monotonic() + budget
    os.umask(0o077)
    retain_logs(source, dest, stage)
    publish(dest, {'schema': 'hostlab-boot-state.v1', 'complete': False,
                   'unknowns': ['observer_incomplete'], 'stage': stage})
    row = snapshot(source, hostlab, deadline)
    row['stage'] = stage
    publish(dest, row)


if __name__ == '__main__':
    main()
