#!/usr/bin/env bash
# BEELINK_GATE_MANAGED_SYSTEM_UNITS_V1
# shellcheck disable=SC2034 # receipt globals are consumed by the main gate.
# Resource admission and worker forecasts. Only host PSI admits CPU work;
# quotas describe maximum capacity and never override release priority.
limits_file() { echo "${BEELINK_GATE_LIMITS_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/beelink-gate/limits}"; }
pressure_file() { echo "${BEELINK_GATE_HOST_PRESSURE:-/proc/pressure/cpu}"; }
loadavg_now() { cut -d' ' -f1 "${BEELINK_GATE_LOADAVG:-/proc/loadavg}"; }
metric_name() { echo 'host CPU pressure (some avg10)'; }
limit_basis() { echo "% host some avg10 in $(pressure_file)"; }
gate_slice() {
  if [ "${dev:-${BEELINK_GATE_CLASS:-}}" = 1 ] || [ "${BEELINK_GATE_CLASS:-}" = dev ]; then echo beelinkgate-dev.slice
  else echo beelinkgate-normal.slice; fi
}
gate_cgroup() { echo "/sys/fs/cgroup/beelinkgate.slice/$(gate_slice)"; }

# Missing old groups are drained; unreadable or malformed recursive kernel
# population evidence cannot release this transitional cap handoff.
legacy_gate_drained() {
  local group=beelink-gate
  [ "$(gate_slice)" != beelinkgate-dev.slice ] || group="beelink-gate-dev"
  local status=0
  python3 - "$group" <<'PY'
import pathlib, sys
path = pathlib.Path('/sys/fs/cgroup', sys.argv[1])
try:
    path.stat()
except FileNotFoundError:
    sys.exit(0)
except OSError:
    sys.exit(2)
try:
    lines = [line.split() for line in (path / 'cgroup.events').read_text().splitlines()]
    values = [value for key, value in lines if key == 'populated']
    if len(values) != 1 or values[0] not in ('0', '1'):
        raise ValueError()
    sys.exit(int(values[0]))
except (OSError, ValueError):
    sys.exit(2)
PY
  status=$?
  [ "$status" = 0 ] || return "$status"
  legacy_user_gate_units_drained
}
require_legacy_gate_drained() {
  local status=0
  legacy_gate_drained || status=$?
  [ "$status" = 0 ] || {
    admission_outcome=refused admission_reason=legacy_gate_unknown
    [ "$status" != 1 ] || admission_reason=legacy_gate_live
    tempfail_line "$(utc_in_minutes 5)" "legacy gate class has not proved drained (status=$status); no new managed work"
    return 75
  }
}

