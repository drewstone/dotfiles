#!/usr/bin/env bash
# Install the host guards on this Linux box. Needs sudo. Idempotent: a second
# run changes no file and restarts nothing.
#
#   /usr/local/lib/host-blast-guard.sh     shared checks
#   /usr/local/sbin/<verb>                 root wrappers; secure_path puts them first
#   /etc/sudoers.d/zz-agent-blast-guard    closes the absolute-path route
#   /etc/watchdog.conf, /etc/watchdog.d/root-write, /etc/default/watchdog,
#   /etc/modprobe.d, udev rule, system.conf.d, watchdog.service drop-in
#                                          a frozen root resets the box in ~4 min (measured)
#   ~/.config/systemd/user/cli-bridge-llm.slice(.d/10-cpu-cap.conf)
#                                          cli-bridge LLM scopes capped at 24 of 32 cores (GTR only)
#
# Usage: host/install.sh [--check]
#   --check   report drift and change nothing; exit 1 when anything differs.
#
# Why: see host/lib/host-blast-guard.sh. Re-run after editing anything here.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(uname -s)" = Linux ] || { echo "host/install.sh is Linux-only"; exit 0; }
CHECK=0
case "${1:-}" in
  --check) CHECK=1 ;;
  '') ;;
  *) echo "usage: host/install.sh [--check]" >&2; exit 2 ;;
esac
SUDO=sudo
[ "$(id -u)" = 0 ] && SUDO=
# --check never prompts. Without cached sudo, a root-only file reads as drift.
if [ "$CHECK" = 1 ] && [ -n "$SUDO" ]; then SUDO="sudo -n"; fi
DRIFT=0
CHANGED=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

LVM_VERBS="pvcreate vgcreate lvcreate lvremove vgremove pvremove lvchange vgchange lvconvert lvresize lvextend lvreduce vgextend vgreduce pvresize vgrename lvrename pvmove lvm"
DEVICE_VERBS="mkfs mkfs.ext2 mkfs.ext3 mkfs.ext4 mkfs.xfs mkfs.btrfs mkfs.vfat mkfs.fat mke2fs mkswap wipefs blkdiscard sgdisk sfdisk fdisk parted dd"
SOFTDOG=/dev/watchdog-softdog

note() { printf '  %-8s %s\n' "$1" "$2"; }
drift() { DRIFT=1; note drift "$1"; }

# want_file MODE SRC DST: DST is a root-owned copy of SRC with MODE.
want_file() {
  local mode="$1" src="$2" dst="$3"
  if $SUDO cmp -s "$src" "$dst" 2>/dev/null &&
    [ "$($SUDO stat -c '%a %U' "$dst" 2>/dev/null)" = "${mode#0} root" ]; then
    return 0
  fi
  if [ "$CHECK" = 1 ]; then drift "$dst"; return 0; fi
  $SUDO install -D -m "$mode" -o root -g root "$src" "$dst"
  note changed "$dst"
  CHANGED=1
}

# want_link TARGET LINK: LINK is a symlink to TARGET.
want_link() {
  [ "$(readlink "$2" 2>/dev/null)" = "$1" ] && return 0
  if [ "$CHECK" = 1 ]; then drift "$2 -> $1"; return 0; fi
  $SUDO ln -sfn "$1" "$2"
  note changed "$2 -> $1"
  CHANGED=1
}

# softdog_holders: PIDs that hold the softdog open, space-separated.
softdog_holders() {
  [ -e "$SOFTDOG" ] || return 0
  $SUDO fuser "$(readlink -f "$SOFTDOG")" 2>/dev/null | tr -s ' ' ' ' | sed 's/^ //; s/ $//' || true
}

# daemon_holds_softdog: exactly one process holds the softdog, and it is the
# watchdog daemon. PID 1 must not hold it.
daemon_holds_softdog() {
  local h
  h="$(softdog_holders)"
  case "$h" in '' | *' '*) return 1 ;; esac
  [ "$h" != 1 ] && [ "$(ps -o comm= -p "$h" 2>/dev/null)" = watchdog ]
}

