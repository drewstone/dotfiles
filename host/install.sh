#!/usr/bin/env bash
# Install the host guards on this Linux box. Needs sudo. Idempotent.
#
#   /usr/local/lib/host-blast-guard.sh     shared checks
#   /usr/local/sbin/<verb>                 root wrappers; secure_path puts them first
#   /etc/sudoers.d/zz-agent-blast-guard    closes the absolute-path route
#   /etc/watchdog.conf, /etc/watchdog.d/root-write, /etc/default/watchdog,
#   /etc/modules-load.d, /etc/modprobe.d, watchdog.service drop-in
#                                          a frozen root resets the box in ~4 min (measured)
#   ~/.config/systemd/user/cli-bridge-llm.slice(.d/10-cpu-cap.conf)
#                                          cli-bridge LLM scopes capped at 24 of 32 cores
#
# Why: see host/lib/host-blast-guard.sh. Re-run after editing anything here.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(uname -s)" = Linux ] || { echo "host/install.sh is Linux-only"; exit 0; }
SUDO=sudo
[ "$(id -u)" = 0 ] && SUDO=

LVM_VERBS="pvcreate vgcreate lvcreate lvremove vgremove pvremove lvchange vgchange lvconvert lvresize lvextend lvreduce vgextend vgreduce pvresize vgrename lvrename pvmove lvm"
DEVICE_VERBS="mkfs mkfs.ext2 mkfs.ext3 mkfs.ext4 mkfs.xfs mkfs.btrfs mkfs.vfat mkfs.fat mke2fs mkswap wipefs blkdiscard sgdisk sfdisk fdisk parted dd"

echo "== wrappers"
$SUDO install -D -m 0755 "$SCRIPT_DIR/lib/host-blast-guard.sh" /usr/local/lib/host-blast-guard.sh
for w in fsfreeze unshare mount umount dmsetup lvm-guard device-write-guard; do
  $SUDO install -m 0755 "$SCRIPT_DIR/sbin/$w" "/usr/local/sbin/$w"
done
for v in $LVM_VERBS; do $SUDO ln -sfn lvm-guard "/usr/local/sbin/$v"; done
for v in $DEVICE_VERBS; do $SUDO ln -sfn device-write-guard "/usr/local/sbin/$v"; done

echo "== sudoers"
tmp="$(mktemp)"
cp "$SCRIPT_DIR/sudoers.d/zz-agent-blast-guard" "$tmp"
$SUDO visudo -cf "$tmp" >/dev/null
$SUDO install -m 0440 -o root -g root "$tmp" /etc/sudoers.d/zz-agent-blast-guard
rm -f "$tmp"
$SUDO visudo -c >/dev/null

echo "== watchdog"
if ! command -v watchdog >/dev/null 2>&1 && [ ! -x /usr/sbin/watchdog ]; then
  $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y watchdog >/dev/null
fi
# Load order fixes the numbering: the hardware timer (if any) becomes
# /dev/watchdog0 for systemd, softdog comes after it for the daemon.
printf 'sp5100_tco\nsoftdog\n' | $SUDO tee /etc/modules-load.d/host-guard-watchdog.conf >/dev/null
printf 'options softdog soft_margin=60\n' | $SUDO tee /etc/modprobe.d/host-guard-softdog.conf >/dev/null
$SUDO modprobe sp5100_tco 2>/dev/null || true
$SUDO modprobe softdog
softdev=""
for w in /sys/class/watchdog/watchdog*; do
  [ -e "$w/identity" ] || continue
  if [ "$(cat "$w/identity")" = "Software Watchdog" ]; then softdev="/dev/$(basename "$w")"; fi
done
[ -n "$softdev" ] || { echo "no softdog device registered"; exit 1; }
$SUDO install -D -m 0755 "$SCRIPT_DIR/watchdog/root-write" /etc/watchdog.d/root-write
sed "s#__SOFTDOG_DEVICE__#$softdev#" "$SCRIPT_DIR/watchdog/watchdog.conf" | $SUDO tee /etc/watchdog.conf >/dev/null
$SUDO install -D -m 0644 "$SCRIPT_DIR/watchdog/watchdog.service.d.conf" /etc/systemd/system/watchdog.service.d/host-guard.conf
if [ -f /etc/default/watchdog ]; then
  $SUDO sed -i -e 's/^run_watchdog=.*/run_watchdog=1/' -e 's/^watchdog_module=.*/watchdog_module="softdog"/' /etc/default/watchdog
else
  printf 'run_watchdog=1\nrun_wd_keepalive=1\nwatchdog_module="softdog"\nwatchdog_options=""\n' | $SUDO tee /etc/default/watchdog >/dev/null
fi
$SUDO /etc/watchdog.d/root-write test
$SUDO systemctl daemon-reload
$SUDO systemctl enable watchdog >/dev/null 2>&1 || true
$SUDO systemctl restart watchdog
sleep 2

echo "== verify"
printf '  sudo fsfreeze -> %s\n' "$($SUDO sh -c 'command -v fsfreeze')"
if $SUDO -n /usr/sbin/fsfreeze --help >/dev/null 2>&1; then
  echo "  FAIL: sudo /usr/sbin/fsfreeze still allowed"; exit 1
else
  echo "  sudo /usr/sbin/fsfreeze refused by sudoers: ok"
fi
holder="$($SUDO fuser "$softdev" 2>/dev/null | tr -d ' ' || true)"
printf '  %s held by pid %s (%s)\n' "$softdev" "${holder:-none}" "$(ps -o comm= -p "${holder:-1}" 2>/dev/null)"
[ -n "$holder" ] || { echo "  FAIL: watchdog daemon does not hold $softdev"; exit 1; }
printf '  %s timeout=%ss state=%s\n' "$softdev" "$(cat "/sys/class/watchdog/$(basename "$softdev")/timeout")" "$(cat "/sys/class/watchdog/$(basename "$softdev")/state")"

echo "== cli-bridge slice"
if [ -n "${SUDO_USER:-}" ] && [ "$(id -u)" = 0 ]; then
  sudo -u "$SUDO_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$SUDO_USER")" "$SCRIPT_DIR/install-cli-bridge-slice.sh"
else
  "$SCRIPT_DIR/install-cli-bridge-slice.sh"
fi
echo "host guards installed"