verify_gate_unit() {
  local expected actual
  expected="/beelinkgate.slice/$(gate_slice)/beelink-gate-${gate_id:-}.service"
  [[ "${gate_id:-}" =~ ^beelink[12]-[0-9a-f]{32}$ ]] || return 75
  [ "$(id -u)" != 0 ] || return 75
  actual=$(sed -n 's/^0:://p' /proc/self/cgroup) || return 75
  [ "$actual" = "$expected" ] || { echo 'beelink-gate: refused work outside its managed system unit' >&2; return 75; }
  python3 - "$(gate_slice)" <<'PY'
import json, os, pathlib, stat, subprocess, sys
try:
    fd = os.open('/etc/beelink-gate/resource-policy.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > 4096:
            raise ValueError()
        policy = json.load(stream)
    root = pathlib.Path('/sys/fs/cgroup/beelinkgate.slice')
    if type(policy['cpu_weight']) is not int or type(policy['io_weight']) is not int:
        raise ValueError()
    if int((root/'cpu.weight').read_text()) != policy['cpu_weight']:
        raise ValueError()
    for unit in (root.name, sys.argv[1]):
        configured = subprocess.run(['systemctl', 'show', unit, '-p', 'IOWeight', '--value'],
                                    capture_output=True, text=True, timeout=3)
        if configured.returncode or configured.stdout.strip() != str(policy['io_weight']):
            raise ValueError()
    try:
        weights = dict(line.split() for line in (root/'io.weight').read_text().splitlines())
        if int(weights['default']) != policy['io_weight']:
            raise ValueError()
    except FileNotFoundError:
        if os.path.lexists(root/'io.weight') or not all((root/name).is_file() for name in ('io.stat', 'io.pressure')):
            raise ValueError()
        print('beelink-gate: UNSUPPORTED kernel io.weight; systemd IOWeight configured, device enforcement unproved', file=sys.stderr)
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
  [ "$?" = 0 ] || return 75
  gate_cgroup_joined=$actual
  export BEELINK_GATE_SYSTEMD_MANAGER=system BEELINK_GATE_UNIT="beelink-gate-$gate_id.service"
}

host_max_cpu_pressure() {
  python3 - "$(limits_file)" <<'PY'
import os, pathlib, re, stat, sys
path, default = pathlib.Path(sys.argv[1]), 20
try:
    path.lstat()
except FileNotFoundError:
    print(default)
    sys.exit(0)
except OSError:
    sys.exit(1)
try:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 65536:
            raise ValueError()
        text = stream.read(65537)
    if len(text) > 65536:
        raise ValueError()
    rows = [line for line in text.splitlines() if line.strip().startswith('max_cpu_pressure')]
    if not rows:
        print(default)
    elif len(rows) == 1 and re.fullmatch(r'max_cpu_pressure=[0-9]{1,3}\s*', rows[0]):
        value = int(rows[0].split('=')[1])
        if value > 100:
            raise ValueError()
        print(value)
    else:
        raise ValueError()
except (OSError, ValueError, UnicodeError):
    sys.exit(1)
PY
}
max_cpu_pressure() {
  local maximum requested=${BEELINK_GATE_MAX_CPU_PRESSURE:-}
  maximum=$(host_max_cpu_pressure) || die 'invalid host max_cpu_pressure policy'
  if [ -n "$requested" ]; then
    [[ "$requested" =~ ^[0-9]+$ ]] && (( requested <= 100 )) || die 'BEELINK_GATE_MAX_CPU_PRESSURE must be 0-100'
    (( requested >= maximum )) || maximum=$requested
  fi
  echo "$maximum"
}
load_limit() { max_cpu_pressure; }
host_pressure_now() {
  python3 - "$(pressure_file)" <<'PY'
import math, pathlib, re, sys
try:
    line = next(line for line in pathlib.Path(sys.argv[1]).read_text().splitlines() if line.startswith('some '))
    value = float(dict(field.split('=') for field in line.split()[1:])['avg10'])
    if not math.isfinite(value) or not 0 <= value <= 100:
        raise ValueError()
    print(value)
except (OSError, ValueError, KeyError, StopIteration):
    sys.exit(1)
PY
}
load_now() { host_pressure_now || echo 100; }
over_limit() {
  awk -v cur="$1" -v cap="$2" 'BEGIN { exit !(cur + 0 > cap + 0) }'
  [ "$?" -ne 1 ]
}
host_psi_admission() {
  local pressure="" known=1 limit
  pressure=$(host_pressure_now) || known=0
  limit=$(max_cpu_pressure) || return 75
  python3 - "$pressure" "$limit" "$known" <<'PY'
import json, sys, time
known = sys.argv[3] == '1'
pressure, limit = float(sys.argv[1]) if known else None, float(sys.argv[2])
print(json.dumps({'mode':'host_psi', 'metric':'some_avg10', 'observed_at':time.time(),
                  'some_avg10':pressure, 'limit':limit,
                  'held':not known or pressure > limit,
                  'reason':'host_psi_unavailable' if not known else 'host_psi'}, separators=(',', ':')))
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
    require_legacy_gate_drained || return 75
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
  start_load=$(loadavg_now) start_host_pressure=$(host_pressure_now) start_pressure=$start_host_pressure
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
root = pathlib.Path('/sys/fs/cgroup')
try:
    group = group.resolve(strict=True)
    joined = pathlib.Path('/proc/self/cgroup').read_text().strip().startswith('0::/' + str(group.relative_to(root)) + '/')
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