echo "== wrappers"
want_file 0755 "$SCRIPT_DIR/lib/host-blast-guard.sh" /usr/local/lib/host-blast-guard.sh
for w in fsfreeze unshare mount umount dmsetup lvm-guard device-write-guard; do
  want_file 0755 "$SCRIPT_DIR/sbin/$w" "/usr/local/sbin/$w"
done
for v in $LVM_VERBS; do want_link lvm-guard "/usr/local/sbin/$v"; done
for v in $DEVICE_VERBS; do want_link device-write-guard "/usr/local/sbin/$v"; done

echo "== sudoers"
cp "$SCRIPT_DIR/sudoers.d/zz-agent-blast-guard" "$TMP/sudoers"
if [ "$CHECK" = 0 ]; then $SUDO visudo -cf "$TMP/sudoers" >/dev/null; fi
want_file 0440 "$TMP/sudoers" /etc/sudoers.d/zz-agent-blast-guard
if [ "$CHECK" = 0 ]; then $SUDO visudo -c >/dev/null; fi

echo "== watchdog"
if ! dpkg-query -W -f='${Status}' watchdog 2>/dev/null | grep 'ok installed' >/dev/null; then
  if [ "$CHECK" = 1 ]; then
    drift "package watchdog is not installed"
  else
    $SUDO env DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 \
      apt-get install -y -q -o DPkg::Lock::Timeout=900 watchdog >/dev/null
    note changed "installed package watchdog"
    CHANGED=1
  fi
fi
# Ubuntu's kernel packages blacklist every watchdog driver, and
# systemd-modules-load honours the blacklist, so this file never loaded softdog.
# The watchdog unit loads it by name (watchdog_module below), which the
# blacklist does not stop.
if [ -e /etc/modules-load.d/host-guard-watchdog.conf ]; then
  if [ "$CHECK" = 1 ]; then
    drift "/etc/modules-load.d/host-guard-watchdog.conf is obsolete (softdog is blacklisted there)"
  else
    $SUDO rm -f /etc/modules-load.d/host-guard-watchdog.conf
    note changed "removed /etc/modules-load.d/host-guard-watchdog.conf"
    CHANGED=1
  fi
fi
printf 'options softdog soft_margin=60\n' >"$TMP/softdog.conf"
want_file 0644 "$TMP/softdog.conf" /etc/modprobe.d/host-guard-softdog.conf
want_file 0644 "$SCRIPT_DIR/watchdog/60-host-guard-watchdog.rules" /etc/udev/rules.d/60-host-guard-watchdog.rules
want_file 0644 "$SCRIPT_DIR/watchdog/system.conf.d.conf" /etc/systemd/system.conf.d/90-host-guard-watchdog.conf
want_file 0755 "$SCRIPT_DIR/watchdog/root-write" /etc/watchdog.d/root-write
want_file 0644 "$SCRIPT_DIR/watchdog/watchdog.conf" /etc/watchdog.conf
want_file 0644 "$SCRIPT_DIR/watchdog/watchdog.service.d.conf" /etc/systemd/system/watchdog.service.d/host-guard.conf
if ! grep -qx 'run_watchdog=1' /etc/default/watchdog 2>/dev/null ||
  ! grep -qx 'watchdog_module="softdog"' /etc/default/watchdog 2>/dev/null; then
  if [ "$CHECK" = 1 ]; then
    drift "/etc/default/watchdog does not run the daemon with softdog"
  else
    if [ -f /etc/default/watchdog ]; then
      $SUDO sed -i -e 's/^run_watchdog=.*/run_watchdog=1/' -e 's/^watchdog_module=.*/watchdog_module="softdog"/' /etc/default/watchdog
    else
      printf 'run_watchdog=1\nrun_wd_keepalive=1\nwatchdog_module="softdog"\nwatchdog_options=""\n' | $SUDO tee /etc/default/watchdog >/dev/null
    fi
    note changed /etc/default/watchdog
    CHANGED=1
  fi
fi

