#!/usr/bin/env bash
# shellcheck disable=SC2016 # the single-quoted commands expand in the VM
# Integration test for host/provision.sh in a throwaway hostlab VM.
#
# Run it on a KVM host that has hostlab, such as drew-gtr-pro:
#   tests/provision.hostlab.sh            # every module, then the freeze test
#   PROVISION_TEST_FREEZE=0 tests/provision.hostlab.sh
#
# In a fresh Ubuntu 24.04 VM it:
#   1. sets the watchdog up the way drew-gtr-pro had it (PID 1 takes the softdog)
#   2. runs --check (drift expected), then provisions as user drew
#   3. provisions again and fails on any "changed" line, then requires --check
#      to exit 0
#   4. reboots and requires the watchdog daemon, not PID 1, to hold the softdog
#   5. formats a scsi_debug disk with host/bin/format-traces-drive, requires
#      the refusals, and requires the traces module to mount it for drew
#   6. freezes / and requires the VM to reset by itself
# It stops and removes only its own VM. Logs stay in the printed directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOSTLAB="${HOSTLAB:-$ROOT/claude/tools/hostlab}"
FREEZE="${PROVISION_TEST_FREEZE:-1}"
STAGE="$(mktemp -d /tmp/provision-hostlab.XXXXXX)"
LOGS="$STAGE/logs"
mkdir -p "$LOGS"
rsync -a --exclude .git --exclude node_modules "$ROOT/" "$STAGE/dotfiles/"
ID=""

say() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
fail() { say "FAIL: $*"; exit 1; }

# vm CMD: run CMD as root in the VM, from /work (= $STAGE).
vm() { "$HOSTLAB" ssh "$ID" -- "$1"; }
# vm_quick CMD: the same, but give up after 20 s (a frozen VM hangs ssh).
vm_quick() { timeout 20 "$HOSTLAB" ssh "$ID" -- "$1"; }

cleanup() {
  [ -n "$ID" ] || return 0
  vm 'systemctl poweroff' >/dev/null 2>&1 || true
  sleep 5
  pid="$(cat "$HOME/.cache/hostlab/runs/$ID/qemu.pid" 2>/dev/null || true)"
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  rm -rf "${HOME:?}/.cache/hostlab/runs/$ID"
  say "removed VM $ID; logs in $LOGS"
}
trap cleanup EXIT
trap 'exit 143' TERM INT

wait_up() {
  local t=0
  sleep 10
  until vm true >/dev/null 2>&1; do
    t=$((t + 5))
    [ "$t" -lt 300 ] || fail "VM did not come back within 300 s"
    sleep 5
  done
  vm 'systemctl is-system-running --wait >/dev/null 2>&1; true'
}

reboot_vm() {
  vm 'systemctl reboot' >/dev/null 2>&1 || true
  wait_up
}

boot_id() { vm_quick 'cat /proc/sys/kernel/random/boot_id' 2>/dev/null || true; }

# provision NAME ARGS: run host/provision.sh as drew; log to $LOGS/NAME.log.
provision() {
  local name="$1" args="$2" rc=0
  vm "runuser -l drew -c 'cd ~/code/dotfiles && host/provision.sh $args'" >"$LOGS/$name.log" 2>&1 || rc=$?
  say "$name: exit $rc, $(sed -n 's/^== summary: //p' "$LOGS/$name.log")"
  return "$rc"
}

say "staging $ROOT at $STAGE"
"$HOSTLAB" run --keep --mem 8G --cpus 4 --work "$STAGE" -- true 2>"$LOGS/boot.log" || fail "hostlab run"
ID="$(sed -n 's/^hostlab: kept \([^ ]*\) .*/\1/p' "$LOGS/boot.log")"
[ -n "$ID" ] || fail "no VM id in $LOGS/boot.log"
say "VM $ID"

# ── 1. a fresh box, with the watchdog the way drew-gtr-pro had it ───────────
vm '
set -e
useradd -m -s /bin/bash -G sudo drew
echo "drew ALL=(ALL) NOPASSWD: ALL" >/etc/sudoers.d/90-provision-test
chmod 440 /etc/sudoers.d/90-provision-test
mkdir -p /home/drew/code && cp -a /work/dotfiles /home/drew/code/dotfiles && chown -R drew:drew /home/drew/code
DEBIAN_FRONTEND=noninteractive apt-get install -y -q network-manager >/dev/null
systemctl enable --now NetworkManager >/dev/null 2>&1
nmcli connection add type wifi con-name oldnet ssid oldnet wifi-sec.key-mgmt wpa-psk wifi-sec.psk-flags 1 >/dev/null
printf "correct horse battery\n" >/home/drew/psk && chown drew:drew /home/drew/psk && chmod 600 /home/drew/psk
mkdir -p /etc/systemd/system.conf.d
printf "[Manager]\nRuntimeWatchdogSec=30s\nRebootWatchdogSec=10min\n" >/etc/systemd/system.conf.d/10-watchdog.conf
' >"$LOGS/setup.log" 2>&1 || fail "setup (see $LOGS/setup.log)"
reboot_vm
vm 'for d in /sys/class/watchdog/*; do echo "$d $(cat $d/identity)"; done; fuser -v /dev/watchdog0 2>&1; journalctl -b -u watchdog --no-pager | grep -i "cannot open" || true' >"$LOGS/watchdog-before.log" 2>&1 || true
say "watchdog before: $(tr '\n' ' ' <"$LOGS/watchdog-before.log" | cut -c1-200)"

