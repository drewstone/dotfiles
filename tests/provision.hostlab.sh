#!/usr/bin/env bash
# shellcheck disable=SC2016 # the single-quoted commands expand in the VM
# Integration test for host/provision.sh in a throwaway hostlab VM.
#
# Run it on a KVM host that has hostlab, such as drew-gtr-pro:
#   tests/provision.hostlab.sh            # every module, then the freeze test
#   PROVISION_TEST_FREEZE=0 tests/provision.hostlab.sh
#
# In a fresh Ubuntu 24.04 Server VM, which has no NetworkManager, it:
#   1. sets the watchdog up the way drew-gtr-pro had it (PID 1 takes the softdog)
#   2. runs --check, which must drift and write nothing, then provisions as drew
#   3. provisions again and fails on any "changed" line; requires --check to
#      exit 0 without writing; requires the passphrase to be stored exactly and
#      to appear in no log; requires the official Claude plugins
#   4. reboots; requires the watchdog daemon, not PID 1, to hold the softdog,
#      a restart of it to succeed, systemd-networkd-wait-online to stay off,
#      and no change from a run
#   5. stores an agent-owned Wi-Fi passphrase, and keeps a stored passphrase
#      unless --replace-psk is given
#   6. formats a scsi_debug disk with host/bin/format-traces-drive, requires
#      each refusal, and requires the traces module to mount it for drew
#   7. freezes / and requires the VM to reset by itself
# It stops and removes only its own VM. Logs stay in the printed directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOSTLAB="${HOSTLAB:-$ROOT/claude/tools/hostlab}"
FREEZE="${PROVISION_TEST_FREEZE:-1}"
STAGE="$(mktemp -d /tmp/provision-hostlab.XXXXXX)"
LOGS="$STAGE/logs"
mkdir -p "$LOGS"
rsync -a --exclude .git --exclude node_modules "$ROOT/" "$STAGE/dotfiles/"
# Passphrases with the characters that break naive handling: leading and
# trailing spaces, a colon, a backslash and quotes.
printf ' c:orrect \\horse "battery" %s \n' "'staple'" >"$STAGE/psk"
printf 'second passphrase 2\n' >"$STAGE/psk2"
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
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
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

no_changes() { ! grep '^  changed' "$LOGS/$1.log" >/dev/null || fail "$1 changed something: $(grep '^  changed' "$LOGS/$1.log")"; }

# mark / writes NAME: the paths under drew's home that --check may not touch.
mark() { vm 'touch /root/.mark; sleep 1.1'; }
no_writes() {
  vm 'find /home/drew/.ssh /home/drew/snap /home/drew/.config /home/drew/.bashrc -newer /root/.mark 2>/dev/null' >"$LOGS/$1-writes.log" 2>&1 || true
  [ ! -s "$LOGS/$1-writes.log" ] || fail "$1 wrote files: $(tr '\n' ' ' <"$LOGS/$1-writes.log")"
}

stored_psk_is() { vm "[ \"\$(nmcli -e no -s -g 802-11-wireless-security.psk connection show id $1)\" = \"\$(cat $2)\" ]"; }

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
install -o drew -g drew -m 600 /work/psk /home/drew/psk
install -o drew -g drew -m 600 /work/psk2 /home/drew/psk2
! command -v nmcli
mkdir -p /etc/systemd/system.conf.d
printf "[Manager]\nRuntimeWatchdogSec=30s\nRebootWatchdogSec=10min\n" >/etc/systemd/system.conf.d/10-watchdog.conf
' >"$LOGS/setup.log" 2>&1 || fail "setup (see $LOGS/setup.log)"
reboot_vm
vm 'for d in /sys/class/watchdog/*; do echo "$d $(cat $d/identity)"; done; fuser -v /dev/watchdog0 2>&1; journalctl -b -u watchdog --no-pager | grep -i "cannot open" || true' >"$LOGS/watchdog-before.log" 2>&1 || true
say "watchdog before: $(tr '\n' ' ' <"$LOGS/watchdog-before.log" | cut -c1-200)"

# ── 2. check, then provision ────────────────────────────────────────────────
mark
provision check-fresh "--check" && fail "--check on a fresh box reported no drift"
no_writes check-fresh
provision apply-1 "--wifi-ssid testnet --wifi-psk-file /home/drew/psk" || say "apply-1 reported failures (see log)"

