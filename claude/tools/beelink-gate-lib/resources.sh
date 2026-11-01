#!/usr/bin/env bash
# BEELINK_GATE_MANAGED_SYSTEM_UNITS_V1
# shellcheck disable=SC2034 # receipt globals are consumed by the main gate.
# Resource admission and worker forecasts. Only host PSI admits CPU work;
# quotas describe maximum capacity and never override release priority.
limits_file() { echo "${BEELINK_GATE_LIMITS_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/beelink-gate/limits}"; }
gate_slice() {
  if [ "${dev:-${BEELINK_GATE_CLASS:-}}" = 1 ] || [ "${BEELINK_GATE_CLASS:-}" = dev ]; then echo beelinkgate-dev.slice
  else echo beelinkgate-normal.slice; fi
}
# Kernel and root-owned host paths. A fixture host names its own tree; every real host reads these defaults.
gate_cgroup() { echo "${BEELINK_GATE_CGROUP_ROOT:-/sys/fs/cgroup}/beelinkgate.slice/$(gate_slice)"; }

verify_gate_unit() {
  local expected actual
  expected="/beelinkgate.slice/$(gate_slice)/beelink-gate-${gate_id:-}.service"
  [[ "${gate_id:-}" =~ ^beelink[12]-[0-9a-f]{32}$ ]] || return 75
  [ "$(id -u)" != 0 ] || return 75
  actual=$(sed -n 's/^0:://p' "${BEELINK_GATE_SELF_CGROUP:-/proc/self/cgroup}") || return 75
  [ "$actual" = "$expected" ] || { echo 'beelink-gate: refused work outside its managed system unit' >&2; return 75; }
  python3 - "$(gate_slice)" <<'PY' || return 75
import json, os, pathlib, stat, subprocess, sys
named = os.environ.get('BEELINK_GATE_RESOURCE_POLICY')
owners = (0, os.getuid()) if named else (0,)
try:
    fd = os.open(named or '/etc/beelink-gate/resource-policy.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid not in owners or info.st_mode & 0o022 or info.st_size > 4096:
            raise ValueError()
        policy = json.load(stream)
    root = pathlib.Path(os.environ.get('BEELINK_GATE_CGROUP_ROOT', '/sys/fs/cgroup'), 'beelinkgate.slice')
    if type(policy['cpu_weight']) is not int or type(policy['io_weight']) is not int:
        raise ValueError()
    if int((root/'cpu.weight').read_text()) != policy['cpu_weight']:
        raise ValueError()
    for unit in (root.name, sys.argv[1]):
        configured = subprocess.run(['systemctl', 'show', unit, '-p', 'IOWeight', '--value'],
                                    capture_output=True, text=True, timeout=3)
        if configured.returncode or configured.stdout.strip() != str(policy['io_weight']):
            raise ValueError()
    # The Beelinks' WSL2 kernel has no io.weight: systemd IOWeight is configured, device enforcement is unproved.
    if not all((root/name).is_file() for name in ('io.stat', 'io.pressure')):
        raise ValueError()
    group = root / sys.argv[1]
    memory_key = 'dev_memory_bytes' if sys.argv[1] == 'beelinkgate-dev.slice' else 'normal_memory_bytes'
    if int((group/'memory.max').read_text()) != policy[memory_key]:
        raise ValueError()
    quota, period = (group/'cpu.max').read_text().split()
    if sys.argv[1] == 'beelinkgate-dev.slice':
        if quota != 'max':
            raise ValueError()
    elif quota == 'max' or int(quota) * 100 != os.cpu_count() * policy['normal_cpu_percent_per_host_cpu'] * int(period):
        raise ValueError()
except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
    sys.exit(75)
PY
  gate_cgroup_joined=$actual
  export BEELINK_GATE_SYSTEMD_MANAGER=system BEELINK_GATE_UNIT="beelink-gate-$gate_id.service"
}

# The tools every gate runs, on the PATH remote_gate sets (no nvm: a repo without .nvmrc installs with it): a rebuilt bare beelink1 distro
# (Ubuntu-24.04-b1r, 10-28) had none (then no make/g++ for node-gyp, 21:18Z), and auto kept admitting gates there to fail with 127 or "pnpm: No such file".
# Prints a refused probe line and succeeds when one is missing, so auto places on the other host.
toolchain_refusal() {
  local tool missing="" path="$HOME/bin:$HOME/.local/bin:$PATH"
  for tool in git node npm corepack shellcheck make g++; do PATH=$path command -v "$tool" >/dev/null || missing="$missing $tool"; done
  [ -w /var/run/docker.sock ] || missing="$missing docker.sock"  # gate user outside the docker group (beelink1 22:4xZ)
  [ -n "$missing" ] || return 1
  printf 'beelink-gate-probe host=%s state=refused cache=cold slots=0 load=- limit=- host_cpu=- next=%s recovered=0 admission=host-toolchain capacity=null reason=host_toolchain_missing:%s\n' \
    "$1" "$(utc_in_minutes 15)" "$missing"
}

host_limit() {  # <key: max_cpu_pressure|max_io_pressure> <default, empty for none>: the host limits file's value
  python3 - "$(limits_file)" "$1" "$2" <<'PY'
import os, pathlib, re, stat, sys
path, key, default = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
if not os.path.lexists(path):
    print(default); sys.exit(0)
try:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 65536:
            raise ValueError()
        text = stream.read(65537)
    if len(text) > 65536:
        raise ValueError()
    rows = [line for line in text.splitlines() if line.strip().startswith(key)]
    if not rows:
        print(default)
    elif len(rows) == 1 and re.fullmatch(key + r'=[0-9]{1,3}\s*', rows[0]):
        value = int(rows[0].split('=')[1])
        if value > 100: raise ValueError()
        print(value)
    else: raise ValueError()
except (OSError, ValueError, UnicodeError):
    sys.exit(1)
PY
}
max_cpu_pressure() {
  local maximum requested=${BEELINK_GATE_MAX_CPU_PRESSURE:-}
  maximum=$(host_limit max_cpu_pressure 20) || die 'invalid host max_cpu_pressure policy'
  if [ -n "$requested" ]; then
    [[ "$requested" =~ ^[0-9]+$ ]] && (( requested <= 100 )) || die 'BEELINK_GATE_MAX_CPU_PRESSURE must be 0-100'
    (( requested >= maximum )) || maximum=$requested
  fi
  echo "$maximum"
}
# Class memory some avg10 over 10 holds admission (11 gates swapped 17 GB while CPU admitted them, beelink1 10-26).
# Host IO some avg10 over max_io_pressure holds too. The code default is 20; the host limits file overrides it.
# So does a median 4 KiB fsync in the cache root over 100 ms: beelink2's WSL disk took 0.7-3.5 s at IO PSI 8-15 after its
# VM restart and failed every disk-heavy gate, beelink1's 1.4 ms (11-01). Two slow rounds of three decide it.
host_psi_admission() {
  local limit io_limit
  limit=$(max_cpu_pressure) || return 75; io_limit=$(host_limit max_io_pressure 20) || die 'invalid host max_io_pressure policy'
  python3 - "$limit" "${io_limit:-null}" "${BEELINK_GATE_HOST_PRESSURE:-/proc/pressure/cpu}" "$(gate_cgroup)" "${BEELINK_GATE_HOST_IO_PRESSURE:-/proc/pressure/io}" \
    "${cache_root:-${BEELINK_GATE_CACHE_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/beelink-gate}}" <<'PY'
import json, math, os, statistics, sys, tempfile, time
def psi(path):  # some avg10, or None when unreadable
    try:
        with open(path) as stream:
            value = float(dict(field.split('=') for field in next(line for line in stream if line.startswith('some ')).split()[1:])['avg10'])
        return value if math.isfinite(value) and 0 <= value <= 100 else None
    except (OSError, ValueError, KeyError, StopIteration):
        return None
limit, io_limit, fsync_limit, rounds = float(sys.argv[1]), json.loads(sys.argv[2]), 100, []
pressure, memory, io, host_io = psi(sys.argv[3]), psi(sys.argv[4] + '/memory.pressure') or 0.0, psi(sys.argv[4] + '/io.pressure'), psi(sys.argv[5])
known, io_held = pressure is not None, io_limit is not None and host_io is not None and host_io > io_limit
try:  # the cache root's disk, through its parent before the first gate makes it; unwritable measures nothing, like unreadable PSI
    disk = sys.argv[6] if os.path.isdir(sys.argv[6]) else os.path.dirname(sys.argv[6])
    with tempfile.NamedTemporaryFile(buffering=0, dir=disk, prefix='.fsync-probe-') as probe:
        while len(rounds) < 3 and sum(ms > fsync_limit for ms in rounds) < 2:
            start = time.monotonic(); probe.write(bytes(4096)); os.fsync(probe.fileno()); rounds.append((time.monotonic() - start) * 1000)
except OSError:
    rounds = []
fsync_ms = round(statistics.median(rounds), 1) if rounds else None; fsync_held = (fsync_ms or 0) > fsync_limit
print(json.dumps({'mode':'host_psi', 'metric':'some_avg10', 'observed_at':time.time(), 'some_avg10':pressure, 'limit':limit,
                  'held':not known or pressure > limit or memory > 10 or io_held or fsync_held, 'reason':'host_psi_unavailable' if not known else
                  'class_memory_psi' if memory > 10 else 'host_io_psi' if io_held else 'host_fsync_latency' if fsync_held else 'host_psi',
                  'class_memory_some_avg10':memory, 'class_io_some_avg10':io, 'host_io_some_avg10':host_io, 'io_limit':io_limit,
                  'fsync_ms':fsync_ms, 'fsync_limit_ms':fsync_limit}, separators=(',', ':')))
PY
}
wait_for_load() {
  : "${load_wait_started:=$SECONDS}"
  local beelink=$1 budget since=$load_wait_started reported=-60 sample held why pause left
  budget=$(seconds_of "${BEELINK_GATE_LOAD_WAIT:-30m}") || die 'invalid BEELINK_GATE_LOAD_WAIT'
  admission_stage checks
  verify_gate_unit || { admission_reason=containment_unknown; return 75; }
  while :; do
    admission_stage checks
    admit_release_priority "$beelink"
    sample=$(host_psi_admission) || return 75
    if [ -n "${deadline:-}" ] && (( SECONDS >= deadline )); then
      timed_out=1
      echo 'beelink-gate: hold limit reached during host PSI admission' >&2
      exit 124
    fi
    held=$(python3 -c 'import json,sys; print(int(json.loads(sys.argv[1])["held"]))' "$sample") || return 75
    [ "$held" = 1 ] || break
    why="host CPU PSI some avg10 holds admission: $sample"
    if (( SECONDS - since >= budget )); then
      admission_outcome=refused admission_reason=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["reason"])' "$sample")
      echo "beelink-gate: REFUSED $beelink $why" >&2; return 3
    fi
    if (( SECONDS - reported >= 60 )); then echo "beelink-gate: waiting $((SECONDS-since))s of ${budget}s: $why" >&2; reported=$SECONDS; fi
    admission_expired && not_admitted "$why"
    pause=${BEELINK_GATE_LOAD_POLL_SECONDS:-15}
    [[ "$pause" =~ ^[1-9][0-9]*$ ]] || return 75
    if [ -n "${deadline:-}" ]; then
      left=$((deadline - SECONDS))
      (( pause <= left )) || pause=$left
    fi
    admission_stage host_psi
    (( pause > 0 )) && { sleep "$pause" & wait $!; }
  done
  admission_stage checks
  start_load=$(cut -d' ' -f1 "${BEELINK_GATE_LOADAVG:-/proc/loadavg}") start_host_pressure=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["some_avg10"])' "$sample") start_pressure=$start_host_pressure
  export BEELINK_GATE_ADMISSION_SAMPLE="$sample" BEELINK_GATE_ADMITTED=1
  echo "beelink-gate: admission $sample" >&2
}

