#!/usr/bin/env bash
# Install the hostlab reaper as a systemd user timer. Idempotent. No sudo.
#
# The timer runs `hostlab reap` every minute. It stops kept VMs past their
# expiry and runs whose caller exited, then archives their run dirs (see
# claude/tools/hostlab). It needs ~/bin/hostlab, which claude/install.sh links,
# and user lingering so it runs with nobody logged in.
# With HOSTLAB_HOME set, also install an instance for that directory. The
# default timer stays enabled for callers that do not override HOSTLAB_HOME.
# Log: ~/.cache/hostlab/reap.log plus `journalctl --user -u hostlab-reap`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(uname -s)" = Linux ] || { echo "hostlab-reap: Linux-only; skipped"; exit 0; }
[ -x "$HOME/bin/hostlab" ] || { echo "hostlab-reap: $HOME/bin/hostlab is missing; run claude/install.sh first" >&2; exit 1; }
instance=
if [ -n "${HOSTLAB_HOME:-}" ]; then
  case "$HOSTLAB_HOME" in
    /*) ;;
    *) echo "hostlab-reap: HOSTLAB_HOME must be an absolute path" >&2; exit 1 ;;
  esac
  case "$HOSTLAB_HOME" in
    *$'\n'*|*$'\r'*) echo "hostlab-reap: HOSTLAB_HOME must be one line" >&2; exit 1 ;;
  esac
  hostlab_home=$(realpath -m -- "$HOSTLAB_HOME")
  if [ "$hostlab_home" != "$(realpath -m -- "$HOME/.cache/hostlab")" ]; then
    instance=$(systemd-escape --path --template=hostlab-reap@.service -- "$hostlab_home")
  fi
fi
if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != yes ]; then
  echo "hostlab-reap: lingering is off, so the timer stops at logout; run once: sudo loginctl enable-linger $(id -un)"
fi

unit_dir="$HOME/.config/systemd/user"
install -d "$unit_dir"
install -m 0644 "$SCRIPT_DIR/systemd/hostlab-reap.service" "$unit_dir/hostlab-reap.service"
install -m 0644 "$SCRIPT_DIR/systemd/hostlab-reap.timer" "$unit_dir/hostlab-reap.timer"
# Both forms use the same maintained units. Later ordinary installs refresh
# every configured instance without needing its HOSTLAB_HOME again.
install -m 0644 "$SCRIPT_DIR/systemd/hostlab-reap.service" "$unit_dir/hostlab-reap@.service"
install -m 0644 "$SCRIPT_DIR/systemd/hostlab-reap.timer" "$unit_dir/hostlab-reap@.timer"
# A host with no archive drive at all (the Beelinks have no /mnt/traces) keeps
# expired runs' logs and small artifacts on its own disk and deletes the VM
# disks; without this, every expired run stayed in place (62 GiB on beelink2).
# GTR keeps its rule: when its drive is missing, runs stay put.
for service in hostlab-reap.service hostlab-reap@.service; do
  dropin="$unit_dir/$service.d/50-small-archive.conf"
  if [ ! -d /mnt/traces ]; then
    install -d "$(dirname "$dropin")"
    printf '[Service]\nEnvironment=HOSTLAB_SMALL_ARCHIVE=%%h/.local/state/hostlab-archive\n' > "$dropin"
  else
    rm -f "$dropin"
  fi
done
if [ -n "$instance" ]; then
  dropin="$unit_dir/$instance.d/50-home.conf"
  install -d "$(dirname "$dropin")"
  # Environment= has systemd quoting and specifier rules, not shell rules.
  escaped_home=${hostlab_home//\\/\\\\}
  escaped_home=${escaped_home//\"/\\\"}
  escaped_home=${escaped_home//%/%%}
  printf '[Service]\nEnvironment="HOSTLAB_HOME=%s"\n' "$escaped_home" > "$dropin"
fi
systemctl --user daemon-reload
systemctl --user enable --now hostlab-reap.timer >/dev/null
systemctl --user is-active --quiet hostlab-reap.timer
echo "hostlab-reap timer: next run $(systemctl --user show hostlab-reap.timer -p NextElapseUSecRealtime --value)"
if [ -n "$instance" ]; then
  timer="${instance%.service}.timer"
  systemctl --user enable --now "$timer" >/dev/null
  systemctl --user is-active --quiet "$timer"
  echo "$timer: HOSTLAB_HOME=$hostlab_home; next run $(systemctl --user show "$timer" -p NextElapseUSecRealtime --value)"
fi