if [ "$CHECK" = 1 ]; then
  systemctl is-enabled --quiet watchdog 2>/dev/null || drift "watchdog.service is not enabled"
  if [ ! -e "$SOFTDOG" ]; then
    drift "$SOFTDOG does not exist"
  elif ! daemon_holds_softdog; then
    drift "$SOFTDOG is held by pid '$(softdog_holders)', not the watchdog daemon"
  fi
else
  $SUDO /etc/watchdog.d/root-write test
  if [ "$CHANGED" = 1 ]; then
    $SUDO systemctl daemon-reload
    $SUDO udevadm control --reload
  fi
  $SUDO modprobe softdog
  if [ ! -e "$SOFTDOG" ]; then
    $SUDO udevadm trigger --action=add --subsystem-match=watchdog
    $SUDO udevadm settle --timeout=30
  fi
  [ -e "$SOFTDOG" ] || { echo "  FAIL: $SOFTDOG did not appear"; exit 1; }
  if systemctl is-enabled --quiet watchdog 2>/dev/null; then :; else
    $SUDO systemctl enable watchdog >/dev/null 2>&1
    note changed "enabled watchdog.service"
  fi
  if [ "$(softdog_holders)" = 1 ]; then
    # PID 1 reads WatchdogDevice only when it starts. Re-executing it applies
    # the pin to the hardware timer; it disarms the softdog before it lets go.
    $SUDO systemctl daemon-reexec
    note changed "re-executed PID 1 so it releases the softdog"
  fi
  if [ "$CHANGED" = 1 ] || ! daemon_holds_softdog; then
    $SUDO systemctl restart watchdog
    note changed "restarted watchdog.service"
  fi
  for _ in 1 2 3 4 5 6 7 8 9 10; do daemon_holds_softdog && break; sleep 1; done
fi

echo "== cli-bridge slice"
# The 24-of-32-core cap is sized for drew-gtr-pro; other boxes skip it.
if [ "$(hostname | tr '[:upper:]' '[:lower:]')" = drew-gtr-pro ]; then
  slice_args=()
  [ "$CHECK" = 1 ] && slice_args=(--check)
  if [ "$(id -u)" = 0 ]; then
    # The slice is a user unit of the account that owns this checkout.
    owner="${SUDO_USER:-$(stat -c %U "$SCRIPT_DIR")}"
    if [ "$owner" = root ]; then echo "  FAIL: cannot tell which account owns the cli-bridge slice"; exit 1; fi
    slice=(sudo -u "$owner" XDG_RUNTIME_DIR="/run/user/$(id -u "$owner")" "$SCRIPT_DIR/install-cli-bridge-slice.sh")
  else
    slice=("$SCRIPT_DIR/install-cli-bridge-slice.sh")
  fi
  if ! "${slice[@]}" "${slice_args[@]}"; then
    if [ "$CHECK" = 1 ]; then DRIFT=1; else exit 1; fi
  fi
else
  note skipped "not drew-gtr-pro"
fi

echo "== verify"
# Root itself is not bound by sudoers, so this check needs a non-root caller.
if [ -n "$SUDO" ] && sudo -n /usr/sbin/fsfreeze --help >/dev/null 2>&1; then
  echo "  FAIL: sudo /usr/sbin/fsfreeze still allowed"
  exit 1
fi
if [ "$CHECK" = 1 ]; then
  [ "$DRIFT" = 0 ] || { echo "host guards: drift found"; exit 1; }
  echo "host guards: no drift"
  exit 0
fi
printf '  sudo fsfreeze -> %s\n' "$($SUDO sh -c 'command -v fsfreeze')"
holder="$(softdog_holders)"
dev="$(readlink -f "$SOFTDOG")"
printf '  %s (%s) held by pid %s (%s)\n' "$SOFTDOG" "$dev" "${holder:-none}" "$(ps -o comm= -p "${holder:-0}" 2>/dev/null)"
daemon_holds_softdog || { echo "  FAIL: the watchdog daemon does not hold $SOFTDOG"; exit 1; }
printf '  timeout=%ss state=%s\n' "$(cat "/sys/class/watchdog/$(basename "$dev")/timeout")" "$(cat "/sys/class/watchdog/$(basename "$dev")/state")"
echo "host guards installed"