starving() {
  [ "${dev:-0}" = 0 ] || return 1  # a dev run waits; only merge gates get the backstop
  [ "${urgent:-0}" = 0 ] || return 0
  local after
  after=$(seconds_of "${BEELINK_GATE_STARVE_AFTER:-10m}") || die "invalid BEELINK_GATE_STARVE_AFTER: ${BEELINK_GATE_STARVE_AFTER:-}"
  (( ${placed_wait:-0} + SECONDS - ${load_wait_started:-$SECONDS} >= after ))
}

worker_capacity() {
  [ "${dev:-0}" = 0 ] || return 1
  python3 - "$(gate_cgroup)" "${cache_root:-${BEELINK_GATE_CACHE_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/beelink-gate}}/.locks" "${slot_fd:-}" "$(max_cpu_pressure)" "${1:-0}" <<'PY'
import fcntl, json, math, os, pathlib, sys, time
group, locks, held, pressure_limit = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), bool(sys.argv[3]), float(sys.argv[4])
root = pathlib.Path(os.environ.get('BEELINK_GATE_CGROUP_ROOT', '/sys/fs/cgroup')).resolve()
try:
    group = group.resolve(strict=True)
    joined = pathlib.Path(os.environ.get('BEELINK_GATE_SELF_CGROUP', '/proc/self/cgroup')).read_text().strip().startswith('0::/' + str(group.relative_to(root)) + '/')
    if sys.argv[5] == '1' and not joined:
        raise ValueError('membership unverified')
    cpus, finite = float(len(os.sched_getaffinity(0))), False
    for path in (group, *group.parents):
        if path == root.parent:
            break
        raw = (path / 'cpu.max').read_text().split()
        if raw[0] != 'max':
            cpus, finite = min(cpus, int(raw[0]) / int(raw[1])), True
        spec = (path / 'cpuset.cpus.effective').read_text().strip()
        if spec:
            allowed = sum(int(part.split('-')[-1]) - int(part.split('-')[0]) + 1 for part in spec.split(','))
            cpus = min(cpus, allowed)
        if path == root:
            break
    if not finite or cpus <= 0:
        raise ValueError('quota unverified')
    running = 0
    for pattern in ('slot-*.lock', 'light-slot-*.lock'):
        for lock in locks.glob(pattern):
            with lock.open('rb') as fd:
                try:
                    fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
                except BlockingIOError:
                    running += 1
    workers = max(1, math.floor(cpus / max(1, running + (not held))))
    runnable, read, expired = 0, 0, time.monotonic() + 1
    for membership in group.rglob('cgroup.threads'):
        for tid in membership.read_text().split():
            if time.monotonic() > expired:
                raise ValueError('thread scan budget')
            try:
                stat = pathlib.Path('/proc', tid, 'stat').read_text()
            except FileNotFoundError:
                continue  # A completed task contributes no runnable work.
            runnable += tid != str(os.getpid()) and stat[stat.rindex(')') + 2:].split()[0] == 'R'
            read += 1
    workers = max(1, min(workers, math.floor(cpus - runnable)))
    print(json.dumps({'mode': 'worker_forecast', 'observed_at': time.time(), 'cgroup': str(group),
                     'effective_cpus': cpus, 'runnable_threads': runnable, 'threads_read': read,
                     'workers': workers, 'verified_join': joined}, separators=(',', ':')))
