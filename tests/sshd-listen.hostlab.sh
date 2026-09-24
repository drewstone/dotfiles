#!/usr/bin/env bash
# Integration test for the tools module's sshd listen step in a throwaway
# hostlab VM.
#
# Run it on a KVM host that has hostlab, such as drew-gtr-pro:
#   tests/sshd-listen.hostlab.sh
#
# In a fresh Ubuntu 24.04 VM, with a stub tailscale that reports 100.64.7.7
# and fd7a:115c:a1e0::77 before either address exists, it:
#   1. starts from drew-gtr-pro's layout (ssh.service enabled, ssh.socket off,
#      ports 22 and 2200 from a hand-made 10-fallback-port.conf) and requires
#      the step to refuse while that file sets ports
#   2. removes that file, applies, and requires a second apply and --check to
#      report ok with no change
#   3. adds the addresses afterwards, as tailscaled does at boot, and requires
#      key login on both tailnet addresses and on loopback for both ports, and
#      "Connection refused" on the LAN address for both ports
#   4. runs the rollback commands and requires LAN login again
#   5. starts again from Ubuntu's own layout (ssh.socket on every address) and
#      requires the same result as 2 and 3
# It stops and removes only its own VM. The VM log is printed at the end.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOSTLAB="${HOSTLAB:-$ROOT/claude/tools/hostlab}"
TS4=100.64.7.7
TS6=fd7a:115c:a1e0::77

inside() {
  # The checks below expect refused logins and report every failure with
  # fail, so a failed command must not end the run on its own.
  set +e -uo pipefail
  cd /work/dotfiles || exit 1
  # shellcheck source=host/provision/lib.sh
  . host/provision/lib.sh
  # shellcheck source=host/provision/tools.sh
  . host/provision/tools.sh
  HOST_DIR=/work/dotfiles/host
  WORK="$(mktemp -d)"
  tailscale() {
    case "$2" in
      -4) echo "$TS4" ;;
      -6) echo "$TS6" ;;
    esac
  }
  local eth
  eth="$(ip -4 -o addr show scope global | awk '{ print $4 }' | cut -d/ -f1 | head -1)"
  install -d -m 0700 /root/.ssh
  ssh-keygen -q -t ed25519 -N '' -f /root/k
  cat /root/k.pub >>/root/.ssh/authorized_keys

  say() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
  fail() { say "FAIL: $*"; exit 1; }
  # step MODE: run the step alone; prints "ok changed failed".
  step() {
    N_OK=0 N_CHANGED=0 N_FAILED=0 N_DRIFT=0
    PROVISION_MODE="$1" want_sshd_listen >&2
    echo "$N_OK $N_CHANGED $N_FAILED $N_DRIFT"
  }
  addrs_off() { ip link del ts0 2>/dev/null || true; }
  addrs_on() {
    say "adding $TS4 and $TS6 on a dummy interface"
    ip link add ts0 type dummy
    ip addr add "$TS4/32" dev ts0
    ip -6 addr add "$TS6/128" dev ts0 nodad
    ip link set ts0 up
    sleep 1
  }
  login() {
    ssh -i /root/k -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o ConnectTimeout=4 -p "$1" "root@$2" echo in 2>&1 | tail -1
  }
  prove() {
    local a p out
    for a in "$TS4" "$TS6" 127.0.0.1 ::1; do
      for p in $SSHD_PORTS; do
        out="$(login "$p" "$a")"
        [ "$out" = in ] || fail "no login on $a port $p: $out"
      done
    done
    for p in $SSHD_PORTS; do
      out="$(login "$p" "$eth")"
      case "$out" in
        *"Connection refused"*) ;;
        *) fail "the LAN address $eth answers on port $p: $out" ;;
      esac
    done
    say "login on $TS4, $TS6 and loopback; refused on the LAN address $eth"
  }
  apply_twice() {
    local r
    r="$(step apply)"
    [ "$r" = "0 1 0 0" ] || fail "first apply: ok/changed/failed/drift = $r"
    r="$(step apply)"
    [ "$r" = "1 0 0 0" ] || fail "second apply changed something: $r"
    r="$(step check)"
    [ "$r" = "1 0 0 0" ] || fail "--check after apply: $r"
    ss -Hltn "( sport = :22 or sport = :2200 )" | awk '{ print $4 }' | sort -u >&2
    say "applied once; a second apply and --check report ok"
  }
  # rollback: the commands the pull request gives for undoing the step. Both
  # units stop together; a socket stopped first orphans a running sshd, which
  # keeps its listeners outside any unit.
  rollback() {
    systemctl stop ssh.socket ssh.service
    rm -f "$SSHD_LISTEN"
    printf 'Port 22\nPort 2200\n' >"$SSHD_CONFIG_D/10-fallback-port.conf"
    systemctl disable --quiet ssh.socket
    systemctl daemon-reload
    systemctl enable --quiet --now ssh.service
  }

  say "1. drew-gtr-pro's layout: ssh.service on every address, ports from a hand-made file"
  rollback
  [ "$(login 22 "$eth")" = in ] || fail "the starting layout does not answer on the LAN"
  r="$(step apply 2>"$WORK/err")"
  [ "$r" = "0 0 1 0" ] || fail "the step did not refuse 10-fallback-port.conf: $r"
  grep -F "10-fallback-port.conf: Port 2200" "$WORK/err" >/dev/null || fail "the refusal does not name the file: $(cat "$WORK/err")"
  [ ! -e "$SSHD_LISTEN" ] || fail "the refusal installed $SSHD_LISTEN"
  say "refused while 10-fallback-port.conf sets ports"

  say "2. apply before the tailnet address exists"
  rm "$SSHD_CONFIG_D/10-fallback-port.conf"
  apply_twice
  say "3. the address appears later"
  addrs_on
  prove

  say "4. rollback"
  addrs_off
  rollback
  [ "$(login 22 "$eth")" = in ] || fail "no LAN login after the rollback"
  say "LAN login works after the rollback"

  say "5. Ubuntu's own layout: ssh.socket on every address"
  systemctl stop ssh.service
  rm -f "$SSHD_CONFIG_D/10-fallback-port.conf"
  systemctl disable --quiet ssh.service
  systemctl daemon-reload
  systemctl enable --quiet --now ssh.socket
  [ "$(login 22 "$eth")" = in ] || fail "Ubuntu's layout does not answer on the LAN"
  apply_twice
  addrs_on
  prove
  say "PASS"
}

