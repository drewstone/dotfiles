#!/usr/bin/env bash
# Install the hostlab reaper as a systemd user timer. Idempotent. No sudo.
#
# The timer runs `hostlab reap` every minute. It stops kept VMs past their
# expiry and runs whose caller exited, then archives their run dirs (see
# claude/tools/hostlab). It needs ~/bin/hostlab, which claude/install.sh links,
# and user lingering so it runs with nobody logged in.
# Log: ~/.cache/hostlab/reap.log plus `journalctl --user -u hostlab-reap`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(uname -s)" = Linux ] || { echo "hostlab-reap: Linux-only; skipped"; exit 0; }
[ -x "$HOME/bin/hostlab" ] || { echo "hostlab-reap: $HOME/bin/hostlab is missing; run claude/install.sh first" >&2; exit 1; }
if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != yes ]; then
  echo "hostlab-reap: lingering is off, so the timer stops at logout; run once: sudo loginctl enable-linger $(id -un)"
fi

unit_dir="$HOME/.config/systemd/user"
install -d "$unit_dir"
install -m 0644 "$SCRIPT_DIR/systemd/hostlab-reap.service" "$unit_dir/hostlab-reap.service"
install -m 0644 "$SCRIPT_DIR/systemd/hostlab-reap.timer" "$unit_dir/hostlab-reap.timer"
systemctl --user daemon-reload
systemctl --user enable --now hostlab-reap.timer >/dev/null
systemctl --user is-active --quiet hostlab-reap.timer
echo "hostlab-reap timer: next run $(systemctl --user show hostlab-reap.timer -p NextElapseUSecRealtime --value)"