except (OSError, ValueError, KeyError, IndexError):
    sys.exit(1)  # Missing forecast evidence never changes host PSI admission.
PY
}
gate_worker_budget() {
  local forecast
  if forecast=$(worker_capacity 1); then
    python3 -c 'import json,sys; print(json.loads(sys.argv[1])["workers"])' "$forecast"; return
  fi
  local running=0 f fd
  for f in "$1"/slot-*.lock "$1"/light-slot-*.lock "$1"/dev-slot-*.lock; do
    [ -e "$f" ] || continue
    exec {fd}<"$f" || continue
    flock -n -s "$fd" || running=$((running+1))
    exec {fd}<&-
  done
  (( running >= 1 )) || running=1
  local each=$(( $(nproc) / running ))
  (( each >= 2 )) || each=2
  echo "$each"
}

# A gate's containers are its work (one wrote 23 GB/h into the daemon's user.slice, 10-26): its own Docker socket gives
# create an unset cgroup parent under the gate slice, outside class caps that a fixture left running would starve.
# Connection: close keeps one request per connection, so only its head is parsed and the rest is spliced untouched.
gate_docker_socket() {
  local sock="${XDG_RUNTIME_DIR:-/tmp}/beelink-gate-docker-${gate_id#*-}.sock" fd
  [ -n "$gate_cgroup_joined" ] && [ -w /var/run/docker.sock ] || return 0
  [ "${DOCKER_HOST:-unix:///var/run/docker.sock}" = unix:///var/run/docker.sock ] || { echo "beelink-gate: DOCKER_HOST is $DOCKER_HOST; gate containers keep its cgroup" >&2; return 0; }
  ( for fd in ${lock_fd:-} ${slot_fd:-} ${capacity_fd:-} ${writer_fd:-} ${gate_turbo_fd:-} ${heartbeat_fd:-}; do exec {fd}>&-; done
    exec python3 - "$sock" "beelinkgate-docker-g${gate_id#*-}.slice" <<'PY'
import asyncio, json, os, re, signal, sys
listen, parent, live = sys.argv[1], sys.argv[2].encode(), set()  # asyncio keeps tasks weakly: GC ended 15/16 first attaches (10-27)
signal.signal(signal.SIGTERM, lambda *_: (os.unlink(listen), os._exit(0)))  # the unit's stop removes the socket

async def pipe(reader, writer):
    while data := await reader.read(1 << 16):
        writer.write(data); await writer.drain()
    writer.write_eof()

async def serve(client_r, client_w):
    up_w = None; live.add(task := asyncio.current_task()); task.add_done_callback(live.discard)
    try:
        up_r, up_w = await asyncio.open_unix_connection('/var/run/docker.sock', limit=1 << 20)
        lines = (await client_r.readuntil(b'\r\n\r\n'))[:-4].split(b'\r\n')
        fields = {k.strip().lower(): v.strip() for k, _, v in (line.partition(b':') for line in lines[1:])}
        upgrade = b'upgrade' in fields.get(b'connection', b'').lower()
        method, target, version = lines[0].split(b' ')
        create = method == b'POST' and re.fullmatch(rb'(/v[\d.]+)?/containers/create(\?.*)?', target) and b'content-length' in fields
        drop = ((b'content-length',) if create else ()) + (() if upgrade else (b'connection',))
        lines = [line for line in lines if line.partition(b':')[0].strip().lower() not in drop] + [b'Connection: close'][upgrade:]
        body = await client_r.readexactly(int(fields[b'content-length'])) if create else b''
        if create:
            try:
                spec = json.loads(body)
                host = spec.get('HostConfig') or {}
                spec['HostConfig'] = {**host, 'CgroupParent': host.get('CgroupParent') or parent.decode()}
                body = json.dumps(spec).encode()
            except (ValueError, AttributeError, TypeError):
                pass  # not a JSON object: the daemon answers it as sent
            lines.append(b'Content-Length: %d' % len(body))
        up_w.write(b'\r\n'.join(lines) + b'\r\n\r\n' + body)
        upstream = asyncio.ensure_future(pipe(client_r, up_w))
        await pipe(up_r, client_w)
        await upstream if upgrade else upstream.cancel()
    except Exception:
        pass
    finally:
        for writer in (client_w, up_w):
            writer and writer.close()

async def main():
    server = await asyncio.start_unix_server(serve, path=listen + '.new', limit=1 << 20)
    os.chmod(listen + '.new', 0o600)
    os.rename(listen + '.new', listen)  # appears only once it accepts
    await server.serve_forever()

asyncio.run(main())
PY
  ) </dev/null >/dev/null 2>&1 &
  local i; for i in $(seq 50); do [ -S "$sock" ] && break; sleep 0.1; done
  [ -S "$sock" ] && export DOCKER_HOST="unix://$sock" || echo "beelink-gate: gate Docker socket did not start; containers keep the daemon's cgroup" >&2
}