if [ "${1:-}" = inside ]; then
  inside
  exit
fi

STAGE="$(mktemp -d /tmp/sshd-listen-hostlab.XXXXXX)"
RUNS="${HOSTLAB_HOME:-$HOME/.cache/hostlab}/runs"
ID=""
cleanup() {
  if [ -n "$ID" ]; then
    pid="$(cat "$RUNS/$ID/qemu.pid" 2>/dev/null || true)"
    if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
    rm -rf "${RUNS:?}/$ID"
  fi
  rm -rf "$STAGE"
}
trap cleanup EXIT
rsync -a --exclude .git --exclude node_modules "$ROOT/" "$STAGE/dotfiles/"
# The test closes the VM's LAN door, and hostlab reaches the VM through that
# door. So the test runs in its own unit, not under the ssh session, and
# reports through the shared /work.
out="$("$HOSTLAB" run --keep --mem 2G --cpus 2 --work "$STAGE" -- \
  "systemd-run --quiet --unit=sshd-listen-test bash -c 'bash /work/dotfiles/tests/sshd-listen.hostlab.sh inside >/work/log 2>&1'" 2>&1)" || true
ID="$(sed -n 's/^hostlab: kept \([^ ]*\) .*/\1/p' <<<"$out")"
[ -n "$ID" ] || { printf '%s\n' "$out"; exit 1; }
for _ in $(seq 150); do
  grep -E '^\[[0-9:]+\] (PASS|FAIL:)' "$STAGE/log" >/dev/null 2>&1 && break
  sleep 2
done
cat "$STAGE/log"
if ! grep -E '^\[[0-9:]+\] PASS$' "$STAGE/log" >/dev/null; then
  echo "== VM console (tail)"
  tail -40 "$RUNS/$ID/console.log" 2>/dev/null || true
  exit 1
fi