# ── 3. idempotence, a read-only check, the passphrase, the plugins ──────────
provision apply-2 "--wifi-ssid testnet --wifi-psk-file /home/drew/psk" || fail "apply-2 failed"
no_changes apply-2
mark
provision check-2 "--check" || fail "--check after apply reported drift"
no_writes check-2
stored_psk_is testnet /work/psk || fail "testnet does not store the passphrase exactly"
vm 'n=$(journalctl --no-pager | grep -cF "c:orrect" || true); a=$(grep -cF "c:orrect" /var/log/auth.log || true); echo "journal=$n auth.log=$a"; [ "$n" = 0 ] && [ "$a" = 0 ]' \
  >"$LOGS/psk-logs.log" 2>&1 || fail "the passphrase reached a log: $(cat "$LOGS/psk-logs.log")"
vm 'runuser -l drew -c "cd ~/code/dotfiles && claude/install.sh" 2>&1' >"$LOGS/claude-install-2.log" 2>&1 || fail "claude/install.sh (see log)"
! grep -E 'ADD marketplace|WARN' "$LOGS/claude-install-2.log" | grep -v 'tangle-skills-internal\|agent-factory\|agent-platform' ||
  fail "claude/install.sh re-added a marketplace or failed a public plugin: $(grep -E 'ADD|WARN' "$LOGS/claude-install-2.log")"
vm 'for p in rust-analyzer-lsp frontend-design mattpocock-skills; do [ -d /home/drew/.claude/plugins/cache/claude-plugins-official/$p ] || { echo "missing $p"; exit 1; }; done' \
  >"$LOGS/plugins.log" 2>&1 || fail "official plugins: $(cat "$LOGS/plugins.log")"

# ── 4. after a reboot ───────────────────────────────────────────────────────
reboot_vm
vm '
set -e
dev=$(readlink -f /dev/watchdog-softdog)
holder=$(fuser "$dev" 2>/dev/null | tr -d " ")
echo "softdog=$dev holder=$holder comm=$(ps -o comm= -p "$holder")"
[ "$(ps -o comm= -p "$holder")" = watchdog ]
! journalctl -b -u watchdog --no-pager | grep "cannot open" >/dev/null
cat /sys/class/watchdog/$(basename "$dev")/state
echo "failed units: $(systemctl --failed --no-legend --plain | tr "\n" " ")"
echo "wait-online $(systemctl is-enabled systemd-networkd-wait-online.service || true), gdm $(systemctl is-active gdm)"
! systemctl is-failed --quiet systemd-networkd-wait-online.service
[ "$(systemctl is-enabled systemd-networkd-wait-online.service)" = disabled ]
' >"$LOGS/after-reboot.log" 2>&1 || fail "after reboot: $(cat "$LOGS/after-reboot.log")"
say "after reboot: $(tr '\n' ' ' <"$LOGS/after-reboot.log")"
vm '
set -e
systemctl restart watchdog
sleep 3
systemctl show watchdog -p Result -p NRestarts -p ActiveState
[ "$(systemctl show watchdog -p Result --value)" = success ]
! systemctl is-active --quiet wd_keepalive
[ "$(ps -o comm= -p "$(fuser "$(readlink -f /dev/watchdog-softdog)" 2>/dev/null | tr -d " ")")" = watchdog ]
' >"$LOGS/watchdog-restart.log" 2>&1 || fail "watchdog restart: $(cat "$LOGS/watchdog-restart.log")"
provision check-3 "--check" || fail "--check after reboot reported drift"
provision apply-3 "" || fail "apply-3 failed"
no_changes apply-3

# ── 5. Wi-Fi passphrases ────────────────────────────────────────────────────
vm 'nmcli connection add type wifi con-name oldnet ssid oldnet wifi-sec.key-mgmt wpa-psk wifi-sec.psk-flags 1 >/dev/null'
provision wifi-agent-owned "wifi" || true
grep 'oldnet: the passphrase is not stored system-wide' "$LOGS/wifi-agent-owned.log" >/dev/null || fail "no step for oldnet's agent-owned passphrase"
provision wifi-store "wifi --wifi-ssid oldnet --wifi-psk-file /home/drew/psk" || fail "wifi-store failed"
stored_psk_is oldnet /work/psk || fail "oldnet does not store the passphrase"
provision wifi-again "wifi --wifi-ssid oldnet --wifi-psk-file /home/drew/psk" || fail "wifi-again failed"
no_changes wifi-again
provision wifi-keep "wifi --wifi-ssid testnet --wifi-psk-file /home/drew/psk2" && fail "a different passphrase replaced the stored one"
stored_psk_is testnet /work/psk || fail "the stored passphrase changed without --replace-psk"
provision wifi-replace "wifi --wifi-ssid testnet --wifi-psk-file /home/drew/psk2 --replace-psk" || fail "wifi-replace failed"
stored_psk_is testnet /work/psk2 || fail "--replace-psk did not store the new passphrase"
vm 'ls /var/backups/NetworkManager/ | grep . && [ "$(stat -c %a /var/backups/NetworkManager)" = 700 ]' >"$LOGS/psk-backup.log" 2>&1 || fail "no root-only backup of the old profile"

