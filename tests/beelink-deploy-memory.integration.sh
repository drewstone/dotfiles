#!/usr/bin/env bash
# Real cgroup/kernel proof on a Beelink, never a host-wide exhaustion test.
# At most 128M + 64M charged: the gate must hit its OWN cap while a deploy
# canary continues. Policy inspection is separate from this scaled load proof.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
[[ $(id -u) == 0 ]] || { echo 'run as root' >&2; exit 77; }
bash "$ROOT/host/cgroup/beelink-memory-policy" --check
# A future rootless Docker scope must inherit the container-slice floor.
uid=$(id -u ghrunner-adcprod)
sudo -n -H -u ghrunner-adcprod env XDG_RUNTIME_DIR="/run/user/$uid" \
  systemd-run --user --quiet --scope --slice=user.slice bash -c \
  'group=$(cut -d: -f3 /proc/self/cgroup); test "$(cat /sys/fs/cgroup$group/memory.min)" = 8589934592'
# This integration command itself must use the maintained gate admission path.
grep -q '^0::/beelink-gate$' /proc/self/cgroup
[[ $(cat /sys/fs/cgroup/beelink-gate/memory.max) == 25769803776 ]]
# The synthetic allocator gets a scaled service-local limit; never exhaust the
# real 24G aggregate shared with other lanes' active gates.

work=$(mktemp -d)
nonce="$$-$(date +%s)"
deploy="adc-memory-proof-deploy-$nonce"
gate="adc-memory-proof-gate-$nonce"
cleanup() {
  # Only our named disposable services, never an Actions runner.
  systemctl stop "$deploy.service" "$gate.service" >/dev/null 2>&1 || true
  systemctl reset-failed "$deploy.service" "$gate.service" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
cat >"$work/load.py" <<'PY'
import pathlib,sys,time
kind,root=sys.argv[1:]
root=pathlib.Path(root)
if kind=='deploy':
    data=bytearray(32*1024*1024)
    (root/'ready').touch()
    deadline=time.monotonic()+30
    while not (root/'gate-finished').exists():
        if time.monotonic()>deadline: raise SystemExit('gate proof deadline')
        data[0]=(data[0]+1)%256
        time.sleep(.01)
    (root/'survived').touch()
else:
    data=[]
    for _ in range(160):
        data.append(bytearray(1024*1024))
    raise SystemExit('gate exceeded its cap without OOM')
PY
# The canary is in the real deploy ancestor; it does not run deploy code or
# mutate production. A 30s service bound is independent of the harness timer.
systemd-run --quiet --unit="$deploy" --slice=deploy-runners.slice \
  -p MemoryMin=32M -p MemoryMax=128M -p MemorySwapMax=0 \
  -p RuntimeMaxSec=35 python3 "$work/load.py" deploy "$work"
for _ in $(seq 1 300); do
  [[ ! -f "$work/ready" ]] || break
  sleep .05
done
[[ -f "$work/ready" ]] || { echo 'deploy canary did not start' >&2; exit 1; }
ancestor=$(systemctl show deploy-runners.slice -p ControlGroup --value)
before=$(awk '$1=="oom_kill" {print $2}' "/sys/fs/cgroup$ancestor/memory.events")
set +e
systemd-run --quiet --wait --pipe --unit="$gate" \
  -p MemoryMax=64M -p MemorySwapMax=0 -p RuntimeMaxSec=15 \
  python3 "$work/load.py" gate "$work" >"$work/gate.log" 2>&1
status=$?
set -e
result=$(systemctl show "$gate.service" -p Result --value)
[[ $status != 0 && $result == oom-kill ]] || { cat "$work/gate.log"; echo "expected gate OOM, got status=$status result=$result" >&2; exit 1; }
# Positive completion after the kernel killed the other workload.
touch "$work/gate-finished"
for _ in $(seq 1 300); do
  [[ ! -f "$work/survived" ]] || break
  sleep .05
done
[[ -f "$work/survived" ]] || { echo 'deploy canary did not survive' >&2; exit 1; }
after=$(awk '$1=="oom_kill" {print $2}' "/sys/fs/cgroup$ancestor/memory.events")
[[ $after == "$before" ]] || { echo 'deploy ancestor OOM counter increased' >&2; exit 1; }
echo "PASS gate_result=$result gate_exit=$status deploy_survived=true deploy_oom_delta=0 max_test_memory=192MiB"
