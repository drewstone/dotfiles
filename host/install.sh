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
#   /etc/systemd/system/user.slice.d/50-agent-cap.conf
#   /etc/systemd/system/user@.service.d/60-io-delegate.conf
#                                          every agent process capped together (host/cgroup)
#   /etc/sysctl.d/60-host-guard-writeback.conf
#                                          dirty data bounded, so the watchdog sync stays short
#   /etc/sysctl.d/61-host-guard-vfs-cache.conf
#                                          inodes and dentries kept in preference to file pages
#   /etc/sysctl.d/62-host-guard-inotify.conf
#                                          inotify watch limit sized for one file index per session
#   /etc/modprobe.d/host-usb-storage-quirks.conf
#                                          archive USB bridge off UAS (host/storage)
#   /etc/docker/daemon.json               containers join the capped user.slice; live-restore
#   ~/.config/systemd/user/cli-bridge-llm.slice(.d/10-cpu-cap.conf)
#                                          cli-bridge LLM scopes capped at 24 of 32 cores (GTR only)
#   /etc/systemd/system/ci.slice.d/50-gate-priority.conf, beelink-gate-cgroup.service
#                                          Beelinks: gate CPU/IO weight and memory caps
#   /etc/systemd/system/nix-daemon.service.d/60-nix-profile-requalify.conf
#                                          Beelinks: re-qualify the Nix daemon for profile admission on every start
#   /etc/systemd/resolved.conf.d/60-upstream-tls.conf
#                                          upstream DNS over TLS, so a lost Wi-Fi packet costs ~200 ms
#                                          instead of a 5 s UDP timeout (hosts whose resolv.conf is
#                                          systemd-resolved's stub)
#
# Usage: host/install.sh [--check] [--git-guard-only|--gate-priority-only|--docker-only]
#   --check           report drift and change nothing; exit 1 when anything differs.
#   --git-guard-only  install only the Git PATH guard (GTR), or its worktree cap (Beelinks).
#   --gate-priority-only  Beelinks: install gate CPU and deploy memory isolation.
#   --docker-only     validate and stage only daemon.json; never reload or restart Docker.
#
# Why: see host/lib/host-blast-guard.sh. Re-run after editing anything here.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(uname -s)" = Linux ] || { echo "host/install.sh is Linux-only"; exit 0; }
CHECK=0
INSTALL_SCOPE=
for option in "$@"; do
  case "$option" in
    --check) CHECK=1 ;;
    --git-guard-only|--gate-priority-only|--docker-only)
      [ -z "$INSTALL_SCOPE" ] || { echo "choose one host installer scope" >&2; exit 2; }
      INSTALL_SCOPE=$option ;;
    *) echo "usage: host/install.sh [--check] [--git-guard-only|--gate-priority-only|--docker-only]" >&2; exit 2 ;;
  esac
done
SUDO=sudo
[ "$(id -u)" = 0 ] && SUDO=
# --check never prompts. Without cached sudo, a root-only file reads as drift.
if [ "$CHECK" = 1 ] && [ -n "$SUDO" ]; then SUDO="sudo -n"; fi
DRIFT=0
CHANGED=0
DOCKER_CONFIG_CHANGED=0
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