# ── 2. check, then provision ────────────────────────────────────────────────
provision check-fresh "--check" && fail "--check on a fresh box reported no drift"
provision apply-1 "--wifi-ssid testnet --wifi-psk-file /home/drew/psk" || say "apply-1 reported failures (see log)"

# ── 3. idempotence ──────────────────────────────────────────────────────────
provision apply-2 "--wifi-ssid testnet --wifi-psk-file /home/drew/psk" || fail "apply-2 failed"
grep -q '^  changed' "$LOGS/apply-2.log" && fail "apply-2 changed something: $(grep '^  changed' "$LOGS/apply-2.log")"
provision check-2 "--check" || fail "--check after apply reported drift"

# ── 4. the watchdog after a reboot ──────────────────────────────────────────
reboot_vm
vm '
set -e
dev=$(readlink -f /dev/watchdog-softdog)
holder=$(fuser "$dev" 2>/dev/null | tr -d " ")
echo "softdog=$dev holder=$holder comm=$(ps -o comm= -p "$holder")"
[ "$(ps -o comm= -p "$holder")" = watchdog ]
! journalctl -b -u watchdog --no-pager | grep "cannot open" >/dev/null
cat /sys/class/watchdog/$(basename "$dev")/state
' >"$LOGS/watchdog-after.log" 2>&1 || fail "watchdog after reboot: $(cat "$LOGS/watchdog-after.log")"
say "watchdog after: $(tr '\n' ' ' <"$LOGS/watchdog-after.log")"
provision check-3 "--check" || fail "--check after reboot reported drift"

# ── 5. trace drive ──────────────────────────────────────────────────────────
vm 'modprobe scsi_debug dev_size_mb=256 && udevadm settle && lsblk -dnPo NAME,MODEL,SERIAL,TRAN | grep -i scsi_debug' >"$LOGS/scsi.log" 2>&1 || fail "scsi_debug"
SD_NAME="$(sed -n 's/.*NAME="\([^"]*\)".*/\1/p' "$LOGS/scsi.log" | head -1)"
SD_MODEL="$(sed -n 's/.*MODEL="\([^"]*\)".*/\1/p' "$LOGS/scsi.log" | head -1)"
SD_SERIAL="$(sed -n 's/.*SERIAL="\([^"]*\)".*/\1/p' "$LOGS/scsi.log" | head -1)"
[ -n "$SD_SERIAL" ] || fail "the scsi_debug disk has no serial: $(cat "$LOGS/scsi.log")"
say "scsi_debug disk /dev/$SD_NAME model=$SD_MODEL serial=$SD_SERIAL"
F=/home/drew/code/dotfiles/host/bin/format-traces-drive
vm "runuser -l drew -c 'sudo $F --model $SD_MODEL --serial nosuchserial' </dev/null" >"$LOGS/format-refuse-serial.log" 2>&1 &&
  fail "format accepted a serial no disk has"
vm "runuser -l drew -c 'sudo $F --model wrongmodel --serial $SD_SERIAL' </dev/null" >"$LOGS/format-refuse-model.log" 2>&1 &&
  fail "format accepted the wrong model"
vm "echo ERASE | runuser -l drew -c 'sudo $F --model $SD_MODEL --serial $SD_SERIAL'" >"$LOGS/format-no-tty.log" 2>&1 &&
  fail "format accepted ERASE from a pipe"
vm "runuser -l drew -c \"script -qec 'sudo $F --model $SD_MODEL --serial $SD_SERIAL' /dev/null\" <<<ERASE" >"$LOGS/format.log" 2>&1 ||
  fail "format (see $LOGS/format.log)"
vm 'findmnt -no SOURCE,FSTYPE /mnt/traces && stat -c %U /mnt/traces && grep " /mnt/traces " /etc/fstab' >"$LOGS/traces.log" 2>&1 || fail "traces not mounted"
say "traces: $(tr '\n' ' ' <"$LOGS/traces.log")"
provision check-traces "--check traces" || fail "--check traces reported drift"

# ── 6. frozen root resets the box ───────────────────────────────────────────
if [ "$FREEZE" = 1 ]; then
  before="$(boot_id)"
  say "freezing / (boot $before); the softdog should reset the VM in about 4 minutes"
  # The real binary: the provisioned guard wrapper refuses a freeze of /.
  vm_quick 'nohup sh -c "sleep 2; /usr/sbin/fsfreeze -f /" >/dev/null 2>&1 &' || true
  start=$(date +%s)
  sleep 60
  until now="$(boot_id)" && [ -n "$now" ] && [ "$now" != "$before" ]; do
    [ $(($(date +%s) - start)) -lt 600 ] || fail "no reset within 600 s of the freeze"
    sleep 10
  done
  say "reset: a new boot answered $(($(date +%s) - start)) s after the freeze"
fi
say "PASS"