# ── 6. trace drive ──────────────────────────────────────────────────────────
F=/home/drew/code/dotfiles/host/bin/format-traces-drive
scsi_disk() {
  vm 'udevadm settle; lsblk -dnPo NAME,MODEL,SERIAL,TRAN | grep -i scsi_debug' >"$LOGS/scsi.log" 2>&1 || fail "no scsi_debug disk"
  SD_NAME="$(sed -n 's/.*NAME="\([^"]*\)".*/\1/p' "$LOGS/scsi.log" | head -1)"
  SD_MODEL="$(sed -n 's/.*MODEL="\([^"]*\)".*/\1/p' "$LOGS/scsi.log" | head -1)"
  SD_SERIAL="$(sed -n 's/.*SERIAL="\([^"]*\)".*/\1/p' "$LOGS/scsi.log" | head -1)"
  [ -n "$SD_SERIAL" ] || fail "the scsi_debug disk has no serial: $(cat "$LOGS/scsi.log")"
  say "scsi_debug disk /dev/$SD_NAME model=$SD_MODEL serial=$SD_SERIAL"
}
# erase NAME INPUT PRE: run the eraser as drew on a terminal; PRE runs first.
erase() {
  vm "$3 runuser -l drew -c \"script -qec 'sudo $F --model $SD_MODEL --serial $SD_SERIAL' /dev/null\" $2" >"$LOGS/$1.log" 2>&1
}
refused() { grep "$2" "$LOGS/$1.log" >/dev/null || fail "$1 did not refuse with '$2': $(tail -3 "$LOGS/$1.log")"; }

vm 'modprobe scsi_debug dev_size_mb=256' || fail "scsi_debug"
scsi_disk
vm "runuser -l drew -c 'sudo $F --model $SD_MODEL --serial nosuchserial' </dev/null" >"$LOGS/format-refuse-serial.log" 2>&1 &&
  fail "format accepted a serial no disk has"
vm "runuser -l drew -c 'sudo $F --model wrongmodel --serial $SD_SERIAL' </dev/null" >"$LOGS/format-refuse-model.log" 2>&1 &&
  fail "format accepted the wrong model"
vm "echo ERASE | runuser -l drew -c 'sudo $F --model $SD_MODEL --serial $SD_SERIAL'" >"$LOGS/format-no-tty.log" 2>&1 &&
  fail "format accepted ERASE from a pipe"
vm "install -d -o drew /home/drew/agent && printf '#!/bin/sh\nsudo \"\$@\"\n' >/home/drew/agent/claude && chmod 755 /home/drew/agent/claude &&
  runuser -l drew -c \"script -qec '/home/drew/agent/claude $F --model $SD_MODEL --serial $SD_SERIAL' /dev/null\" <<<ERASE" \
  >"$LOGS/format-refuse-agent.log" 2>&1 && fail "format ran under a process named claude"
refused format-refuse-agent "an agent started this"
# The disk goes away while the prompt waits, and a new one takes its name.
erase format-refuse-swap "" "(sleep 8; echo 1 >/sys/block/$SD_NAME/device/delete; echo 1 >/sys/bus/pseudo/drivers/scsi_debug/add_host) & (sleep 20; printf 'ERASE\n') |" &&
  fail "format erased after the disk changed under the prompt"
refused format-refuse-swap "REFUSING"
vm 'udevadm settle; lsblk -nro NAME,LABEL | grep -w traces' >"$LOGS/swap-untouched.log" 2>&1 && fail "the new disk was formatted: $(cat "$LOGS/swap-untouched.log")"
scsi_disk
erase format "<<<ERASE" "" || fail "format (see $LOGS/format.log)"
vm 'findmnt -no SOURCE,FSTYPE /mnt/traces && stat -c %U /mnt/traces && grep " /mnt/traces " /etc/fstab && ls /etc/fstab.pre-dotfiles.*' >"$LOGS/traces.log" 2>&1 || fail "traces not mounted"
say "traces: $(tr '\n' ' ' <"$LOGS/traces.log")"
provision check-traces "--check traces" || fail "--check traces reported drift"
# The disk that holds /boot is refused before anything else.
vm "umount /mnt/traces && mount /dev/${SD_NAME}1 /boot" || fail "mount the test disk at /boot"
erase format-refuse-boot "<<<ERASE" "" && fail "format accepted the disk that holds /boot"
vm "umount /boot && mount /mnt/traces" || fail "restore /mnt/traces"
refused format-refuse-boot "holds /boot"

# ── 7. frozen root resets the box ───────────────────────────────────────────
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
