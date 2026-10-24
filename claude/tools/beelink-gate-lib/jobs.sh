#!/usr/bin/env bash
# Submitted gate unit lifecycle; commands stay in their owning systemd unit.
job_status_timeout_seconds=5
job_retention_seconds=86400

job_dir_for() {
  [[ "$1" =~ ^beelink[12]-[0-9a-f]{32}$ ]] || die "invalid gate id"
  echo "$STATE_DIR/jobs/$1"
}
job_submit() {
  local id=$1 dir lock_fd
  shift
  dir=$(job_dir_for "$id")
  mkdir -p "$STATE_DIR/jobs/.locks" "$STATE_DIR/jobs/.canceled" || return 75
  exec {lock_fd}> "$STATE_DIR/jobs/.locks/$id.lock" || return 75
  flock "$lock_fd" || return 75
  if [ -f "$STATE_DIR/jobs/.canceled/$id" ]; then
    echo "beelink-gate: gate_id=$id canceled before submission; TEMPFAIL 75" >&2
    [ ! -d "$dir" ] || printf '75\n' > "$dir/exit"
    return 75
  fi
  [ -f "$dir/gate.sh" ] && [ ! -L "$dir/gate.sh" ] || die "gate source was not staged for $id"
  grep -qxF '# BEELINK_GATE_MANAGED_SYSTEM_UNITS_V1' "$dir/gate.sh" || {
    echo 'beelink-gate: retained source predates managed units; restage through the maintained CLI' >&2
    return 75
  }
  # Jobs can emit large logs. Keep completed reconnect records for one day;
  # active jobs have no exit file and their receipt also lives in receipts.jsonl.
  python3 - "$STATE_DIR/jobs" "$id" "$job_retention_seconds" <<'PY' || true
import pathlib, re, shutil, stat, sys, time
root, current = pathlib.Path(sys.argv[1]), sys.argv[2]
for job in root.iterdir():
    if job.name == current or not re.fullmatch(r"beelink[12]-[0-9a-f]{32}", job.name):
        continue
    if job.is_symlink() or not job.is_dir():
        continue
    try:
        done = (job / "exit").lstat()
    except FileNotFoundError:
        continue
    if stat.S_ISREG(done.st_mode) and time.time() - done.st_mtime > int(sys.argv[3]):
        shutil.rmtree(job)
PY
  cat > "$dir/runner.sh" <<'RUNNER'
#!/usr/bin/env bash
dir=$(cd -- "$(dirname -- "$0")" && pwd -P) || exit 2
set +e
child= stop_requested=0
stop_child() {
  stop_requested=1
  : > "$dir/../.canceled/${dir##*/}"
  [ -z "$child" ] || kill -TERM "$child" 2>/dev/null || true
}
trap stop_child TERM INT HUP
bash "$dir/gate.sh" --remote "$@" > "$dir/stdout.log" 2> "$dir/stderr.log" &
child=$!
birth=$(awk '{print $22}' "/proc/$child/stat" 2>/dev/null)
printf '%s %s\n' "$child" "$birth" > "$dir/gate.pid.tmp"
mv -- "$dir/gate.pid.tmp" "$dir/gate.pid"
[ "$stop_requested" = 0 ] || kill -TERM "$child" 2>/dev/null || true
wait "$child"; rc=$?
if [ "$stop_requested" = 1 ]; then
  # TERM interrupts bash's wait; never publish a terminal exit while its
  # exact owned child still lives. The SYSTEM unit contains all descendants.
  for ((i=0; i<100; i++)); do
    state=$(awk '{print $3}' "/proc/$child/stat" 2>/dev/null)
    [ "$state" = Z ] && break
    kill -0 "$child" 2>/dev/null || break
    sleep 0.1
  done
  state=$(awk '{print $3}' "/proc/$child/stat" 2>/dev/null)
  if [ "$state" != Z ] && kill -0 "$child" 2>/dev/null; then
    echo "beelink-gate: gate child $child survived unit stop" >&2
    exit 75
  fi
  wait "$child" 2>/dev/null || true
  rc=75
fi
exec {lock_fd}> "$dir/../.locks/${dir##*/}.lock"
flock "$lock_fd"
printf '%s\n' "$rc" > "$dir/exit.tmp"
mv -- "$dir/exit.tmp" "$dir/exit"
RUNNER
  chmod 700 "$dir/runner.sh"
  (umask 077; printf 'system\n' > "$dir/systemd-manager") || return 75
  if ! managed_unit_run job "$id" "$dir/runner.sh" "$@" {lock_fd}>&-; then
    printf '75\n' > "$dir/exit"
    return 75
  fi
  : > "$dir/submitted"
  echo "beelink-gate: submitted gate_id=$id" >&2
}
# One SYSTEM launcher for submitted gate jobs.
# It keeps the complete process tree under the same resource-policy owner.
managed_unit_run() {
  local kind=$1 id=$2 script=$3 uid gid name
  shift 3
  [[ "$id" =~ ^beelink[12]-[0-9a-f]{32}$ ]] || return 75
  [ -f "$script" ] && [ ! -L "$script" ] || return 75
  uid=$(id -u) gid=$(id -g)
  [[ "$uid" =~ ^[1-9][0-9]*$ && "$gid" =~ ^[0-9]+$ ]] || return 75
  require_legacy_gate_drained || return 75
  local -a vars=("BEELINK_GATE_ID=$id" "BEELINK_GATE_SYSTEMD_MANAGER=system"
    "HOME=$HOME" "PATH=$PATH" "USER=$(id -un)" "LOGNAME=$(id -un)" "SHELL=/bin/bash"
    "XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}")
  for name in XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME BEELINK_GATE_STATE_DIR SSH_AUTH_SOCK DOCKER_HOST DBUS_SESSION_BUS_ADDRESS; do
    [ -z "${!name:-}" ] || vars+=("$name=${!name}")
  done
  for name in TURBO_CACHE_DIR TURBO_RUN_SUMMARY BEELINK_GATE_LAUNCHER BEELINK_GATE_MAX_HOLD BEELINK_GATE_BRANCH BEELINK_GATE_LOAD_WAIT BEELINK_GATE_CACHE_MAX_BYTES \
    BEELINK_GATE_MAX_CPU_PRESSURE BEELINK_GATE_STARVE_AFTER \
    BEELINK_GATE_CLASS BEELINK_GATE_SHIP_WORKERS BEELINK_GATE_PR BEELINK_GATE_LANE BEELINK_GATE_RESERVATION_TOKEN BEELINK_GATE_MAX_CONCURRENT \
    BEELINK_GATE_REPO_CHECKOUTS BEELINK_GATE_LIGHT_CPU BEELINK_GATE_LIGHT_SLOTS \
    BEELINK_GATE_URGENT BEELINK_GATE_AUTO BEELINK_GATE_ADMIT_WAIT BEELINK_GATE_PLACED_WAIT BEELINK_GATE_SPARSE_SPEC BEELINK_GATE_PEER_RESERVE BEELINK_GATE_PEER_WARM_RESERVE; do
    [ -z "${!name:-}" ] || vars+=("$name=${!name}")
  done
  local -a command=(sudo -n /usr/bin/systemd-run --collect --uid="$uid" --gid="$gid"
    --slice="$(gate_slice)" --unit="beelink-gate-$id" --property=KillMode=control-group)
  case "$kind" in
    job) command+=(--property=TimeoutStopSec=10s) ;;
    probe) command+=(--wait --pipe --property=RuntimeMaxSec=25s --property=TimeoutStopSec=3s) ;;
    *) return 75 ;;
  esac
  if [ "$kind" = probe ]; then
    timeout --kill-after=1 29 "${command[@]}" -- /usr/bin/env "${vars[@]}" /usr/bin/bash "$script" "$@"
  else
    "${command[@]}" -- /usr/bin/env "${vars[@]}" /usr/bin/bash "$script" "$@" >&2
  fi
}
gate_process_alive() {
  local dir=$1 pid birth actual state
  [ -f "$dir/gate.pid" ] && [ ! -L "$dir/gate.pid" ] || return 1
  read -r pid birth < "$dir/gate.pid" || return 1
  [[ "$pid" =~ ^[1-9][0-9]*$ && "$birth" =~ ^[1-9][0-9]*$ ]] || return 1
  read -r state actual < <(awk '{print $3, $22}' "/proc/$pid/stat" 2>/dev/null) || return 1
  [ "$actual" = "$birth" ] && [ "$state" != Z ] && [ "$state" != X ] || return 1
  gate_pid=$pid
}
# Missing metadata identifies retained USER jobs. A present marker is read once
# through a bounded non-following descriptor, shared by attach and cancellation.
job_manager() {
  python3 - "$1" <<'PYMANAGER'
import os, stat, sys
try:
    directory = os.open(sys.argv[1], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        try:
            fd = os.open('systemd-manager', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        except FileNotFoundError:
            print('user')
            sys.exit(0)
        with os.fdopen(fd, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o022 or info.st_size > 16:
                raise ValueError()
            content = stream.read(17)
        if content != b'system\n':
            raise ValueError()
        print('system')
    finally:
        os.close(directory)
except (OSError, ValueError):
    print('beelink-gate: unsafe or unreadable job manager metadata; TEMPFAIL 75', file=sys.stderr)
    sys.exit(75)
PYMANAGER
}

job_cancel_remote() {
  local id=$1 dir unit state lock_fd gate_pid i manager
  local -a control=(systemctl --user)
  dir=$(job_dir_for "$id")
  mkdir -p "$STATE_DIR/jobs/.locks" "$STATE_DIR/jobs/.canceled" || return 75
  exec {lock_fd}> "$STATE_DIR/jobs/.locks/$id.lock" || return 75
  flock "$lock_fd" || return 75
  : > "$STATE_DIR/jobs/.canceled/$id" || return 75
  # The marker is set, so a later job_submit refuses. Release before the stop:
  # runner.sh takes this lock to publish its exit on TERM, and holding it here
  # held every stop of a live gate to TimeoutStopSec (90 s), past the 30 s
  # transport deadline, so each first --cancel-job was unconfirmed (10-19).
  flock -u "$lock_fd"
  if [ -d "$dir" ] && [ ! -f "$dir/exit" ]; then
    unit="beelink-gate-$id.service"
    manager=$(job_manager "$dir") || return 75
    [ "$manager" != system ] || control=(sudo -n /usr/bin/systemctl)
    "${control[@]}" stop "$unit" >&2 || true
    state=$(timeout --kill-after=1 "$job_status_timeout_seconds" "${control[@]}" show "$unit" -p ActiveState --value 2>/dev/null) || {
      # --collect may remove a stopped system unit. That is terminal only if
      # this exact gate process is also gone; ownership checks still apply.
      [ "${manager:-}" = system ] && ! gate_process_alive "$dir" || return 75
      state=inactive
    }
    case "$state" in
      inactive|failed) ;;
      *) echo "beelink-gate: $unit remains $state; retry cancellation" >&2; return 75 ;;
    esac
    if [ -f "$dir/submitted" ] && [ ! -f "$dir/gate.pid" ] && [ ! -f "$dir/exit" ]; then
      echo "beelink-gate: cannot confirm gate child for $id after unit stop; retry cancellation" >&2
      return 75
    fi
    if gate_process_alive "$dir"; then
      kill -TERM "$gate_pid" 2>/dev/null || true
      for ((i=0; i<100; i++)); do
        gate_process_alive "$dir" || break
        sleep 0.1
      done
      if gate_process_alive "$dir"; then
        echo "beelink-gate: gate child $gate_pid survived unit stop; retry cancellation" >&2
        return 75
      fi
    fi
    # The unit's cgroup may have killed runner.sh before it wrote its exit.
    # An attach then sees a terminal TEMPFAIL instead of waiting indefinitely.
    # A gate that finished before the stop keeps the exit runner.sh published.
    flock "$lock_fd" || return 75
    [ -f "$dir/exit" ] || { printf '75\n' > "$dir/exit.cancel.tmp" && mv -- "$dir/exit.cancel.tmp" "$dir/exit"; }
  fi
  echo "beelink-gate: canceled gate_id=$id" >&2
}

legacy_user_gate_units_drained() {
  local units
  units=$(timeout --kill-after=1 3 systemctl --user list-units --all \
    --type=service --state=active,activating --no-legend --plain 'beelink-gate-beelink*.service' 2>/dev/null) || return 2
  [ -z "$units" ] && return 0
  # Only these old unit names are supported. Unknown listing output is not
  # evidence of a drained lifecycle; a live unit may not have joined raw yet.
  while read -r unit _; do
    [[ "$unit" =~ ^beelink-gate-beelink[12]-[0-9a-f]{32}\.service$ ]] || return 2
  done <<< "$units"
  return 1
}

job_attach_remote() {
  local dir manager
  dir=$(job_dir_for "$1")
  [ -d "$dir" ] || die "unknown gate id: $1"
  manager=$(job_manager "$dir") || return 75
  python3 -u - "$dir" "$manager" "$job_status_timeout_seconds" <<'PY'
import pathlib, subprocess, sys, time
directory = pathlib.Path(sys.argv[1])
control = ['systemctl'] + (['--user'] if sys.argv[2] == 'user' else [])
streams = [(directory / "stdout.log", sys.stdout.buffer), (directory / "stderr.log", sys.stderr.buffer)]
offsets = [0, 0]
result = directory / "exit"
started = time.monotonic()
while True:
    for i, (log, output) in enumerate(streams):
        if log.exists():
            with log.open("rb") as stream:
                stream.seek(offsets[i])
                data = stream.read(65536)
            if data:
                output.write(data)
                output.flush()
                offsets[i] += len(data)
    if result.exists():
        code = result.read_text().strip()
        if any(log.exists() and log.stat().st_size > offsets[i] for i, (log, _) in enumerate(streams)):
            continue
        sys.exit(int(code) if code.isdigit() and 0 <= int(code) <= 255 else 75)
    if time.monotonic() - started > 60:
        unit = f"beelink-gate-{directory.name}.service"
        try:
            status = subprocess.run([*control, "show", unit, "-p", "ActiveState", "--value"],
                                    capture_output=True, text=True, timeout=float(sys.argv[3]))
            live = status.returncode == 0 and status.stdout.strip() in ('active', 'activating', 'reloading', 'deactivating')
        except (OSError, UnicodeError, subprocess.TimeoutExpired):
            live = False
        if not live:
            # runner.sh can publish its exit between the receipt check above and this
            # unit read; re-read it so a finished gate is never reported as TEMPFAIL.
            if result.exists():
                continue
            print(f"beelink-gate: {directory.name} stopped without an exit receipt; TEMPFAIL 75", file=sys.stderr)
            sys.exit(75)
        started = time.monotonic()
    time.sleep(0.2)
PY
}
job_result_remote() {
  local dir code
  dir=$(job_dir_for "$1")
  [ -f "$dir/exit" ] && [ ! -L "$dir/exit" ] || return 1
  code=$(cat "$dir/exit") || return 1
  [[ "$code" =~ ^([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])$ ]] || return 1
  printf '%s\n' "$code"
}