install_docker_config() {
  local lifecycle owner owner_home owner_uid candidate="$TMP/daemon.json" staged backup
  local -a emitter
  if ! command -v dockerd >/dev/null 2>&1; then
    if [ "$INSTALL_SCOPE" = --docker-only ]; then echo "dockerd is required" >&2; return 1; fi
    return 0
  fi
  # Match the existing user-unit owner convention, including sudo/root callers.
  # sudo -H selects that account's HOME; never read root's copy of its policy.
  if [ "$(id -u)" = 0 ]; then
    owner="${SUDO_USER:-$(stat -c %U "$SCRIPT_DIR")}"
    if ! owner_uid=$(id -u "$owner") || [ "$owner_uid" = 0 ]; then
      echo "cannot identify a non-root lifecycle owner from sudo or checkout ownership" >&2
      return 1
    fi
    owner_home=$(getent passwd "$owner" | cut -d: -f6)
    if [[ "$owner_home" != /* ]]; then echo "lifecycle owner has no absolute home" >&2; return 1; fi
    lifecycle="$owner_home/bin/storage-lifecycle"
    emitter=(sudo -n -H -u "$owner" -- "$lifecycle" --config "$owner_home/.config/storage-lifecycle/config.json")
  else
    lifecycle=$(command -v storage-lifecycle || true)
    emitter=("$lifecycle")
  fi
  # An older/missing emitter must never silently replace a previously capped config.
  if [ -z "$lifecycle" ] || ! "${emitter[@]}" configure-docker --print-daemon-gc >"$TMP/docker-gc.json"; then
    echo "deploy storage-lifecycle with --print-daemon-gc before this installer; Docker config unchanged" >&2
    if [ "$CHECK" = 1 ]; then drift "cannot read lifecycle Docker GC policy"; return 0; fi
    return 1
  fi
  # Canonical daemon.json owns every other field; lifecycle alone owns builder.gc.
  python3 - "$SCRIPT_DIR/docker/daemon.json" "$TMP/docker-gc.json" "$candidate" <<'PY'
import json
import re
import sys
from pathlib import Path

base, gc = (json.loads(Path(path).read_text()) for path in sys.argv[1:3])
if (not isinstance(base, dict) or not isinstance(gc, dict)
        or set(gc) != {'enabled', 'defaultReservedSpace', 'defaultMaxUsedSpace'}
        or gc['enabled'] is not True
        or not isinstance(gc['defaultMaxUsedSpace'], str)
        or not re.fullmatch(r'[1-9][0-9]*B', gc['defaultMaxUsedSpace'])
        or gc['defaultReservedSpace'] != gc['defaultMaxUsedSpace']):
    raise SystemExit('invalid lifecycle Docker GC fragment; Docker config unchanged')
builder = base.setdefault('builder', {})
if not isinstance(builder, dict):
    raise SystemExit('invalid canonical Docker builder config')
builder['gc'] = gc
Path(sys.argv[3]).write_text(json.dumps(base, indent=2, sort_keys=True) + '\n')
PY
  # Validate the complete candidate BEFORE any replacement, including on --check.
  $SUDO dockerd --validate --config-file "$candidate" >/dev/null
  if $SUDO cmp -s "$candidate" /etc/docker/daemon.json 2>/dev/null &&
    [ "$($SUDO stat -c '%a %U' /etc/docker/daemon.json 2>/dev/null)" = '644 root' ]; then
    note pending "Docker GC config staged; verify serving policy with docker buildx inspect before claiming activation"
    return 0
  fi
  if [ "$CHECK" = 1 ]; then drift "/etc/docker/daemon.json"; return 0; fi
  [ ! -L /etc/docker/daemon.json ] || { echo "refusing symlink /etc/docker/daemon.json" >&2; return 1; }
  $SUDO install -d -m 0755 -o root -g root /etc/docker
  if $SUDO test -e /etc/docker/daemon.json; then
    backup=$($SUDO mktemp /etc/docker/daemon.json.pre-host-guard.XXXXXX)
    $SUDO cp -p /etc/docker/daemon.json "$backup"
    note backup "$backup (rollback: restore this file through the host owner before a controlled restart)"
  fi
  staged=$($SUDO mktemp /etc/docker/.daemon.json.host-guard.XXXXXX)
  if ! $SUDO install -m 0644 -o root -g root "$candidate" "$staged" ||
     ! $SUDO mv -T "$staged" /etc/docker/daemon.json; then
    $SUDO rm -f "$staged"
    return 1
  fi
  CHANGED=1
  DOCKER_CONFIG_CHANGED=1
  note changed "/etc/docker/daemon.json validated and staged"
  if [ "$INSTALL_SCOPE" = --docker-only ]; then
    note pending "Docker GC activation needs a controlled restart; no Docker reload or restart performed"
  else
    note pending "Docker GC and cgroup-parent require a controlled restart after the live-restore reload"
  fi
}

if [ "$INSTALL_SCOPE" = --docker-only ]; then
  install_docker_config
  exit "$DRIFT"
fi

# want_link TARGET LINK: LINK is a symlink to TARGET.
want_link() {
  [ "$(readlink "$2" 2>/dev/null)" = "$1" ] && return 0
  if [ "$CHECK" = 1 ]; then drift "$2 -> $1"; return 0; fi
  # Like want_file's install -D: the Beelink cap directory does not exist before the first install.
  $SUDO install -d -m 0755 -o root -g root "$(dirname "$2")"
  $SUDO ln -sfn "$1" "$2"
  note changed "$2 -> $1"
  CHANGED=1
}

install_system_git_guard() {
  # Tailscale noninteractive SSH omits the user PATH but searches /usr/local/bin.
  # Keep this copy root-owned because root can also run Git through this path.
  want_link /usr/bin/git /usr/local/bin/git.gtr-original
  want_file 0755 "$SCRIPT_DIR/gtr-install-guard/guard.py" /usr/local/bin/git
}

# Beelinks run the same Git entrypoint with only its worktree cap: each fleet lane may hold
# `cap` worktrees under _wt, and none are added below the free-space floor. Beelink1
# held 261 _wt worktrees and gained 49 in 6 h; idle reapers cannot touch trees younger than 12 h.
is_beelink() { case "$(hostname -s)" in beelink1|beelink2|DESKTOP-18IR33V) return 0 ;; *) return 1 ;; esac; }

install_beelink_worktree_cap() {
  local cap=/usr/local/lib/beelink-worktree-cap
  # want_link does not create parents; want_file's install -D does.
  [ "$CHECK" = 1 ] || [ -d "$cap" ] || $SUDO install -d -m 0755 -o root -g root "$cap"
  want_link /usr/bin/git "$cap/git.gtr-original"
  want_file 0755 "$SCRIPT_DIR/gtr-install-guard/guard.py" "$cap/git"
  want_file 0644 "$SCRIPT_DIR/gtr-install-guard/beelink-worktree-cap.json" "$cap/git.worktree-cap.json"
  want_file 0755 "$SCRIPT_DIR/gtr-install-guard/beelink-git" /usr/local/bin/git
  # The first install put the Python guard itself at /usr/local/bin/git.
  local stale
  for stale in /usr/local/bin/git.gtr-original /usr/local/bin/git.worktree-cap.json; do
    if [ -e "$stale" ] || [ -L "$stale" ]; then
      if [ "$CHECK" = 1 ]; then drift "$stale"; else $SUDO rm -f "$stale"; note removed "$stale"; fi
    fi
  done
  local before=$CHANGED
  CHANGED=0
  want_file 0644 "$SCRIPT_DIR/ssh/20-fleet-lane-accept.conf" /etc/ssh/sshd_config.d/20-fleet-lane-accept.conf
  if [ "$CHANGED" = 1 ]; then
    # A failed reload must stop here: the next run sees the file in place and would not retry.
    if ! { $SUDO sshd -t && $SUDO systemctl reload ssh; }; then
      echo "sshd rejected or did not reload the fleet-lane drop-in" >&2; exit 1
    fi
    note reloaded ssh
  fi
  [ "$before" = 1 ] && CHANGED=1
  return 0
}

# Beelinks: release/deploy work outranks every merge gate. Apply priority live
# without moving processes or restarting any Actions runner.
install_beelink_gate_priority() {
  local before=$CHANGED ci_weight=25 unit group weight
  CHANGED=0
  # CI and Nix retain their existing validated host override. Gate priority is
  # independently owned by the resource policy below; this does not raise it.
  if [ -r /etc/beelink-gate/ci-weight ]; then
    ci_weight=$(tr -cd '0-9' < /etc/beelink-gate/ci-weight)
    if [[ ! "$ci_weight" =~ ^[0-9]+$ ]] || (( ci_weight < 1 || ci_weight > 10000 )); then
      echo "invalid /etc/beelink-gate/ci-weight" >&2
      exit 1
    fi
  fi
  sed "s/@CI_WEIGHT@/$ci_weight/" "$SCRIPT_DIR/cgroup/50-gate-priority.conf" > "$TMP/ci-priority.conf"
  want_file 0644 "$TMP/ci-priority.conf" /etc/systemd/system/ci.slice.d/50-gate-priority.conf
  sed "s/@CI_WEIGHT@/$ci_weight/" "$SCRIPT_DIR/cgroup/50-nix-daemon-priority.conf" > "$TMP/nix-daemon-priority.conf"
  want_file 0644 "$TMP/nix-daemon-priority.conf" /etc/systemd/system/nix-daemon.service.d/50-gate-priority.conf
  want_file 0755 "$SCRIPT_DIR/cgroup/nix-profile-requalify" /usr/local/libexec/nix-profile-requalify
  want_file 0644 "$SCRIPT_DIR/cgroup/60-nix-profile-requalify.conf" /etc/systemd/system/nix-daemon.service.d/60-nix-profile-requalify.conf
  local gate_cpu gate_io normal_memory dev_memory normal_percent normal_period normal_quota
  read -r gate_cpu gate_io normal_memory dev_memory normal_percent normal_period < <("$SCRIPT_DIR/cgroup/beelink-memory-policy" --read-policy "$SCRIPT_DIR/cgroup/beelink-gate-policy.json")
  [[ "$gate_cpu" =~ ^[0-9]+$ && "$normal_percent" =~ ^[0-9]+$ ]] || exit 1
  normal_quota=$(( $(getconf _NPROCESSORS_ONLN) * normal_percent ))
  want_file 0644 "$SCRIPT_DIR/cgroup/beelink-gate-policy.json" /etc/beelink-gate/resource-policy.json
  printf '[Slice]\nCPUWeight=%s\nIOWeight=%s\n' "$gate_cpu" "$gate_io" > "$TMP/beelinkgate.slice"
  want_file 0644 "$TMP/beelinkgate.slice" /etc/systemd/system/beelinkgate.slice
  {
    cat "$TMP/beelinkgate.slice"
    printf 'MemoryMax=%s\nCPUQuota=%s%%\nCPUQuotaPeriodSec=%sus\n' "$normal_memory" "$normal_quota" "$normal_period"
  } > "$TMP/beelinkgate-normal.slice"
  want_file 0644 "$TMP/beelinkgate-normal.slice" /etc/systemd/system/beelinkgate-normal.slice
  { cat "$TMP/beelinkgate.slice"; printf 'MemoryMax=%s\n' "$dev_memory"; } > "$TMP/beelinkgate-dev.slice"
  want_file 0644 "$TMP/beelinkgate-dev.slice" /etc/systemd/system/beelinkgate-dev.slice
  want_file 0755 "$SCRIPT_DIR/cgroup/beelink-memory-policy" /usr/local/libexec/beelink-memory-policy
  want_file 0644 "$SCRIPT_DIR/cgroup/beelink-gate-cgroup.service" /etc/systemd/system/beelink-gate-cgroup.service
  [ "$CHECK" = 1 ] || [ "$CHANGED" = 0 ] || $SUDO systemctl daemon-reload
  for unit in ci.slice nix-daemon.service; do
    group=$(systemctl show "$unit" -p ControlGroup --value)
    weight=$(systemctl show "$unit" -p CPUWeight --value)
    if [ -n "$group" ]; then weight=$(cat "/sys/fs/cgroup$group/cpu.weight" 2>/dev/null) || weight=
    elif [ "$(systemctl show "$unit" -p ActiveState --value)" != inactive ] || [ "$(systemctl show "$unit" -p LoadState --value)" != loaded ]; then weight=; fi
    [ "$weight" = "$ci_weight" ] && continue
    [ "$CHECK" = 0 ] || { drift "$unit cpu.weight is not $ci_weight"; continue; }
    $SUDO systemctl set-property --runtime "$unit" CPUWeight="$ci_weight"
    note changed "$unit CPUWeight=$ci_weight"
  done
  if [ "$CHECK" = 0 ]; then
    if [ "$CHANGED" = 1 ] || ! systemctl is-active --quiet beelink-gate-cgroup.service; then
      $SUDO systemctl enable --quiet beelink-gate-cgroup.service
      $SUDO systemctl restart beelink-gate-cgroup.service
      note changed 'gate resource policy applied; Actions runners unchanged'
    fi
  fi
  if [ "$CHECK" = 1 ]; then
    $SUDO /usr/local/libexec/beelink-memory-policy --check || drift "Beelink memory policy"
  else
    $SUDO /usr/local/libexec/beelink-memory-policy --apply
  fi
  [ "$before" = 1 ] && CHANGED=1
  return 0
}

install_gtr_lane_send() {
  want_file 0644 "$SCRIPT_DIR/ssh/20-fleet-lane-send.conf" /etc/ssh/ssh_config.d/20-fleet-lane-send.conf
}

if [ "$INSTALL_SCOPE" = --gate-priority-only ]; then
  is_beelink || { echo "the gate CPU priority runs on the Beelinks only" >&2; exit 2; }
  install_beelink_gate_priority
  exit "$DRIFT"
fi
if [ "$INSTALL_SCOPE" = --git-guard-only ]; then
  if is_beelink; then
    install_beelink_worktree_cap
    exit "$DRIFT"
  fi
  [ "$(hostname -s)" = drew-GTR-Pro ] || { echo "the Git guard runs on GTR and the Beelinks only" >&2; exit 2; }
  install_system_git_guard
  install_gtr_lane_send
  exit "$DRIFT"
fi

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

if [ "$(hostname -s)" = drew-GTR-Pro ]; then
  if [ "$CHECK" = 1 ]; then
    python3 "$SCRIPT_DIR/gtr-install-guard/install.py" --check || DRIFT=1
  else
    python3 "$SCRIPT_DIR/gtr-install-guard/install.py"
  fi
  install_system_git_guard
  install_gtr_lane_send
fi
is_beelink && install_beelink_worktree_cap
is_beelink && install_beelink_gate_priority

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

echo "== agent cap and writeback"
# Separate from the watchdog block: a change here reloads systemd and sysctl
# but never restarts the watchdog.
cap_before=$CHANGED; CHANGED=0
want_file 0644 "$SCRIPT_DIR/cgroup/50-agent-cap.conf" /etc/systemd/system/user.slice.d/50-agent-cap.conf
want_file 0644 "$SCRIPT_DIR/cgroup/60-user-io-delegate.conf" /etc/systemd/system/user@.service.d/60-io-delegate.conf
want_file 0644 "$SCRIPT_DIR/cgroup/60-writeback.conf" /etc/sysctl.d/60-host-guard-writeback.conf
want_file 0644 "$SCRIPT_DIR/cgroup/61-vfs-cache.conf" /etc/sysctl.d/61-host-guard-vfs-cache.conf
want_file 0644 "$SCRIPT_DIR/cgroup/62-inotify.conf" /etc/sysctl.d/62-host-guard-inotify.conf
# Containers that agents and CI start join user.slice, under the same cap.
# Full mode retains the existing validated live-restore reload below. GC and
# cgroup-parent still require a controlled restart. --docker-only stages only.
install_docker_config
if [ "$CHECK" = 1 ]; then
  [ "$(systemctl show user.slice -p MemoryMax --value)" = 115964116992 ] || drift "user.slice MemoryMax is not 108G"
  [ "$(sysctl -n vm.dirty_bytes)" = 1073741824 ] || drift "vm.dirty_bytes is not 1 GiB"
  [ "$(sysctl -n vm.vfs_cache_pressure)" = 50 ] || drift "vm.vfs_cache_pressure is not 50"
  [ "$(sysctl -n fs.inotify.max_user_watches)" = 524288 ] || drift "fs.inotify.max_user_watches is not 524288"
  if command -v docker >/dev/null 2>&1 && [ "$(docker info --format "{{.LiveRestoreEnabled}}" 2>/dev/null)" != true ]; then
    drift "dockerd runs without live-restore"
  fi
elif [ "$CHANGED" = 1 ]; then
  $SUDO systemctl daemon-reload
  $SUDO sysctl -q -p /etc/sysctl.d/60-host-guard-writeback.conf
  $SUDO sysctl -q -p /etc/sysctl.d/61-host-guard-vfs-cache.conf
  $SUDO sysctl -q -p /etc/sysctl.d/62-host-guard-inotify.conf
  note changed "user.slice: $(systemctl show user.slice -p MemoryMax -p MemorySwapMax -p CPUWeight | tr "\n" " ")"
  if [ "$DOCKER_CONFIG_CHANGED" = 1 ]; then
    $SUDO systemctl reload docker
    note changed "dockerd reloaded for live-restore; GC and cgroup-parent still require a controlled restart"
  fi
fi
[ "$CHANGED" = 1 ] || CHANGED=$cap_before

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

echo "== USB storage quirks"
# Read when usb-storage next loads; the running disk keeps its driver until then.
want_file 0644 "$SCRIPT_DIR/storage/usb-storage-quirks.conf" /etc/modprobe.d/host-usb-storage-quirks.conf

echo "== DNS"
# Only where systemd-resolved serves resolv.conf: WSL hosts write their own resolv.conf.
if systemctl is-active -q systemd-resolved 2>/dev/null &&
  [ "$(readlink -f /etc/resolv.conf)" = /run/systemd/resolve/stub-resolv.conf ]; then
  dns_before=$CHANGED
  want_file 0644 "$SCRIPT_DIR/dns/60-upstream-tls.conf" /etc/systemd/resolved.conf.d/60-upstream-tls.conf
  if [ "$CHECK" = 0 ] && [ "$CHANGED" != "$dns_before" ]; then
    # resolved cannot reload; NetworkManager and tailscaled push their per-link servers again after a restart.
    $SUDO systemctl restart systemd-resolved
    note changed "restarted systemd-resolved"
  fi
else
  note skipped "resolv.conf is not systemd-resolved's stub"
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
